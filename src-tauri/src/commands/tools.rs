//! Comandos Tauri: screenshot, screen record e logcat (Fase 3).

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::devices::manager::DeviceManager;
use crate::modules::{logcat, screen, screen::RecordOpts};

fn runner_of(state: &State<'_, Arc<DeviceManager>>) -> AdbRunner {
    state.inner().adb_runner().clone()
}

// ---- Screenshot ----

#[tauri::command]
pub async fn screenshot_take(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    dest_dir: String,
) -> Result<String, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || screen::take_screenshot(&runner, &serial, &dest_dir))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

// ---- Screen record ----

#[tauri::command]
pub async fn record_start(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    opts: RecordOpts,
) -> Result<screen::RecordStarted, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || screen::start_record(&runner, app, &serial, &opts))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn record_stop(
    state: State<'_, Arc<DeviceManager>>,
    token: String,
) -> Result<String, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || screen::stop_record(&runner, &token))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn record_pull(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    remote: String,
    local: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || screen::pull_record(&runner, &serial, &remote, &local))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

// ---- Logcat ----

#[tauri::command]
pub async fn logcat_start(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<String, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || logcat::start(&runner, app, &serial))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn logcat_stop() -> Result<(), AppError> {
    logcat::stop();
    Ok(())
}

#[tauri::command]
pub async fn logcat_clear(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || logcat::clear(&runner, &serial))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub fn logcat_snapshot() -> Vec<String> {
    logcat::snapshot()
}

/// Salva texto em um arquivo local (ex.: export de logcat).
/// `path` é escolhido pelo usuário via dialog no frontend.
#[tauri::command]
pub fn save_text_file(path: String, content: String) -> Result<(), AppError> {
    if path.trim().is_empty() {
        return Err(AppError::new("Empty output path."));
    }
    std::fs::write(&path, content).map_err(|e| {
        AppError::with_detail(format!("Failed to write {path}"), e.to_string())
    })
}

// ---- Performance ----

#[tauri::command]
pub async fn perf_snapshot(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<crate::modules::performance::PerfSnapshot, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || crate::modules::performance::snapshot(&runner, &serial))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}
