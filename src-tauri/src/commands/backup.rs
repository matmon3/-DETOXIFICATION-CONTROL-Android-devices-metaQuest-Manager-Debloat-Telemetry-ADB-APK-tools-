//! Comandos Tauri: backup e restauração (Fase 4).

use std::sync::Arc;

use tauri::State;

use crate::error::AppError;
use crate::modules::backup;
use crate::modules::devices::manager::DeviceManager;

fn mgr(state: &State<'_, Arc<DeviceManager>>) -> Arc<DeviceManager> {
    state.inner().clone()
}

/// Cria um backup dos pacotes selecionados.
#[tauri::command]
pub async fn backup_create(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    packages: Vec<String>,
    dest_dir: String,
    include_apk: Option<bool>,
    include_data: Option<bool>,
) -> Result<backup::BackupSummary, AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || {
        backup::create_backup(
            m.adb_runner(),
            &serial,
            &packages,
            &dest_dir,
            include_apk.unwrap_or(true),
            include_data.unwrap_or(false),
        )
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Lista backups existentes em um diretório base.
#[tauri::command]
pub fn backup_list(base_dir: String) -> Vec<backup::BackupEntry> {
    backup::list_backups(&base_dir)
}

/// Restaura APKs (e dados) de um backup em um device.
#[tauri::command]
pub async fn backup_restore(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    backup_dir: String,
    packages: Option<Vec<String>>,
) -> Result<Vec<String>, AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let pkgs = packages.unwrap_or_default();
        backup::restore_backup(m.adb_runner(), &serial, &backup_dir, &pkgs)
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}
