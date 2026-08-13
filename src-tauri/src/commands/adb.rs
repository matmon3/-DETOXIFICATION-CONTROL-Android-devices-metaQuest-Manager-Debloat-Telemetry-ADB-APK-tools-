use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::modules::adb::resolver::adb_version as resolve_adb_version;
use crate::modules::activitylog;
use crate::modules::devices::DeviceManager;

#[tauri::command]
pub fn adb_path(state: State<'_, Arc<DeviceManager>>) -> String {
    state.adb_runner().adb_path.display().to_string()
}

#[tauri::command]
pub fn adb_version(state: State<'_, Arc<DeviceManager>>) -> String {
    resolve_adb_version(state.adb_runner())
}

/// Executa `adb <args...>` (sem serial). `args` é uma lista estruturada.
#[tauri::command]
pub async fn adb_execute(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    args: Vec<String>,
) -> Result<crate::modules::adb::executor::CmdOut, AppError> {
    let mgr = state.inner().clone();
    let args_display = args.join(" ");
    let result = tauri::async_runtime::spawn_blocking(move || mgr.adb_runner().run(&args))
        .await
        .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())));

    let (res, exit, err) = match &result {
        Ok(out) => ("SUCCESS", out.exit_code, None),
        Err(e) => ("ERROR", None, Some(e.message.clone())),
    };
    activitylog::logged(
        Some(&app),
        "(global)",
        "ADB COMMAND",
        "adb_execute",
        &format!("adb {args_display}"),
        res,
        exit,
        err,
    );
    result
}
