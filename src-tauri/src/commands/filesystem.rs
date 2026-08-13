//! Comandos Tauri: navegação e operações no filesystem do dispositivo.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::modules::devices::manager::DeviceManager;
use crate::modules::filesystem::{list, ops, transfer, FsEntry};

fn mgr(state: &State<'_, Arc<DeviceManager>>) -> Arc<DeviceManager> {
    state.inner().clone()
}

#[tauri::command]
pub async fn fs_list(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    path: String,
) -> Result<Vec<FsEntry>, AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || list::list_dir(m.adb_runner(), &serial, &path))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_mkdir(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    path: String,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || ops::mkdir(m.adb_runner(), &serial, &path))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_touch(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    path: String,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || ops::touch(m.adb_runner(), &serial, &path))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_rename(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    from: String,
    to: String,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || ops::rename(m.adb_runner(), &serial, &from, &to))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_copy(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    from: String,
    to: String,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || ops::copy(m.adb_runner(), &serial, &from, &to))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_delete(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    path: String,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || ops::delete(m.adb_runner(), &serial, &path))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_upload(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    local: String,
    remote: String,
) -> Result<String, AppError> {
    let m = mgr(&state);
    let registry = m.transfers_arc();
    tauri::async_runtime::spawn_blocking(move || {
        transfer::start_transfer(
            m.adb_runner(),
            registry,
            app,
            &serial,
            transfer::Direction::Push,
            &local,
            &remote,
        )
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn fs_download(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    remote: String,
    local: String,
) -> Result<String, AppError> {
    let m = mgr(&state);
    let registry = m.transfers_arc();
    tauri::async_runtime::spawn_blocking(move || {
        transfer::start_transfer(
            m.adb_runner(),
            registry,
            app,
            &serial,
            transfer::Direction::Pull,
            &local,
            &remote,
        )
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}
