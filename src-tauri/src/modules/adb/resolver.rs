//! Descoberta de dispositivos ADB/Fastboot e parsing da saída do `adb devices -l`.

use std::collections::HashMap;

use crate::config;
use crate::error::AppError;
use crate::modules::adb::executor::{AdbRunner, CmdOut};

/// Obtém a versão do ADB instalado, e.g. "Android Debug Bridge version 35.0.2".
pub fn adb_version(runner: &AdbRunner) -> String {
    match runner.run(&["version".to_string()]) {
        Ok(out) => out
            .stdout_trimmed()
            .lines()
            .next()
            .unwrap_or("ADB (unknown version)")
            .to_string(),
        Err(e) => e.message,
    }
}

/// Roda `adb start-server` (não bloqueia o app; ignorado se já ativo).
pub fn start_server(runner: &AdbRunner) {
    let _ = runner.run(&["start-server".to_string()]);
}

/// Executa `adb devices -l` e devolve a saída crua.
pub fn raw_devices(runner: &AdbRunner) -> Result<CmdOut, AppError> {
    runner.run(&["devices".to_string(), "-l".to_string()])
}

/// Escaneia dispositivos em modo fastboot via `fastboot devices`.
pub fn fastboot_devices() -> Vec<(String, String)> {
    let Some(path) = config::resolve_fastboot() else {
        return Vec::new();
    };
    let out = std::process::Command::new(path)
        .arg("devices")
        .stdin(std::process::Stdio::null())
        .output()
        .ok();
    let Some(out) = out else { return Vec::new() };
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .filter_map(|l| {
            let mut parts = l.split_whitespace();
            let serial = parts.next()?.to_string();
            let mode = parts.next().unwrap_or("fastboot").to_string();
            if serial.is_empty() || serial.starts_with("List of") {
                return None;
            }
            Some((serial, mode))
        })
        .collect()
}

/// Estado ADB de um dispositivo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceState {
    Connected,
    Unauthorized,
    Offline,
    Bootloader,
    Recovery,
    Disconnected,
    Unknown,
}

/// Transporte de conexão.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Transport {
    Usb,
    Wifi,
    Fastboot,
    Unknown,
}

/// Dispositivo descoberto no barramento ADB.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Device {
    pub serial: String,
    pub state: DeviceState,
    pub transport: Transport,
    pub model: Option<String>,
    pub product: Option<String>,
    pub codename: Option<String>,
    pub transport_id: Option<String>,
}

fn looks_like_wifi_serial(serial: &str) -> bool {
    let has_port = serial
        .rsplit_once(':')
        .map(|(ip, port)| !ip.is_empty() && port.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false);
    if has_port {
        let ip = serial.rsplit_once(':').unwrap().0;
        if ip.split('.').count() == 4 || ip == "localhost" {
            return true;
        }
    }
    false
}

/// Faz o parsing de uma linha de `adb devices -l`.
fn parse_device_line(line: &str) -> Option<Device> {
    let mut fields = line.split_whitespace();
    let serial = fields.next()?.to_string();
    if serial.is_empty() || serial == "List" || serial.starts_with("*") {
        return None;
    }
    let state_token = fields.next().unwrap_or("unknown");

    let mut props: HashMap<String, String> = HashMap::new();
    for f in fields {
        if let Some((k, v)) = f.split_once(':') {
            props.insert(k.to_string(), v.to_string());
        }
    }

    let state = match state_token {
        "device" => DeviceState::Connected,
        "offline" => DeviceState::Offline,
        "unauthorized" => DeviceState::Unauthorized,
        "recovery" => DeviceState::Recovery,
        "bootloader" => DeviceState::Bootloader,
        _ => DeviceState::Unknown,
    };

    let transport = if props.contains_key("usb") {
        Transport::Usb
    } else if looks_like_wifi_serial(&serial) {
        Transport::Wifi
    } else {
        Transport::Unknown
    };

    Some(Device {
        serial,
        state,
        transport,
        model: props.get("model").cloned(),
        product: props.get("product").cloned(),
        codename: props.get("device").cloned(),
        transport_id: props.get("transport_id").cloned(),
    })
}

/// Lista completa de dispositivos: ADB + Fastboot.
pub fn list_devices(runner: &AdbRunner) -> Vec<Device> {
    let mut devices: Vec<Device> = Vec::new();

    if let Ok(out) = raw_devices(runner) {
        for line in out.stdout.lines() {
            if let Some(dev) = parse_device_line(line) {
                devices.push(dev);
            }
        }
    }

    for (serial, _mode) in fastboot_devices() {
        if !devices.iter().any(|d| d.serial == serial) {
            devices.push(Device {
                serial,
                state: DeviceState::Bootloader,
                transport: Transport::Fastboot,
                model: None,
                product: None,
                codename: None,
                transport_id: None,
            });
        }
    }

    devices
}

/// Verifica se o shell do dispositivo tem `su` (indício de root).
pub fn has_root(runner: &AdbRunner, serial: &str) -> bool {
    runner
        .shell(serial, "which su")
        .map(|out| out.is_ok() && !out.stdout_trimmed().is_empty())
        .unwrap_or(false)
}

/// Obtém o IP da interface ativa do dispositivo.
pub fn device_ip(runner: &AdbRunner, serial: &str) -> Option<String> {
    if let Ok(out) = runner.shell(serial, "ip route get 1") {
        let text = out.stdout;
        if let Some(idx) = text.find("src ") {
            let rest = &text[idx + 4..];
            let ip: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
            if !ip.is_empty() && ip != "127.0.0.1" {
                return Some(ip);
            }
        }
    }
    if let Ok(out) = runner.shell(serial, "ip -f inet addr show") {
        for line in out.stdout.lines() {
            let l = line.trim();
            if let Some((_, rest)) = l.split_once("inet ") {
                let ip: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
                if !ip.is_empty() && !ip.starts_with("127.") {
                    return Some(ip);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_adb_devices_line() {
        let line = "R58M1234567	device product:eureka model:Quest_3S device:eureka transport_id:1";
        let d = parse_device_line(line).unwrap();
        assert_eq!(d.serial, "R58M1234567");
        assert_eq!(d.state, DeviceState::Connected);
        assert_eq!(d.model.as_deref(), Some("Quest_3S"));
        assert_eq!(d.transport_id.as_deref(), Some("1"));
    }

    #[test]
    fn parses_wifi_serial() {
        let line = "192.168.1.42:5555	device product:eureka transport_id:3";
        let d = parse_device_line(line).unwrap();
        assert_eq!(d.transport, Transport::Wifi);
    }

    #[test]
    fn parses_unauthorized() {
        let d = parse_device_line("R58M123	unauthorized transport_id:1").unwrap();
        assert_eq!(d.state, DeviceState::Unauthorized);
    }

    #[test]
    fn detects_wifi_pattern() {
        assert!(looks_like_wifi_serial("192.168.1.42:5555"));
        assert!(!looks_like_wifi_serial("R58M1234567"));
    }
}
