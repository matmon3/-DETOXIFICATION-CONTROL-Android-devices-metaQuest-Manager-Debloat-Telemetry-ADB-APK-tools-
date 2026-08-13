//! Comandos Tauri: pacotes, instalação, permissões e analyzer de APK.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::modules::devices::manager::DeviceManager;
use crate::modules::packages::analyzer::analyze_apk;
use crate::modules::packages::detail::package_detail;
use crate::modules::packages::install::{start_install, InstallOpts};
use crate::modules::packages::list::list_packages;
use crate::modules::packages::{actions, AppInfo, PackageDetail};

fn mgr(state: &State<'_, Arc<DeviceManager>>) -> Arc<DeviceManager> {
    state.inner().clone()
}

#[tauri::command]
pub async fn packages_list(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    force: Option<bool>,
) -> Result<Vec<AppInfo>, AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || list_packages(m.adb_runner(), &serial, force.unwrap_or(false)))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn package_detail_cmd(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    package: String,
) -> Result<PackageDetail, AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || package_detail(m.adb_runner(), &serial, &package))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn package_action(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    package: String,
    action: String,
    system: Option<bool>,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let runner = m.adb_runner();
        match action.as_str() {
            "launch" => actions::launch(runner, &serial, &package),
            "stop" => actions::force_stop(runner, &serial, &package),
            "clearData" => actions::clear_data(runner, &serial, &package),
            "clearCache" => actions::clear_cache(runner, &serial, &package),
            "disable" => actions::disable(runner, &serial, &package),
            "enable" => actions::enable(runner, &serial, &package),
            "uninstall" => actions::uninstall(runner, &serial, &package, system.unwrap_or(false)),
            "openSettings" => actions::open_app_info(runner, &serial, &package),
            other => Err(AppError::new(format!("Unknown package action: {other}"))),
        }
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn package_export(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    package: String,
    dest_dir: String,
) -> Result<Vec<String>, AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || {
        actions::export_apk(m.adb_runner(), &serial, &package, &dest_dir)
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub async fn permission_set(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    package: String,
    permission: String,
    grant: bool,
) -> Result<(), AppError> {
    let m = mgr(&state);
    tauri::async_runtime::spawn_blocking(move || {
        if grant {
            actions::grant_permission(m.adb_runner(), &serial, &package, &permission)
        } else {
            actions::revoke_permission(m.adb_runner(), &serial, &package, &permission)
        }
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

#[tauri::command]
pub fn apk_analyze(path: String) -> Result<crate::modules::packages::analyzer::ApkInfo, AppError> {
    analyze_apk(&path)
}

#[tauri::command]
pub async fn package_install(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    paths: Vec<String>,
    replace: Option<bool>,
    grant_all: Option<bool>,
) -> Result<String, AppError> {
    let m = mgr(&state);
    let opts = InstallOpts {
        replace: replace.unwrap_or(false),
        grant_all: grant_all.unwrap_or(false),
    };
    let registry = m.transfers_arc();
    tauri::async_runtime::spawn_blocking(move || {
        start_install(m.adb_runner(), registry, app, &serial, &paths, opts)
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())))
}

/// Cancela uma transferência/instalação ativa.
#[tauri::command]
pub fn transfer_cancel(
    state: State<'_, Arc<DeviceManager>>,
    token: String,
) -> bool {
    state.inner().transfers().cancel(&token)
}
