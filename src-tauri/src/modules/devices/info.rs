//! Informações detalhadas de um dispositivo e detecção de headsets Quest.

use std::collections::HashMap;

use serde::Serialize;

use crate::modules::adb::executor::AdbRunner;
use crate::modules::adb::resolver::{device_ip, has_root};

#[derive(Debug, Clone, Serialize, Default)]
pub struct StorageInfo {
    pub total: u64,
    pub used: u64,
    pub free: u64,
    pub mount: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub density: u32,
    pub refresh_rate: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DeviceInfo {
    pub serial: String,
    pub model: Option<String>,
    pub manufacturer: Option<String>,
    pub brand: Option<String>,
    pub codename: Option<String>,
    pub android_version: Option<String>,
    pub sdk: Option<String>,
    pub security_patch: Option<String>,
    pub build: Option<String>,
    pub fingerprint: Option<String>,
    pub abi: Option<String>,
    pub bootloader: Option<String>,
    pub hardware: Option<String>,
    pub battery_level: Option<u8>,
    pub battery_status: Option<String>,
    pub battery_temperature_c: Option<f32>,
    pub storage: Option<StorageInfo>,
    pub ram_total_mb: Option<u64>,
    pub screen: Option<ScreenInfo>,
    pub ip: Option<String>,
    pub root: bool,
    pub developer_mode: bool,
    pub quest: bool,
    pub headset: Option<String>,
    pub firmware: Option<String>,
}

fn parse_getprop(text: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some((k, v)) = line.split_once(']') {
            let k = k.trim_start_matches('[').trim();
            let v = v.trim_start_matches(": [").trim_end_matches(']').trim();
            if !k.is_empty() {
                map.insert(k.to_string(), v.to_string());
            }
        }
    }
    map
}

fn extract(line: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}:");
    line.trim()
        .strip_prefix(&prefix)
        .map(|s| s.trim().to_string())
}

fn parse_kb_to_bytes(kb_str: &str) -> Option<u64> {
    kb_str.replace(',', "").parse::<u64>().ok().map(|k| k * 1024)
}

fn normalize_headset(model: &str) -> Option<String> {
    let m = model.to_lowercase();
    if m.contains("quest") {
        if m.contains("3s") {
            Some("Quest 3S".to_string())
        } else if m.contains("quest pro") {
            Some("Quest Pro".to_string())
        } else if m.contains("quest 3") {
            Some("Quest 3".to_string())
        } else if m.contains("quest 2") {
            Some("Quest 2".to_string())
        } else {
            Some("Quest".to_string())
        }
    } else if model.to_lowercase().contains("oculus") {
        Some("Oculus".to_string())
    } else {
        None
    }
}

/// Coleta informações completas do dispositivo via ADB shell.
pub fn collect(runner: &AdbRunner, serial: &str) -> DeviceInfo {
    let props = runner
        .shell(serial, "getprop")
        .map(|out| parse_getprop(&out.stdout))
        .unwrap_or_default();

    let gp = |k: &str| props.get(k).cloned().filter(|v| !v.is_empty());

    let battery = runner
        .shell(serial, "dumpsys battery")
        .unwrap_or_default();
    let battery_level = battery
        .stdout
        .lines()
        .find_map(|l| extract(l, "level"))
        .and_then(|v| v.parse::<u8>().ok());
    let battery_status = battery
        .stdout
        .lines()
        .find_map(|l| extract(l, "status"))
        .and_then(|v| v.parse::<u8>().ok())
        .map(|s| match s {
            2 => "Charging".to_string(),
            3 => "Discharging".to_string(),
            4 => "Not charging".to_string(),
            5 => "Full".to_string(),
            1 => "Unknown".to_string(),
            _ => format!("Status {s}"),
        });
    let battery_temperature_c = battery
        .stdout
        .lines()
        .find_map(|l| extract(l, "temperature"))
        .and_then(|v| v.parse::<f32>().ok())
        .map(|t| t / 10.0);

    let storage = runner
        .shell(serial, "df -k /storage/emulated/0")
        .ok()
        .or_else(|| runner.shell(serial, "df -k /sdcard").ok())
        .and_then(|out| {
            let last = out.stdout.lines().filter(|l| l.trim().starts_with('/')).last()?;
            let mut it = last.split_whitespace().skip(1);
            let total = parse_kb_to_bytes(it.next()?)?;
            let used = parse_kb_to_bytes(it.next()?)?;
            let free = parse_kb_to_bytes(it.next()?)?;
            let mount = last.split_whitespace().last()?.to_string();
            Some(StorageInfo { total, used, free, mount })
        });

    let ram_total_mb = runner
        .shell(serial, "cat /proc/meminfo")
        .ok()
        .and_then(|out| {
            out.stdout.lines().find_map(|l| extract(l, "MemTotal"))
        })
        .and_then(|v| v.replace("kB", "").trim().replace(',', "").parse::<u64>().ok())
        .map(|kb| kb / 1024);

    let mut screen = runner
        .shell(serial, "wm size; wm density")
        .ok()
        .map(|out| {
            let mut width = 0;
            let mut height = 0;
            let mut density = 0;
            for line in out.stdout.lines() {
                if let Some(rest) = line.trim().strip_prefix("Physical size:") {
                    let size = rest.trim();
                    if let Some((w, h)) = size.split_once('x') {
                        width = w.trim().parse().unwrap_or(0);
                        height = h.trim().parse().unwrap_or(0);
                    }
                } else if let Some(rest) = line.trim().strip_prefix("Physical density:") {
                    density = rest.trim().parse().unwrap_or(0);
                }
            }
            ScreenInfo { width, height, density, refresh_rate: None }
        });

    let mut refresh_rate = None;
    if let Ok(out) = runner.shell(serial, "dumpsys display") {
        for line in out.stdout.lines() {
            if line.contains("mCurrentRefreshRate") {
                if let Some(idx) = line.find('=') {
                    refresh_rate = line[idx + 1..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect::<String>().parse::<f32>().ok();
                    break;
                }
            }
        }
    }
    if refresh_rate.is_none() {
        if let Ok(out) = runner.shell(serial, "dumpsys SurfaceFlinger") {
            for line in out.stdout.lines() {
                if line.contains("refresh rate") || line.contains("refreshRate") {
                    let num: String = line
                        .chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    if let Some(v) = num.split('.').next().and_then(|s| s.parse::<f32>().ok()) {
                        refresh_rate = Some(v);
                        break;
                    }
                }
            }
        }
    }
    if let Some(s) = screen.as_mut() {
        s.refresh_rate = refresh_rate;
    }

    let model = gp("ro.product.model");
    let manufacturer = gp("ro.product.manufacturer");
    let headset = model.as_deref().and_then(normalize_headset);
    let quest = headset.is_some()
        || manufacturer
            .as_deref()
            .map(|m| m.to_lowercase().contains("meta") || m.to_lowercase().contains("oculus"))
            .unwrap_or(false);

    DeviceInfo {
        serial: serial.to_string(),
        model,
        manufacturer,
        brand: gp("ro.product.brand"),
        codename: gp("ro.product.device"),
        android_version: gp("ro.build.version.release"),
        sdk: gp("ro.build.version.sdk"),
        security_patch: gp("ro.build.version.security_patch"),
        build: gp("ro.build.version.incremental"),
        fingerprint: gp("ro.build.fingerprint"),
        abi: gp("ro.product.cpu.abi"),
        bootloader: gp("ro.bootloader"),
        hardware: gp("ro.hardware"),
        battery_level,
        battery_status,
        battery_temperature_c,
        storage,
        ram_total_mb,
        screen,
        ip: device_ip(runner, serial),
        root: has_root(runner, serial),
        developer_mode: runner
            .shell(serial, "settings get global development_settings_enabled; settings get global adb_enabled")
            .map(|out| {
                out.stdout
                    .lines()
                    .any(|l| l.trim() == "1")
            })
            .unwrap_or(false),
        quest,
        headset,
        firmware: gp("ro.build.version.incremental"),
    }
}
