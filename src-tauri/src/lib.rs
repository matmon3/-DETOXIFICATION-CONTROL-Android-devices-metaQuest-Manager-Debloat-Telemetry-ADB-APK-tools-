pub mod commands;
pub mod config;
pub mod error;
pub mod modules;

use std::sync::Arc;

use tauri::Manager;

use crate::config::resolve_adb;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::devices::DeviceManager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let runner = AdbRunner::new(resolve_adb());
            let manager = Arc::new(DeviceManager::new(runner));

            // Inicia o servidor ADB em background (não bloqueia a UI).
            let boot_adb = manager.adb_runner().clone();
            std::thread::spawn(move || {
                crate::modules::adb::resolver::start_server(&boot_adb);
            });

            // Watcher de dispositivos em tempo real.
            manager.start_watcher(app.handle().clone());

            app.manage(manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::adb::adb_path,
            commands::adb::adb_version,
            commands::adb::adb_execute,
            commands::devices::devices_list,
            commands::devices::refresh_devices,
            commands::devices::device_info,
            commands::terminal::terminal_execute,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::packages::packages_list,
            commands::packages::package_detail_cmd,
            commands::packages::package_action,
            commands::packages::package_export,
            commands::packages::permission_set,
            commands::packages::apk_analyze,
            commands::packages::package_install,
            commands::packages::transfer_cancel,
            commands::filesystem::fs_list,
            commands::filesystem::fs_mkdir,
            commands::filesystem::fs_touch,
            commands::filesystem::fs_rename,
            commands::filesystem::fs_copy,
            commands::filesystem::fs_delete,
            commands::filesystem::fs_upload,
            commands::filesystem::fs_download,
            commands::tools::screenshot_take,
            commands::tools::record_start,
            commands::tools::record_stop,
            commands::tools::record_pull,
            commands::tools::logcat_start,
            commands::tools::logcat_stop,
            commands::tools::logcat_clear,
            commands::tools::logcat_snapshot,
            commands::tools::save_text_file,
            commands::tools::perf_snapshot,
            commands::network::wifi_connect,
            commands::network::wifi_disconnect,
            commands::network::wifi_pair,
            commands::network::wifi_enable_tcpip,
            commands::network::wifi_device_ip,
            commands::backup::backup_create,
            commands::backup::backup_list,
            commands::backup::backup_restore,
            commands::quest::quest_status,
            commands::quest::quest_set_fps_counter,
            commands::quest::quest_set_phone_sdk,
            commands::quest::quest_set_slow_sdk,
            commands::quest::quest_set_guardian,
            commands::quest::quest_restart_vr_shell,
            commands::quest::quest_open_store,
            commands::quest::device_reboot,
            commands::quest::fastboot_list,
            commands::quest::fastboot_reboot,
            // Fase 7: DETOXIFICATION CONTROL
            commands::control::theme_get,
            commands::control::theme_set,
            commands::control::theme_presets,
            commands::control::theme_export,
            commands::control::theme_import,
            commands::control::cmdlib_list,
            commands::control::cmdlib_save,
            commands::control::cmdlib_delete,
            commands::control::cmdlib_toggle_favorite,
            commands::control::cmdlib_execute,
            commands::control::cmdlib_export,
            commands::control::cmdlib_import,
            commands::control::log_list,
            commands::control::log_clear,
            commands::control::log_export,
            commands::control::optimizer_detect,
            commands::control::optimizer_telemetry_scan,
            commands::control::optimizer_telemetry_toggle,
            commands::control::optimizer_telemetry_disable_all,
            commands::control::optimizer_processes,
            commands::control::optimizer_tweaks,
            commands::control::optimizer_apply_tweak,
            commands::control::debloat_analyze,
            commands::control::debloat_toggle,
            commands::control::debloat_apply,
            commands::control::debloat_info,
            commands::control::screen_tools_state,
            commands::control::screen_volume_set,
            commands::control::screen_brightness_set,
            commands::control::screen_preview,
            commands::control::screen_send_input,
            commands::control::perf_state,
            commands::control::perf_set_cpu,
            commands::control::perf_set_gpu,
            commands::control::perf_set_ffr,
            commands::control::perf_set_resolution,
            commands::control::perf_reset_resolution,
            commands::control::perf_reset_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DETOXIFICATION CONTROL");
}
