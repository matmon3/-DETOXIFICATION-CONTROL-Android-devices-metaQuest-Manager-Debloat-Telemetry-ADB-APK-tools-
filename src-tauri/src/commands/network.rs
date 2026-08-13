//! Comandos Tauri: conexão Wi-Fi (Fase 4).

use std::sync::Arc;

use tauri::State;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::adb::wifi;
use crate::modules::devices::manager::DeviceManager;

fn runner_of(state: &State<'_, Arc<DeviceManager>>) -> AdbRunner {
    state.inner().adb_runner().clone()
}

/// Conecta `adb connect <ip>:<port>` e devolve o serial (ip:porta).
#[tauri::command]
pub async fn wifi_connect(
    state: State<'_, Arc<DeviceManager>>,
    host: String,
    port: Option<u16>,
) -> Result<String, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || wifi::connect(&runner, &host, port))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Desconecta uma conexão Wi-Fi (serial "ip:porta") ou todas (serial vazio).
#[tauri::command]
pub async fn wifi_disconnect(
    state: State<'_, Arc<DeviceManager>>,
    serial: Option<String>,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || {
        wifi::disconnect(&runner, serial.as_deref())
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Pareamento Android 11+ via `adb pair`.
#[tauri::command]
pub async fn wifi_pair(
    state: State<'_, Arc<DeviceManager>>,
    host: String,
    port: u16,
    code: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || wifi::pair(&runner, &host, port, &code))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Habilita ADB por rede no dispositivo conectado por USB (`adb tcpip <port>`).
#[tauri::command]
pub async fn wifi_enable_tcpip(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    port: Option<u16>,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || wifi::enable_tcpip(&runner, &serial, port))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Descobre o IP da interface ativa do dispositivo (via shell).
#[tauri::command]
pub async fn wifi_device_ip(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<String, AppError> {
    let runner = runner_of(&state);
    tauri::async_runtime::spawn_blocking(move || {
        wifi::discover_ip(&runner, &serial)
            .ok_or_else(|| AppError::new("Could not determine the device IP address."))
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}
