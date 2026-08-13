//! Comandos Tauri: Quest tools e boot/fastboot (Fase 5).

use std::sync::Arc;

use tauri::State;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::devices::manager::DeviceManager;
use crate::modules::quest;

fn runner_of(state: &State<'_, Arc<DeviceManager>>) -> AdbRunner {
    state.inner().adb_runner().clone()
}

#[tauri::command]
pub async fn quest_status(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<quest::QuestStatus, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::status(&runner, &serial))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))
}

#[tauri::command]
pub async fn quest_set_fps_counter(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    on: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::set_fps_counter(&runner, &serial, on))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn quest_set_phone_sdk(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    on: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::set_phone_sdk(&runner, &serial, on))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn quest_set_slow_sdk(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    on: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::set_slow_sdk(&runner, &serial, on))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn quest_set_guardian(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    on: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::set_guardian(&runner, &serial, on))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn quest_restart_vr_shell(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::restart_vr_shell(&runner, &serial))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn quest_open_store(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || quest::open_quest_store(&runner, &serial))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// `adb reboot [mode]` — modo "" (normal), "bootloader", "recovery", "fastboot".
#[tauri::command]
pub async fn device_reboot(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    mode: Option<String>,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let mode = mode.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || quest::reboot_device(&runner, &serial, &mode))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Lista dispositivos em modo fastboot.
#[tauri::command]
pub fn fastboot_list() -> Vec<(String, String)> {
    crate::modules::adb::resolver::fastboot_devices()
}

/// `fastboot reboot` ou `fastboot reboot-bootloader` para um serial.
#[tauri::command]
pub fn fastboot_reboot(serial: String, mode: Option<String>) -> Result<(), AppError> {
    let Some(path) = crate::config::resolve_fastboot() else {
        return Err(AppError::new(
            "Fastboot binary not found. Install android-tools or set the path in Settings.",
        ));
    };
    let mut args = vec![
        "-s".to_string(),
        serial,
        if mode.as_deref() == Some("bootloader") { "reboot-bootloader" } else { "reboot" }.to_string(),
    ];
    let out = std::process::Command::new(&path)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| AppError::with_detail("Failed to run fastboot.".to_string(), e.to_string()))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    if !out.status.success() {
        args.pop();
        return Err(AppError::with_detail(
            format!("Fastboot command failed ({}).", stdout.trim()),
            stdout.to_string(),
        ));
    }
    Ok(())
}
