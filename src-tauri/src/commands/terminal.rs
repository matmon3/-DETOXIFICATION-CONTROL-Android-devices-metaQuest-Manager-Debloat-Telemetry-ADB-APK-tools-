use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::modules::adb::executor::CmdOut;
use crate::modules::activitylog;
use crate::modules::devices::DeviceManager;

/// Executa um comando no terminal ADB integrado.
///
/// `input`: linha digitada pelo usuário (prefixo `adb` opcional).
/// `serial`: dispositivo alvo (obrigatório para `shell`).
#[tauri::command]
pub async fn terminal_execute(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    input: String,
    serial: Option<String>,
) -> Result<CmdOut, AppError> {
    let mgr = state.inner().clone();
    let input_c = input.clone();
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::modules::terminal::execute(&mgr, &input_c, serial_c.as_deref())
    })
    .await
    .unwrap_or_else(|e| Err(AppError::with_detail("Task failed.", e.to_string())));

    let (res, exit, err) = match &result {
        Ok(out) => ("SUCCESS", out.exit_code, None),
        Err(e) => ("ERROR", None, Some(e.message.clone())),
    };
    activitylog::logged(
        Some(&app),
        serial.as_deref().unwrap_or("(global)"),
        "ADB COMMAND",
        "Terminal",
        &input,
        res,
        exit,
        err,
    );
    result
}
