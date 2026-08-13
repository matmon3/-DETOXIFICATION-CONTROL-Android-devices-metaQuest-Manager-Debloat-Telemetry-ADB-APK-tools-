//! Ferramentas específicas do Meta Quest (Fase 5).
//!
//! Propriedades e ações conhecidas da plataforma Oculus:
//! - `debug.oculus.enablePhoneSdk` 1/0 — habilita sideload de apps de dev.
//! - `debug.oculus.slowSDK` 1/0 — reduz frequência de polling do SDK.
//! - `debug.oculus.fpsCounter` 1/0 — HUD de FPS no vrshell.
//! - `user_guardian` (settings secure) 0/1 — liga/desliga o guardião.
//! - `com.oculus.vrshell` — processo do shell VR (force-stop reinicia o HUD).

use serde::Serialize;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

/// Snapshot do estado do headset.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuestStatus {
    pub serial: String,
    pub battery_level: Option<u8>,
    pub battery_temp_c: Option<f32>,
    pub fps_counter: bool,
    pub phone_sdk: bool,
    pub slow_sdk: bool,
    pub guardian_enabled: bool,
    pub vr_shell_running: bool,
    pub power_save: bool,
}

fn extract(line: &str, key: &str) -> Option<String> {
    line.trim()
        .strip_prefix(&format!("{key}:"))
        .map(|s| s.trim().to_string())
}

fn read_prop(runner: &AdbRunner, serial: &str, prop: &str) -> Option<String> {
    runner
        .shell(serial, &format!("getprop {prop}"))
        .ok()
        .map(|o| o.stdout_trimmed().to_string())
        .filter(|v| !v.is_empty())
}

fn read_setting(runner: &AdbRunner, serial: &str, key: &str) -> Option<String> {
    runner
        .shell(serial, &format!("settings get secure {key}"))
        .ok()
        .map(|o| o.stdout_trimmed().to_string())
        .filter(|v| !v.is_empty() && v != "null")
}

fn is_one(v: Option<String>) -> bool {
    matches!(v.as_deref(), Some("1") | Some("true"))
}

/// Coleta o status Quest via shell.
pub fn status(runner: &AdbRunner, serial: &str) -> QuestStatus {
    let battery = runner.shell(serial, "dumpsys battery").unwrap_or_default();
    let battery_level = battery
        .stdout
        .lines()
        .find_map(|l| extract(l, "level"))
        .and_then(|v| v.parse::<u8>().ok());
    let battery_temp_c = battery
        .stdout
        .lines()
        .find_map(|l| extract(l, "temperature"))
        .and_then(|v| v.parse::<f32>().ok())
        .map(|t| t / 10.0);

    let vr_shell_running = runner
        .shell(
            serial,
            "ps -A | grep -c com.oculus.vrshell",
        )
        .map(|o| o.stdout_trimmed().parse::<i32>().unwrap_or(0) > 0)
        .unwrap_or(false);

    let power_save = runner
        .shell(serial, "settings get global low_power")
        .map(|o| o.stdout_trimmed() == "1")
        .unwrap_or(false);

    QuestStatus {
        serial: serial.to_string(),
        battery_level,
        battery_temp_c,
        fps_counter: is_one(read_prop(runner, serial, "debug.oculus.fpsCounter")),
        phone_sdk: is_one(read_prop(runner, serial, "debug.oculus.enablePhoneSdk")),
        slow_sdk: is_one(read_prop(runner, serial, "debug.oculus.slowSDK")),
        guardian_enabled: is_one(read_setting(runner, serial, "user_guardian")),
        vr_shell_running,
        power_save,
    }
}

fn setprop(runner: &AdbRunner, serial: &str, prop: &str, value: &str) -> Result<(), AppError> {
    let out = runner.run_serial(
        serial,
        &["shell", "setprop", prop, value],
    )?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("Failed to set {prop}={value}"),
            out.stderr,
        ));
    }
    Ok(())
}

/// Liga/desliga o HUD de FPS no shell VR.
pub fn set_fps_counter(runner: &AdbRunner, serial: &str, on: bool) -> Result<(), AppError> {
    setprop(runner, serial, "debug.oculus.fpsCounter", if on { "1" } else { "0" })
}

/// Liga/desliga o modo Phone SDK (sideload de apps de dev).
pub fn set_phone_sdk(runner: &AdbRunner, serial: &str, on: bool) -> Result<(), AppError> {
    setprop(runner, serial, "debug.oculus.enablePhoneSdk", if on { "1" } else { "0" })
}

/// Liga/desliga o modo Slow SDK (reduz polling, menos bateria).
pub fn set_slow_sdk(runner: &AdbRunner, serial: &str, on: bool) -> Result<(), AppError> {
    setprop(runner, serial, "debug.oculus.slowSDK", if on { "1" } else { "0" })
}

/// Liga/desliga o guardião (settings secure user_guardian).
pub fn set_guardian(runner: &AdbRunner, serial: &str, on: bool) -> Result<(), AppError> {
    let out = runner.run_serial(
        serial,
        &["shell", "settings", "put", "secure", "user_guardian", if on { "1" } else { "0" }],
    )?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            "Failed to change guardian setting.".to_string(),
            out.stderr,
        ));
    }
    Ok(())
}

/// Reinicia o shell VR (HUD) — útil após trocas de setprop.
pub fn restart_vr_shell(runner: &AdbRunner, serial: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "am", "force-stop", "com.oculus.vrshell"])?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            "Failed to restart VR shell.".to_string(),
            out.stderr,
        ));
    }
    Ok(())
}

/// Abre a vitrine do Quest na loja (Oculus Store).
pub fn open_quest_store(runner: &AdbRunner, serial: &str) -> Result<(), AppError> {
    let out = runner.run_serial(
        serial,
        &[
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            "https://www.oculus.com",
        ],
    )?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            "Failed to open Quest Store.".to_string(),
            out.stderr,
        ));
    }
    Ok(())
}

/// Reinicia o dispositivo em um modo. `mode`: "", "bootloader", "recovery",
/// "fastboot" (via `adb reboot`).
pub fn reboot_device(runner: &AdbRunner, serial: &str, mode: &str) -> Result<(), AppError> {
    let mut args = vec!["reboot".to_string()];
    if !mode.is_empty() {
        args.push(mode.to_string());
    }
    let out = runner.run_for_serial(serial, &args)?;
    if out.exit_code != Some(0) && out.exit_code != Some(1) {
        return Err(AppError::with_detail(
            format!("Failed to reboot ({mode})."),
            out.stderr,
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_battery_level() {
        assert_eq!(extract("  level: 82", "level").as_deref(), Some("82"));
        assert_eq!(extract("  status: 3", "status").as_deref(), Some("3"));
    }

    #[test]
    fn is_one_parses() {
        assert!(is_one(Some("1".to_string())));
        assert!(is_one(Some("true".to_string())));
        assert!(!is_one(Some("0".to_string())));
        assert!(!is_one(None));
    }
}
