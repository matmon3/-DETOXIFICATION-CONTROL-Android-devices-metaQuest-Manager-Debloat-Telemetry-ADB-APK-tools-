//! Ações sobre pacotes instalados: launch, force-stop, clear data/cache,
//! disable/enable, uninstall, export do APK e grant/revoke de permissões.
//!
//! Regra do projeto: ADB sempre via `process spawn` estruturado (nunca `sh -c`).
//! Nomes de pacote não precisam de quoting (regex `[a-zA-Z0-9._]`).

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

/// Inicia o app com a activity de LAUNCHER via monkey.
pub fn launch(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let out = runner.run_serial(
        serial,
        &["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"],
    )?;
    check_result(&out, "Failed to launch app", None)
}

/// Encerra o app.
pub fn force_stop(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "am", "force-stop", pkg])?;
    check_result(&out, "Failed to stop app", None)
}

/// Limpa dados (pm clear). Irreversível.
pub fn clear_data(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "pm", "clear", pkg])?;
    let stdout = out.stdout.trim();
    if stdout == "Failed" {
        return Err(AppError::new(format!(
            "pm clear failed for {pkg}. App may be running or protected."
        )));
    }
    check_result(&out, "Failed to clear app data", Some("Success".into()))
}

/// Limpa apenas o cache via run-as (funciona para apps debuggable).
pub fn clear_cache(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let cache_path = format!("/data/user/0/{pkg}/cache");
    let out = runner.run_serial(
        serial,
        &["shell", "run-as", pkg, "rm", "-rf", &cache_path],
    )?;
    if out.stdout.trim().contains("unknown package") || out.stderr.contains("unknown package") {
        return Err(AppError::with_detail(
            format!("Cannot access cache of {pkg}"),
            "run-as requires a debuggable app. For non-debuggable apps, use 'Clear data' or a rooted device.",
        ));
    }
    check_result(&out, "Failed to clear cache", None)
}

/// Desabilita o pacote para o usuário 0.
pub fn disable(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "pm", "disable-user", "--user", "0", pkg])?;
    check_result(&out, "Failed to disable app", None)
}

/// Re-habilita o pacote.
pub fn enable(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "pm", "enable", "--user", "0", pkg])?;
    check_result(&out, "Failed to enable app", None)
}

/// Desinstala. `system` = desinstala apenas do usuário (apps de sistema não
/// podem ser removidos por completo sem root).
pub fn uninstall(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    system: bool,
) -> Result<(), AppError> {
    let mut args = vec!["uninstall".to_string()];
    if system {
        args.push("--user".into());
        args.push("0".into());
    }
    args.push(pkg.to_string());
    let out = runner.run_for_serial(serial, &args)?;
    let stderr = out.stderr.trim();
    let stdout = out.stdout.trim();
    if stdout == "Failure" || stdout.contains("not installed for") {
        return Err(AppError::with_detail(
            format!("Failed to uninstall {pkg}"),
            stderr,
        ));
    }
    check_result(&out, "Failed to uninstall app", Some("Success".into()))
}

/// Exporta o APK (base + splits) do pacote para um diretório local.
pub fn export_apk(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    dest_dir: &str,
) -> Result<Vec<String>, AppError> {
    let out = runner.run_serial(serial, &["shell", "pm", "path", pkg])?;
    if out.exit_code != Some(0) && out.exit_code != Some(1) {
        return Err(AppError::with_detail(
            format!("Failed to resolve path for {pkg}"),
            out.stderr,
        ));
    }
    let paths: Vec<String> = out
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect();
    if paths.is_empty() {
        return Err(AppError::new(format!("No APK path found for {pkg}")));
    }
    // Apenas caminhos de filesystem reais são exportáveis sem root.
    let fs_paths: Vec<&String> = paths
        .iter()
        .filter(|p| p.starts_with('/'))
        .collect();
    if fs_paths.is_empty() {
        return Err(AppError::with_detail(
            format!("Cannot export {pkg}"),
            "This app only exposes APK via content provider, which requires a rooted device.",
        ));
    }

    let dest = PathBuf::from(dest_dir);
    fs::create_dir_all(&dest).map_err(|e| {
        AppError::with_detail(format!("Cannot create export dir: {dest_dir}"), e.to_string())
    })?;

    let mut exported = Vec::new();
    for apk in fs_paths {
        let file_name = Path::new(apk)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("{pkg}.apk"));
        let target = dest.join(&file_name);
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
        let out = runner.run_serial(serial, &["pull", apk, target.to_str().unwrap()])?;
        if out.exit_code != Some(0) {
            return Err(AppError::with_detail(
                format!("adb pull failed for {apk}"),
                out.stderr,
            ));
        }
        exported.push(file_name);
    }
    Ok(exported)
}

/// Abre a tela de informações do app nas configurações.
pub fn open_app_info(runner: &AdbRunner, serial: &str, pkg: &str) -> Result<(), AppError> {
    let uri = format!("package:{pkg}");
    let out = runner.run_serial(
        serial,
        &["shell", "am", "start", "-a", "android.settings.APPLICATION_DETAILS_SETTINGS", "-d", &uri],
    )?;
    check_result(&out, "Failed to open app settings", None)
}

/// Concede uma permissão runtime.
pub fn grant_permission(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    perm: &str,
) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "pm", "grant", pkg, perm])?;
    if out.stderr.contains("not a changeable permission type") || out.stdout.contains("not a changeable permission type") {
        return Err(AppError::with_detail(
            format!("Cannot grant {perm}"),
            "Only runtime permissions can be granted via pm grant.",
        ));
    }
    check_result(&out, "Failed to grant permission", None)
}

/// Revoga uma permissão runtime.
pub fn revoke_permission(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    perm: &str,
) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "pm", "revoke", pkg, perm])?;
    if out.stderr.contains("not a changeable permission type") || out.stdout.contains("not a changeable permission type") {
        return Err(AppError::with_detail(
            format!("Cannot revoke {perm}"),
            "Only runtime permissions can be revoked via pm revoke.",
        ));
    }
    check_result(&out, "Failed to revoke permission", None)
}

fn check_result(out: &crate::modules::adb::executor::CmdOut, msg: &str, expect: Option<&str>) -> Result<(), AppError> {
    if let Some(exp) = expect {
        if out.stdout.trim() != exp {
            return Err(AppError::with_detail(msg.to_string(), out.stderr.clone()));
        }
    } else if out.exit_code == Some(1) {
        // Exit 1 é comum em comandos de sucesso (monkey às vezes retorna 1).
        return Err(AppError::with_detail(msg.to_string(), out.stderr.clone()));
    }
    Ok(())
}
