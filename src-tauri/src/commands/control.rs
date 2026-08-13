//! Comandos Tauri: themes, command library, activity log, optimizer,
//! debloat e screen tools (Fase 7 - DETOXIFICATION CONTROL).

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::activitylog;
use crate::modules::devices::manager::DeviceManager;
use crate::modules::{commandlib, debloat, optimizer, questperf, screentools, themes};

fn runner_of(state: &State<'_, Arc<DeviceManager>>) -> AdbRunner {
    state.inner().adb_runner().clone()
}

// ---------------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn theme_get() -> themes::Theme {
    themes::current()
}

#[tauri::command]
pub fn theme_set(theme: themes::Theme) -> Result<themes::Theme, AppError> {
    themes::save(&theme).map_err(AppError::new)
}

#[tauri::command]
pub fn theme_presets() -> Vec<themes::Theme> {
    themes::Theme::presets()
}

#[tauri::command]
pub fn theme_export() -> Result<String, AppError> {
    let current = themes::current();
    themes::export(&current).map_err(AppError::new)
}

#[tauri::command]
pub fn theme_import(json: String) -> Result<themes::Theme, AppError> {
    themes::import(&json).map_err(AppError::new)
}

// ---------------------------------------------------------------------------
// Command Library
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn cmdlib_list() -> Vec<commandlib::SavedCommand> {
    commandlib::list()
}

#[tauri::command]
pub fn cmdlib_save(cmd: commandlib::SavedCommand) -> Result<commandlib::SavedCommand, AppError> {
    commandlib::save(&cmd)
}

#[tauri::command]
pub fn cmdlib_delete(id: String) -> Result<(), AppError> {
    commandlib::delete(&id)
}

#[tauri::command]
pub fn cmdlib_toggle_favorite(id: String) -> Result<commandlib::SavedCommand, AppError> {
    commandlib::toggle_favorite(&id)
}

#[tauri::command]
pub async fn cmdlib_execute(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    id: String,
) -> Result<crate::modules::adb::executor::CmdOut, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let id_c = id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        commandlib::execute(&runner, &serial_c, &id_c)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;

    let cmd = commandlib::list().into_iter().find(|c| c.id == id);
    let cmd_text = cmd
        .as_ref()
        .map(|c| c.command.clone())
        .unwrap_or_else(|| id.clone());
    let op = cmd.as_ref().map(|c| c.name.clone()).unwrap_or_else(|| "Execute".into());
    let (res, exit, err) = match &result {
        Ok(out) => ("SUCCESS", out.exit_code, None),
        Err(e) => ("ERROR", None, Some(e.message.clone())),
    };
    activitylog::logged(Some(&app), &serial, "COMMAND LIBRARY", &op, &cmd_text, res, exit, err);
    result
}

#[tauri::command]
pub fn cmdlib_export() -> Result<String, AppError> {
    commandlib::export_json().map_err(AppError::new)
}

#[tauri::command]
pub fn cmdlib_import(json: String) -> Result<usize, AppError> {
    commandlib::import_json(&json)
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn log_list(filter: Option<String>) -> Vec<activitylog::LogEntry> {
    activitylog::list(filter.as_deref())
}

#[tauri::command]
pub fn log_clear() {
    activitylog::clear();
}

#[tauri::command]
pub fn log_export() -> Result<String, AppError> {
    Ok(activitylog::export_json())
}

// ---------------------------------------------------------------------------
// Quest Optimizer
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn optimizer_detect(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<optimizer::QuestVersion, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || optimizer::detect_quest(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))
}

#[tauri::command]
pub async fn optimizer_telemetry_scan(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<Vec<optimizer::TelemetryComponent>, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || optimizer::telemetry_scan(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?
}

#[tauri::command]
pub async fn optimizer_telemetry_toggle(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    pkg: String,
    disable: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let pkg_c = pkg.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        optimizer::telemetry_toggle(&runner, &serial_c, &pkg_c, disable)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("{} {pkg}", if disable { "Disable" } else { "Enable" });
    let cmd = format!("pm {} --user 0 {pkg}", if disable { "disable-user" } else { "enable" });
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "OPTIMIZER", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => {
            activitylog::logged(Some(&app), &serial, "OPTIMIZER", &op, &cmd, "ERROR", None, Some(e.message.clone()))
        }
    }
    result
}

#[tauri::command]
pub async fn optimizer_telemetry_disable_all(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<Vec<optimizer::TelemetryResult>, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let results = tauri::async_runtime::spawn_blocking(move || {
        optimizer::telemetry_disable_all(&runner, &serial_c)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))??;
    let ok = results.iter().filter(|r| r.ok).count();
    let bad = results.len() - ok;
    let op = format!("Disable all telemetry ({ok} ok, {bad} failed)");
    activitylog::logged(
        Some(&app),
        &serial,
        "OPTIMIZER",
        &op,
        &format!("{} telemetry packages", results.len()),
        if bad == 0 { "SUCCESS" } else { "ERROR" },
        if bad == 0 { Some(0) } else { Some(1) },
        if bad > 0 { Some(format!("{bad} failed")) } else { None },
    );
    Ok(results)
}

#[tauri::command]
pub async fn optimizer_processes(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<Vec<optimizer::ServiceProcess>, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || optimizer::processes_list(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?
}

#[tauri::command]
pub async fn optimizer_tweaks(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<Vec<optimizer::PerformanceTweak>, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || optimizer::perf_tweaks(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))
}

#[tauri::command]
pub async fn optimizer_apply_tweak(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let key_c = key.clone();
    let value_c = value.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        optimizer::perf_apply(&runner, &serial_c, &key_c, &value_c)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("Apply tweak {key}");
    let cmd = format!("setprop {key} {value}");
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "OPTIMIZER", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => {
            activitylog::logged(Some(&app), &serial, "OPTIMIZER", &op, &cmd, "ERROR", None, Some(e.message.clone()))
        }
    }
    result
}

// ---------------------------------------------------------------------------
// Quest Debloat
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn debloat_analyze(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<debloat::DebloatReport, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || debloat::analyze(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?
}

#[tauri::command]
pub async fn debloat_toggle(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    pkg: String,
    disable: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let pkg_c = pkg.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        debloat::toggle(&runner, &serial_c, &pkg_c, disable)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("{} {pkg}", if disable { "Disable" } else { "Enable" });
    let cmd = format!("pm {} --user 0 {pkg}", if disable { "disable-user" } else { "enable" });
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "DEBLOAT", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => {
            activitylog::logged(Some(&app), &serial, "DEBLOAT", &op, &cmd, "ERROR", None, Some(e.message.clone()))
        }
    }
    result
}

#[tauri::command]
pub async fn debloat_apply(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    packages: Vec<String>,
    disable: bool,
) -> Result<Vec<debloat::DebloatResult>, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let packages_c = packages.clone();
    let results = tauri::async_runtime::spawn_blocking(move || {
        debloat::apply(&runner, &serial_c, packages_c, disable)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let ok = results.iter().filter(|r| r.ok).count();
    let bad = results.len() - ok;
    let op = format!("Batch {} ({ok} ok, {bad} failed)", if disable { "disable" } else { "enable" });
    activitylog::logged(
        Some(&app),
        &serial,
        "DEBLOAT",
        &op,
        &format!("{} packages", packages.len()),
        if bad == 0 { "SUCCESS" } else { "ERROR" },
        if bad == 0 { Some(0) } else { Some(1) },
        if bad > 0 { Some(format!("{bad} failed")) } else { None },
    );
    Ok(results)
}

#[tauri::command]
pub async fn debloat_info(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    pkg: String,
) -> Result<crate::modules::packages::PackageDetail, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let pkg_c = pkg.clone();
    tauri::async_runtime::spawn_blocking(move || debloat::info(&runner, &serial_c, &pkg_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?
}

// ---------------------------------------------------------------------------
// Screen Tools
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn screen_tools_state(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<screentools::ScreenToolsState, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || screentools::state(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))
}

#[tauri::command]
pub async fn screen_volume_set(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    stream: String,
    value: i32,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let stream_c = stream.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        screentools::set_volume(&runner, &serial_c, &stream_c, value)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("Volume {stream}={value}");
    let cmd = format!("settings put system volume_{stream} {value}");
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "SCREEN", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => {
            activitylog::logged(Some(&app), &serial, "SCREEN", &op, &cmd, "ERROR", None, Some(e.message.clone()))
        }
    }
    result
}

#[tauri::command]
pub async fn screen_brightness_set(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    value: i32,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        screentools::set_brightness(&runner, &serial_c, value)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("Brightness={value}");
    let cmd = format!("settings put system screen_brightness {value}");
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "SCREEN", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => {
            activitylog::logged(Some(&app), &serial, "SCREEN", &op, &cmd, "ERROR", None, Some(e.message.clone()))
        }
    }
    result
}

#[tauri::command]
pub async fn screen_preview(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<screentools::PreviewResult, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || screentools::preview(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?
}

#[tauri::command]
pub async fn screen_send_input(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    input: screentools::ScreenInput,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let action = input.action.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        screentools::send_input(&runner, &serial_c, &input)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("Input {action}");
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "SCREEN", &op, &format!("input {action}"), "SUCCESS", Some(0), None),
        Err(e) => {
            activitylog::logged(Some(&app), &serial, "SCREEN", &op, &format!("input {action}"), "ERROR", None, Some(e.message.clone()))
        }
    }
    result
}

// ---------------------------------------------------------------------------
// Quest Performance (CPU/GPU/FFR/resolução — estilo OcularMigraine)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn perf_state(
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<questperf::PerfState, AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    tauri::async_runtime::spawn_blocking(move || questperf::state(&runner, &serial_c))
        .await
        .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))
}

#[tauri::command]
pub async fn perf_set_cpu(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    level: u8,
    dynamic: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        questperf::set_cpu(&runner, &serial_c, level, dynamic)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    log_perf(&app, &serial, "CPU", level, dynamic, &result);
    result
}

#[tauri::command]
pub async fn perf_set_gpu(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    level: u8,
    dynamic: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        questperf::set_gpu(&runner, &serial_c, level, dynamic)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    log_perf(&app, &serial, "GPU", level, dynamic, &result);
    result
}

#[tauri::command]
pub async fn perf_set_ffr(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    level: u8,
    dynamic: bool,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        questperf::set_ffr(&runner, &serial_c, level, dynamic)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    log_perf(&app, &serial, "FFR", level, dynamic, &result);
    result
}

fn log_perf(app: &AppHandle, serial: &str, what: &str, level: u8, dynamic: bool, result: &Result<(), AppError>) {
    let op = format!("{what} {}", if dynamic { "dynamic" } else { "static" });
    let cmd = if dynamic {
        format!("debug.oculus.{what} dynamic/unset")
    } else {
        format!("debug.oculus.{what} {level}")
    };
    match result {
        Ok(()) => activitylog::logged(Some(app), serial, "PERF", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => activitylog::logged(
            Some(app),
            serial,
            "PERF",
            &op,
            &cmd,
            "ERROR",
            None,
            Some(e.message.clone()),
        ),
    }
}

#[tauri::command]
pub async fn perf_set_resolution(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        questperf::set_resolution(&runner, &serial_c, width, height)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = format!("Resolution {width}x{height}");
    let cmd = format!("debug.oculus.textureWidth={width} textureHeight={height}");
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "PERF", &op, &cmd, "SUCCESS", Some(0), None),
        Err(e) => activitylog::logged(
            Some(&app),
            &serial,
            "PERF",
            &op,
            &cmd,
            "ERROR",
            None,
            Some(e.message.clone()),
        ),
    }
    result
}

#[tauri::command]
pub async fn perf_reset_resolution(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        questperf::reset_resolution(&runner, &serial_c)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = "Reset resolution".to_string();
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "PERF", &op, "textureWidth/Height unset", "SUCCESS", Some(0), None),
        Err(e) => activitylog::logged(
            Some(&app),
            &serial,
            "PERF",
            &op,
            "textureWidth/Height unset",
            "ERROR",
            None,
            Some(e.message.clone()),
        ),
    }
    result
}

#[tauri::command]
pub async fn perf_reset_all(
    app: AppHandle,
    state: State<'_, Arc<DeviceManager>>,
    serial: String,
) -> Result<(), AppError> {
    let runner = runner_of(&state);
    let serial_c = serial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        questperf::reset_all(&runner, &serial_c)
    })
    .await
    .map_err(|e| AppError::with_detail("Task failed.", e.to_string()))?;
    let op = "Reset ALL performance settings".to_string();
    match &result {
        Ok(()) => activitylog::logged(Some(&app), &serial, "PERF", &op, "cpuLevel/gpuLevel/foveation/texture unset", "SUCCESS", Some(0), None),
        Err(e) => activitylog::logged(
            Some(&app),
            &serial,
            "PERF",
            &op,
            "cpuLevel/gpuLevel/foveation/texture unset",
            "ERROR",
            None,
            Some(e.message.clone()),
        ),
    }
    result
}
