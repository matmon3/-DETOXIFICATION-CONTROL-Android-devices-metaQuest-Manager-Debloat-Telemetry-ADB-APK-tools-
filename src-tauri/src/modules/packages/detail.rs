//! Detalhes de um pacote: `dumpsys package <pkg>` + estado de permissões.

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::packages::{PackageDetail, PermissionState};

/// Data sentinela de "firstInstallTime" não informado.
const EPOCH_SENTINEL: &str = "2008-12-31";

/// Detalhes completos de um pacote instalado.
pub fn package_detail(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
) -> Result<PackageDetail, AppError> {
    let dump = runner.run_serial(serial, &["shell", "dumpsys", "package", pkg])?;
    if dump.exit_code != Some(0) && dump.exit_code != Some(1) {
        return Err(AppError::with_detail(
            format!("Failed to read details for {pkg}"),
            dump.stderr,
        ));
    }

    let mut detail = PackageDetail {
        package: pkg.to_string(),
        ..Default::default()
    };

    let mut in_requested = false;
    let mut in_install = false;
    let mut perms: Vec<PermissionState> = Vec::new();

    for line in dump.stdout.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            continue;
        }
        match trimmed {
            t if t.starts_with("appId=") => {
                detail.uid = number_after(t, "appId=");
            }
            t if t.starts_with("codePath=") => {
                detail.code_path = t["codePath=".len()..].trim().to_string();
            }
            t if t.starts_with("dataDir=") => {
                detail.data_dir = t["dataDir=".len()..].trim().to_string();
            }
            t if t.starts_with("legacyNativeLibraryDir=") => {
                detail.native_library_dir = t["legacyNativeLibraryDir=".len()..].trim().to_string();
            }
            t if t.starts_with("primaryCpuAbi=") => {
                let v = t["primaryCpuAbi=".len()..].trim().to_string();
                detail.primary_cpu_abi = if v == "null" { String::new() } else { v };
            }
            t if t.starts_with("versionCode=") => {
                detail.version_code = number_after(t, "versionCode=");
                detail.min_sdk = number_after(t, "minSdk=");
                detail.target_sdk = number_after(t, "targetSdk=");
            }
            t if t.starts_with("versionName=") => {
                detail.version_name = t["versionName=".len()..].trim().to_string();
            }
            t if t.starts_with("firstInstallTime=") => {
                let v = t["firstInstallTime=".len()..].trim();
                if !v.starts_with(EPOCH_SENTINEL) {
                    detail.first_install_time = Some(v.to_string());
                }
            }
            t if t.starts_with("lastUpdateTime=") => {
                let v = t["lastUpdateTime=".len()..].trim();
                if !v.starts_with(EPOCH_SENTINEL) {
                    detail.last_update_time = Some(v.to_string());
                }
            }
            t if t.starts_with("timeStamp=") => {
                if detail.first_install_time.is_none() {
                    let v = t["timeStamp=".len()..].trim();
                    if !v.starts_with(EPOCH_SENTINEL) {
                        detail.first_install_time = Some(v.to_string());
                    }
                }
            }
            t if t.starts_with("flags=") || t.starts_with("pkgFlags=") => {
                detail.is_system = t.contains("SYSTEM") || t.contains("SYSTEM_EXT");
            }
            t if t == "requested permissions:" => {
                in_requested = true;
                in_install = false;
            }
            t if t == "install permissions:" => {
                in_install = true;
                in_requested = false;
            }
            _ => {
                if in_requested {
                    // `perm: granted=..., flags=[...]` ou nome simples.
                    if let Some((name, rest)) = split_permission_line(trimmed) {
                        let granted = if let Some(g) = rest.strip_prefix("granted=") {
                            g.trim_start().starts_with("true")
                        } else {
                            true // linha sem estado explícito = concedida
                        };
                        let flags = extract_flags(rest).unwrap_or_default();
                        merge_permission(&mut perms, name, granted, flags);
                    } else if looks_like_permission(trimmed) {
                        merge_permission(&mut perms, trimmed.to_string(), true, String::new());
                    }
                } else if in_install {
                    if let Some((name, rest)) = split_permission_line(trimmed) {
                        let granted = rest
                            .strip_prefix("granted=")
                            .map(|g| g.trim_start().starts_with("true"))
                            .unwrap_or(true);
                        let flags = extract_flags(rest).unwrap_or_default();
                        merge_permission(&mut perms, name, granted, flags);
                    }
                }
            }
        }
    }

    detail.permissions = perms;

    // Estado habilitado/desabilitado.
    let disabled = runner
        .run_serial(serial, &["shell", "pm", "list", "packages", "-d"])?
        .stdout
        .lines()
        .any(|l| l.trim() == format!("package:{pkg}"));
    detail.disabled = disabled;

    Ok(detail)
}

fn number_after(line: &str, key: &str) -> Option<i64> {
    line.split_whitespace()
        .find(|t| t.starts_with(key))
        .and_then(|t| t.strip_prefix(key))
        .and_then(|v| v.parse::<i64>().ok())
}

/// `android.permission.X: granted=true, flags=[ A B]`
fn split_permission_line(line: &str) -> Option<(String, &str)> {
    let idx = line.find(": granted=")?;
    let name = line[..idx].trim();
    if name.is_empty() {
        return None;
    }
    Some((name.to_string(), &line[idx + 2..]))
}

fn extract_flags(rest: &str) -> Option<String> {
    let start = rest.find("flags=[")?;
    let rest = &rest[start + "flags=[".len()..];
    let end = rest.find(']')?;
    Some(rest[..end].trim().to_string())
}

/// Nome de permissão simples (sem `: granted=`), ex.: `android.permission.WAKE_LOCK`.
fn looks_like_permission(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    parts.len() >= 2
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        })
        && !s.contains('=')
}

fn merge_permission(
    perms: &mut Vec<PermissionState>,
    name: String,
    granted: bool,
    flags: String,
) {
    if let Some(p) = perms.iter_mut().find(|p| p.name == name) {
        p.granted = p.granted || granted;
        if !p.flags.is_empty() && !flags.is_empty() && p.flags != flags {
            p.flags = format!("{} {}", p.flags, flags);
        } else if p.flags.is_empty() {
            p.flags = flags;
        }
    } else {
        perms.push(PermissionState { name, granted, flags });
    }
}
