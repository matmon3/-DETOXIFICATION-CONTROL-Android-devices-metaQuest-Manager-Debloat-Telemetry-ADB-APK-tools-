//! Screen Tools (Fase 7 - DETOXIFICATION CONTROL).
//!
//! - Volume de mídia (settings system volume_*).
//! - Brilho quando suportado (settings system screen_brightness).
//! - Preview/streaming: screencap via exec-out para arquivo local temporário;
//!   o frontend exibe via asset protocol e faz polling para simular streaming.
//! - Controle remoto (input tap/swipe/key/text) quando suportado pelo ADB.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenToolsState {
    pub media_volume: Option<i32>,
    pub ring_volume: Option<i32>,
    pub alarm_volume: Option<i32>,
    pub brightness: Option<i32>,
    pub brightness_max: Option<i32>,
    pub screen_width: Option<u32>,
    pub screen_height: Option<u32>,
    pub density: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInput {
    /// "tap" | "swipe" | "key" | "text"
    pub action: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub x2: Option<i32>,
    pub y2: Option<i32>,
    pub duration_ms: Option<i32>,
    pub key: Option<String>,
    pub text: Option<String>,
}

fn getint(runner: &AdbRunner, serial: &str, key: &str) -> Option<i32> {
    runner
        .shell(serial, &format!("settings get system {key}"))
        .ok()
        .map(|o| o.stdout_trimmed().to_string())
        .filter(|v| !v.is_empty() && v != "null")
        .and_then(|v| v.parse::<i32>().ok())
}

fn preview_dir() -> PathBuf {
    config::data_dir().join("preview")
}

/// Estado atual de volume/brilho/tela do dispositivo.
pub fn state(runner: &AdbRunner, serial: &str) -> ScreenToolsState {
    let mut st = ScreenToolsState {
        media_volume: getint(runner, serial, "volume_media"),
        ring_volume: getint(runner, serial, "volume_ring"),
        alarm_volume: getint(runner, serial, "volume_alarm"),
        brightness: getint(runner, serial, "screen_brightness"),
        brightness_max: getint(runner, serial, "screen_brightness_max"),
        screen_width: None,
        screen_height: None,
        density: None,
    };
    if let Ok(out) = runner.shell(serial, "wm size; wm density") {
        for line in out.stdout.lines() {
            if let Some(rest) = line.trim().strip_prefix("Physical size:") {
                if let Some((w, h)) = rest.trim().split_once('x') {
                    st.screen_width = w.trim().parse().ok();
                    st.screen_height = h.trim().parse().ok();
                }
            } else if let Some(rest) = line.trim().strip_prefix("Physical density:") {
                st.density = rest.trim().parse().ok();
            }
        }
    }
    st
}

/// Define o volume de um stream (media/ring/alarm) em 0-15.
pub fn set_volume(runner: &AdbRunner, serial: &str, stream: &str, value: i32) -> Result<(), AppError> {
    let key = volume_key(stream);
    let v = value.clamp(0, 15);
    let out = runner.run_serial(
        serial,
        &["shell", "settings", "put", "system", key, &v.to_string()],
    )?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("Failed to set {stream} volume."),
            out.stderr,
        ));
    }
    // Tenta propagar via media_session quando disponível.
    let stream_id = match stream {
        "ring" => "2",
        "alarm" => "4",
        _ => "3",
    };
    let _ = runner.run_serial(
        serial,
        &["shell", "cmd", "media_session", "volume", "--stream", stream_id, "--set", &v.to_string()],
    );
    Ok(())
}

/// Define o brilho (0-255) se suportado pelo dispositivo.
pub fn set_brightness(runner: &AdbRunner, serial: &str, value: i32) -> Result<(), AppError> {
    let v = value.clamp(0, 255);
    let out = runner.run_serial(
        serial,
        &["shell", "settings", "put", "system", "screen_brightness", &v.to_string()],
    )?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            "Failed to set brightness.",
            out.stderr,
        ));
    }
    Ok(())
}

/// Captura a tela para um arquivo local temporário. O frontend exibe via
/// `convertFileSrc(path)` e faz polling (streaming aproximado).
pub fn preview(runner: &AdbRunner, serial: &str) -> Result<PreviewResult, AppError> {
    let dir = preview_dir();
    std::fs::create_dir_all(&dir).map_err(|e| {
        AppError::with_detail(format!("Cannot create preview dir: {}", dir.display()), e.to_string())
    })?;

    let name = format!("frame-{}.png", timestamp_ms());
    let file = dir.join(&name);
    let file_handle = std::fs::File::create(&file).map_err(|e| {
        AppError::with_detail(format!("Cannot create preview file: {}", file.display()), e.to_string())
    })?;

    let out = std::process::Command::new(&runner.adb_path)
        .args(["-s", serial, "exec-out", "screencap", "-p"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(file_handle))
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
            } else {
                AppError::with_detail(format!("Failed to start screencap: {e}"), e.to_string())
            }
        })?;

    // Mantém apenas o último frame.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let keep = file.file_name().unwrap_or_default().to_string_lossy().to_string();
        for e in entries.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.ends_with(".png") && fname != keep {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }

    if !out.status.success() {
        let _ = std::fs::remove_file(&file);
        let stderr = String::from_utf8_lossy(&out.stderr);
        let msg = if stderr.to_lowercase().contains("unauthorized") {
            "Preview failed. The device has not authorized this computer."
        } else if stderr.to_lowercase().contains("offline") {
            "Preview failed. The device is offline."
        } else {
            "Preview failed on device."
        };
        return Err(AppError::with_detail(msg, stderr.to_string()));
    }

    let st = state(runner, serial);
    Ok(PreviewResult {
        width: st.screen_width,
        height: st.screen_height,
        bytes: std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0),
        path: file.to_string_lossy().to_string(),
    })
}

/// Envia um input para o dispositivo (controle remoto).
pub fn send_input(runner: &AdbRunner, serial: &str, input: &ScreenInput) -> Result<(), AppError> {
    let args: Vec<String> = match input.action.as_str() {
        "tap" => {
            let x = input.x.ok_or_else(|| AppError::new("Missing x for tap."))?;
            let y = input.y.ok_or_else(|| AppError::new("Missing y for tap."))?;
            vec!["shell".into(), "input".into(), "tap".into(), x.to_string(), y.to_string()]
        }
        "swipe" => {
            let x1 = input.x.ok_or_else(|| AppError::new("Missing x for swipe."))?;
            let y1 = input.y.ok_or_else(|| AppError::new("Missing y for swipe."))?;
            let x2 = input.x2.ok_or_else(|| AppError::new("Missing x2 for swipe."))?;
            let y2 = input.y2.ok_or_else(|| AppError::new("Missing y2 for swipe."))?;
            let mut a = vec!["shell".into(), "input".into(), "swipe".into(), x1.to_string(), y1.to_string(), x2.to_string(), y2.to_string()];
            if let Some(d) = input.duration_ms {
                a.push(d.to_string());
            }
            a
        }
        "key" => {
            let key = input.key.clone().ok_or_else(|| AppError::new("Missing key for keyevent."))?;
            vec!["shell".into(), "input".into(), "keyevent".into(), key]
        }
        "text" => {
            let text = input.text.clone().ok_or_else(|| AppError::new("Missing text."))?;
            vec!["shell".into(), "input".into(), "text".into(), text]
        }
        other => return Err(AppError::new(format!("Unknown input action: {other}"))),
    };
    let out = runner.run_for_serial(serial, &args)?;
    if out.exit_code != Some(0) && !out.stdout.trim().is_empty() {
        return Err(AppError::with_detail(
            "Input command reported an error.",
            out.stderr,
        ));
    }
    Ok(())
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_key_mapping() {
        assert_eq!(volume_key("media"), "volume_media");
        assert_eq!(volume_key("ring"), "volume_ring");
        assert_eq!(volume_key("alarm"), "volume_alarm");
        assert_eq!(volume_key("weird"), "volume_media");
    }

    #[test]
    fn clamps_values() {
        assert_eq!(i32::clamp(20, 0, 15), 15);
        assert_eq!(i32::clamp(-3, 0, 15), 0);
        assert_eq!(i32::clamp(300, 0, 255), 255);
    }
}

fn volume_key(stream: &str) -> &str {
    match stream {
        "ring" => "volume_ring",
        "alarm" => "volume_alarm",
        _ => "volume_media",
    }
}
