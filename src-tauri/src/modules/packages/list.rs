//! Listagem de pacotes com detalhes.
//!
//! Estratégia (uma rodada de `dumpsys` + listas leves):
//! - `dumpsys package packages` → pacote, codePath, versionCode/Name, min/target
//!   sdk, install/update time, flags SYSTEM.
//! - `pm list packages -d` → conjunto desabilitado.
//! - `du -sk /data/app/*/*` → tamanho total por diretório de APK.
//!
//! Resultado é cacheado em memória por 60s (a chamada completa custa ~2-4s).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::packages::AppInfo;

const CACHE_TTL: u64 = 60;

static CACHE: OnceLock<Mutex<HashMap<String, (Instant, Vec<AppInfo>)>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, (Instant, Vec<AppInfo>)>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Lista pacotes do dispositivo. `force` ignora o cache.
pub fn list_packages(runner: &AdbRunner, serial: &str, force: bool) -> Result<Vec<AppInfo>, AppError> {
    if !force {
        let guard = cache().lock().unwrap();
        if let Some((at, list)) = guard.get(serial) {
            if at.elapsed().as_secs() < CACHE_TTL {
                return Ok(list.clone());
            }
        }
    }

    let apps = collect(runner, serial)?;
    cache().lock().unwrap().insert(serial.to_string(), (Instant::now(), apps.clone()));
    Ok(apps)
}

fn collect(runner: &AdbRunner, serial: &str) -> Result<Vec<AppInfo>, AppError> {
    // 1) Bloco completo de pacotes.
    let dump = runner.run_serial(serial, &["shell", "dumpsys", "package", "packages"])?;
    if dump.exit_code != Some(0) && dump.exit_code != Some(1) {
        return Err(AppError::with_detail(
            "Failed to read package list from device.",
            dump.stderr,
        ));
    }
    let mut apps = parse_dump(&dump.stdout);

    // 2) Conjunto desabilitado.
    let disabled = runner
        .run_serial(serial, &["shell", "pm", "list", "packages", "-d"])?
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    for app in apps.iter_mut() {
        app.disabled = disabled.contains(&app.package);
    }

    // 3) Tamanhos (diretórios de APK, pode haver splits).
    let du = runner.run_serial(
        serial,
        &["shell", "du", "-sk", "/data/app/*/*", "/data/app-1/*/*"],
    )?;
    let mut sizes: HashMap<String, u64> = HashMap::new();
    for line in du.stdout.lines() {
        let mut it = line.trim().splitn(2, char::is_whitespace);
        let (Some(kb), Some(path)) = (it.next(), it.next()) else { continue };
        let Ok(kb) = kb.parse::<u64>() else { continue };
        let key = path.rsplit('/').next().unwrap_or(path);
        *sizes.entry(key.to_string()).or_insert(0) += kb * 1024;
    }
    for app in apps.iter_mut() {
        let dir_name = app.code_path.trim_end_matches('/').rsplit('/').next().unwrap_or("");
        app.size_bytes = sizes.get(dir_name).copied().unwrap_or(0);
    }

    Ok(apps)
}

/// Parseia `dumpsys package packages` (blocos `Package [nome]`).
fn parse_dump(output: &str) -> Vec<AppInfo> {
    let mut apps: Vec<AppInfo> = Vec::new();
    let mut current: Option<AppInfo> = None;

    for line in output.lines() {
        if let Some(rest) = line.trim_start().strip_prefix("Package [") {
            if let Some(name) = rest.split(']').next() {
                if let Some(prev) = current.take() {
                    apps.push(prev);
                }
                current = Some(AppInfo {
                    package: name.to_string(),
                    code_path: name.to_string(),
                    ..Default::default()
                });
                continue;
            }
        }
        let Some(app) = current.as_mut() else { continue };
        let line = line.trim_start();
        if let Some(v) = strip_kv(line, "codePath=") {
            app.code_path = v.trim().to_string();
        } else if let Some(v) = strip_kv(line, "versionCode=") {
            if let Some(num) = first_number(v) {
                app.version_code = Some(num);
            }
            app.min_sdk = find_number_after(v, "minSdk=");
            app.target_sdk = find_number_after(v, "targetSdk=");
        } else if let Some(v) = strip_kv(line, "versionName=") {
            app.version_name = v.trim().to_string();
        } else if let Some(v) = strip_kv(line, "firstInstallTime=") {
            let clean = v.trim();
            app.install_date = if clean.starts_with("2008-12-31") {
                None
            } else {
                Some(clean.to_string())
            };
        } else if let Some(v) = strip_kv(line, "lastUpdateTime=") {
            let clean = v.trim();
            app.update_date = if clean.starts_with("2008-12-31") {
                None
            } else {
                Some(clean.to_string())
            };
        } else if let Some(v) = strip_kv(line, "flags=") {
            app.is_system = v.contains("SYSTEM") || v.contains("SYSTEM_EXT");
        } else if let Some(v) = strip_kv(line, "pkgFlags=") {
            app.is_system = v.contains("SYSTEM") || v.contains("SYSTEM_EXT");
        }
    }
    if let Some(prev) = current.take() {
        apps.push(prev);
    }
    apps
}

fn strip_kv<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    line.strip_prefix(key).map(|rest| rest.trim_start())
}

fn first_number(s: &str) -> Option<i64> {
    s.split_whitespace().next().and_then(|t| t.parse::<i64>().ok())
}

/// Extrai `key=<número>` do restante de uma linha composta
/// (ex.: `123 minSdk=26 targetSdk=34`).
fn find_number_after(s: &str, key: &str) -> Option<i64> {
    s.split_whitespace()
        .find(|t| t.starts_with(key))
        .and_then(|t| t.strip_prefix(key))
        .and_then(|v| v.parse::<i64>().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dump_blocks() {
        let dump = "\
Packages:
  Package [com.foo.bar] (123456):
    userId=10001 gids=[10001]
    versionCode=42 minSdk=26 targetSdk=34
    versionName=1.2.3
    firstInstallTime=2024-01-01 10:00:00
    lastUpdateTime=2024-02-02 11:00:00
    flags=[ SYSTEM ] PRIVILEGED
    codePath=/data/app/~~abc/com.foo.bar-1/base.apk
  Package [com.baz] (999):
    versionCode=1
";
        let apps = parse_dump(dump);
        assert_eq!(apps.len(), 2);
        let foo = &apps[0];
        assert_eq!(foo.package, "com.foo.bar");
        assert_eq!(foo.version_code, Some(42));
        assert_eq!(foo.min_sdk, Some(26));
        assert_eq!(foo.target_sdk, Some(34));
        assert_eq!(foo.version_name, "1.2.3");
        assert!(foo.is_system);
        assert_eq!(foo.code_path, "/data/app/~~abc/com.foo.bar-1/base.apk");
        assert_eq!(apps[1].is_system, false);
    }
}
