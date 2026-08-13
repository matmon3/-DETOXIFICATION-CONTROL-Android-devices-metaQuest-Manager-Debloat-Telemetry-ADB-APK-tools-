use std::sync::Arc;

use tauri::State;

use crate::error::AppError;
use crate::modules::adb::resolver::Device;
use crate::modules::devices::manager::DeviceManager;
use crate::modules::devices::DeviceInfo;

#[tauri::command]
pub fn devices_list(state: State<'_, Arc<DeviceManager>>) -> Vec<Device> {
    state.current_devices()
}

/// Força um rescan imediato da lista de dispositivos.
#[tauri::command]
pub fn refresh_devices(state: State<'_, Arc<DeviceManager>>) -> Vec<Device> {
    let found = crate::modules::adb::resolver::list_devices(state.adb_runner());
    let _ = found;
    state.current_devices()
}

#[tauri::command]
pub async fn device_info(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<DeviceInfo, AppError> {
    let mgr = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || mgr.refresh_info(&serial))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}
