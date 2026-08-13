//! Backup e restauração de aplicativos (Fase 4).
//!
//! Estrutura no disco:
//! ```text
//! <dest_dir>/<serial>_<timestamp>/
//!   manifest.json        # metadados do backup
//!   apks/<pkg>/...       # APKs (base + splits)
//!   data/<pkg>/...       # dados do app (requer root / run-as)
//! ```
//!
//! Regras do projeto: ADB sempre via spawn estruturado; erros amigáveis
//! (AppError message + detail).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::packages::actions;

/// Resumo de um backup criado.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub dir: String,
    pub timestamp: String,
    pub packages: Vec<String>,
    pub apk_count: usize,
    pub data_dirs: Vec<String>,
}

/// Metadados persistidos no manifest.json de cada backup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub serial: String,
    pub timestamp: String,
    pub packages: Vec<String>,
    pub apks: Vec<String>,
    pub data: Vec<String>,
    pub tool: String,
}

/// Entrada da lista de backups (para a tela Backups).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub dir: String,
    pub name: String,
    pub serial: String,
    pub timestamp: String,
    pub package_count: usize,
    pub apk_count: usize,
    pub has_data: bool,
}

fn now_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dt = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = dt;
    // YYYYMMDD-HHMMSS a partir de epoch (suficiente para nome único/legível).
    let days = secs / 86400;
    let (y, m, d) = civil_from_days(days as i64);
    let rem = secs % 86400;
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    format!("{y}{m:02}{d:02}-{hh:02}{mm:02}{ss:02}")
}

/// Conversão dias->data civil (algoritmo Howard Hinnant).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    ((if m <= 2 { y + 1 } else { y }), m, d)
}

fn safe_name(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Verifica se o device tem root.
fn has_root(runner: &AdbRunner, serial: &str) -> bool {
    runner
        .shell(serial, "which su")
        .map(|out| out.is_ok() && !out.stdout_trimmed().is_empty())
        .unwrap_or(false)
}

/// Cria um backup dos pacotes selecionados.
///
/// - `include_apk`: exporta os APKs (pm path + pull).
/// - `include_data`: tenta copiar /data/data/<pkg> (root) ou via run-as.
pub fn create_backup(
    runner: &AdbRunner,
    serial: &str,
    packages: &[String],
    dest_dir: &str,
    include_apk: bool,
    include_data: bool,
) -> Result<BackupSummary, AppError> {
    if packages.is_empty() {
        return Err(AppError::new("No packages selected for backup."));
    }

    let stamp = now_stamp();
    let name = format!("{}_{}", safe_name(serial), stamp);
    let root = PathBuf::from(dest_dir).join(&name);
    fs::create_dir_all(root.join("apks")).map_err(|e| {
        AppError::with_detail(format!("Cannot create backup dir: {}", root.display()), e.to_string())
    })?;
    if include_data {
        fs::create_dir_all(root.join("data")).ok();
    }

    let rooted = include_data && has_root(runner, serial);

    let mut apks: Vec<String> = Vec::new();
    let mut data_dirs: Vec<String> = Vec::new();

    for pkg in packages {
        if include_apk {
            let pkg_dir = root.join("apks").join(safe_name(pkg));
            fs::create_dir_all(&pkg_dir).ok();
            let files = actions::export_apk(runner, serial, pkg, pkg_dir.to_str().unwrap())?;
            for f in files {
                apks.push(format!("apks/{}/{f}", safe_name(pkg)));
            }
        }
        if include_data {
            match backup_app_data(runner, serial, pkg, &root, rooted) {
                Ok(Some(rel)) => data_dirs.push(rel),
                Ok(None) => {}
                Err(e) => return Err(e),
            }
        }
    }

    let manifest = BackupManifest {
        serial: serial.to_string(),
        timestamp: stamp.clone(),
        packages: packages.to_vec(),
        apks: apks.clone(),
        data: data_dirs.clone(),
        tool: "aqm".into(),
    };
    let manifest_path = root.join("manifest.json");
    fs::write(&manifest_path, serde_json::to_string_pretty(&manifest).unwrap()).map_err(|e| {
        AppError::with_detail("Failed to write manifest.json".to_string(), e.to_string())
    })?;

    Ok(BackupSummary {
        dir: root.to_string_lossy().to_string(),
        timestamp: stamp,
        packages: packages.to_vec(),
        apk_count: apks.len(),
        data_dirs,
    })
}

/// Copia os dados do app (dir data do pacote) para data/<pkg>.
/// Retorna o caminho relativo se conseguiu, None se não há dados/permissoes.
fn backup_app_data(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    root: &Path,
    rooted: bool,
) -> Result<Option<String>, AppError> {
    let src = format!("/data/data/{pkg}");
    let tmp = format!("/data/local/tmp/aqm_bk_{pkg}");
    let _ = runner.shell(serial, &format!("rm -rf {tmp}"));

    let copied = if rooted {
        // cp via su (root). Não usa sh -c: `su -c` recebe comando como arg.
        let out = runner.run_serial(
            serial,
            &["shell", "su", "-c", &format!("cp -r {src} {tmp} && chmod -R 755 {tmp}")],
        );
        out.map(|o| o.is_ok()).unwrap_or(false)
    } else {
        // run-as (apps debuggable).
        let out = runner.run_serial(
            serial,
            &["shell", "run-as", pkg, "cp", "-r", &src, &tmp],
        );
        out.map(|o| o.is_ok()).unwrap_or(false)
    };

    if !copied {
        return Ok(None);
    }

    // Ajusta dono para poder ler via adb pull.
    let _ = runner.shell(serial, &format!("chmod -R 755 {tmp}"));

    let dest = root.join("data").join(safe_name(pkg));
    fs::create_dir_all(&dest).ok();
    let out = runner.run_serial(serial, &["pull", &tmp, dest.to_str().unwrap()])?;
    let _ = runner.shell(serial, &format!("rm -rf {tmp}"));
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("adb pull failed for data of {pkg}"),
            out.stderr,
        ));
    }
    Ok(Some(format!("data/{}", safe_name(pkg))))
}

/// Lista backups existentes em um diretório base.
pub fn list_backups(base_dir: &str) -> Vec<BackupEntry> {
    let mut out = Vec::new();
    let base = PathBuf::from(base_dir);
    let Ok(entries) = fs::read_dir(&base) else {
        return out;
    };
    for e in entries.flatten() {
        let dir = e.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join("manifest.json");
        let Ok(raw) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(m) = serde_json::from_str::<BackupManifest>(&raw) else {
            continue;
        };
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        out.push(BackupEntry {
            dir: dir.to_string_lossy().to_string(),
            name,
            serial: m.serial,
            timestamp: m.timestamp,
            package_count: m.packages.len(),
            apk_count: m.apks.len(),
            has_data: !m.data.is_empty(),
        });
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    out
}

/// Restaura APKs de um backup em um device.
/// `packages` limita a restauração; vazio restaura tudo.
pub fn restore_backup(
    runner: &AdbRunner,
    serial: &str,
    backup_dir: &str,
    packages: &[String],
) -> Result<Vec<String>, AppError> {
    let root = PathBuf::from(backup_dir);
    let raw = fs::read_to_string(root.join("manifest.json"))
        .map_err(|e| AppError::with_detail("Backup manifest not found.".to_string(), e.to_string()))?;
    let m: BackupManifest = serde_json::from_str(&raw)
        .map_err(|e| AppError::with_detail("Invalid backup manifest.".to_string(), e.to_string()))?;

    let mut restored = Vec::new();
    for pkg in &m.packages {
        if !packages.is_empty() && !packages.contains(pkg) {
            continue;
        }
        let apk_dir = root.join("apks").join(safe_name(pkg));
        let apks: Vec<String> = match fs::read_dir(&apk_dir) {
            Ok(entries) => entries
                .flatten()
                .filter(|e| e.path().extension().is_some_and(|x| x == "apk"))
                .map(|e| e.path().to_string_lossy().to_string())
                .collect(),
            Err(_) => Vec::new(),
        };
        if apks.is_empty() {
            restored.push(format!("{pkg} (no APK in backup)"));
            continue;
        }
        // Instala (replace) e restaura dados se houver.
        install_and_restore_data(runner, serial, pkg, &apks, &root)?;
        restored.push(pkg.clone());
    }
    Ok(restored)
}

fn install_and_restore_data(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    apks: &[String],
    root: &Path,
) -> Result<(), AppError> {
    // 1) Instala APKs.
    if apks.len() > 1 {
        let mut args = vec!["install-multiple".to_string(), "-r".to_string()];
        args.extend(apks.iter().cloned());
        let out = runner.run_for_serial(serial, &args)?;
        if out.exit_code != Some(0) {
            return Err(AppError::with_detail(
                format!("Install failed for {pkg}"),
                out.stderr,
            ));
        }
    } else {
        let out = runner.run_for_serial(
            serial,
            &["install".to_string(), "-r".to_string(), apks[0].clone()],
        )?;
        if out.exit_code != Some(0) {
            return Err(AppError::with_detail(
                format!("Install failed for {pkg}"),
                out.stderr,
            ));
        }
    }

    // 2) Restaura dados se o backup tiver.
    let data_dir = root.join("data").join(safe_name(pkg));
    if data_dir.is_dir() {
        let tmp = format!("/data/local/tmp/aqm_bk_restore_{pkg}");
        let _ = runner.shell(serial, &format!("rm -rf {tmp}"));
        let out = runner.run_serial(serial, &["push", data_dir.to_str().unwrap(), &tmp])?;
        if out.exit_code != Some(0) {
            return Err(AppError::with_detail(
                format!("Failed to push data for {pkg}"),
                out.stderr,
            ));
        }
        // Move data para o lugar (run-as se possível).
        let src = format!("{tmp}/{}", safe_name(pkg));
        let dest = format!("/data/data/{pkg}");
        let moved = runner
            .run_serial(
                serial,
                &["shell", "run-as", pkg, "sh", "-c", &format!("cp -r {src}/. {dest}/")],
            )
            .map(|o| o.is_ok())
            .unwrap_or(false);
        if !moved {
            let _ = runner.shell(serial, &format!("rm -rf {tmp}"));
            return Err(AppError::with_detail(
                format!("Could not restore data for {pkg}"),
                "run-as requires a debuggable app. Root the device to restore app data.",
            ));
        }
        let _ = runner.shell(serial, &format!("rm -rf {tmp}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamp_shape() {
        let s = now_stamp();
        assert_eq!(s.len(), 15); // YYYYMMDD-HHMMSS
        assert_eq!(&s[8..9], "-");
    }

    #[test]
    fn civil_date_basics() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19723), (2024, 1, 1));
    }

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("com.foo.bar"), "com.foo.bar");
        assert_eq!(safe_name("a/b"), "a_b");
    }
}
