//! Conexão ADB por rede (Wi-Fi).
//!
//! Comandos estruturados via `AdbRunner` — nunca via `sh -c`.
//! Fluxo típico:
//! 1. Dispositivo USB -> `enable_tcpip` (abre a porta 5555).
//! 2. `discover_ip` -> IP da interface ativa.
//! 3. `connect(ip, port)` -> `adb connect ip:port`.
//!
//! Para Android 11+ sem USB: `adb pair ip:port code` (pareamento).

use std::net::IpAddr;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::adb::resolver::device_ip;

const DEFAULT_ADB_PORT: u16 = 5555;

/// Valida um IP e devolve string normalizada ("1.2.3.4" ou "::1").
pub fn normalize_ip(raw: &str) -> Result<String, AppError> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(AppError::new("Enter an IP address (e.g. 192.168.1.42)."));
    }
    let ip: IpAddr = raw.parse().map_err(|_| {
        AppError::with_detail(
            format!("Invalid IP address: {raw}"),
            "Expected e.g. 192.168.1.42 or a hostname.",
        )
    })?;
    Ok(ip.to_string())
}

/// Monta o endpoint "ip:porta" validado.
pub fn endpoint(host: &str, port: Option<u16>) -> Result<String, AppError> {
    let ip = normalize_ip(host)?;
    let p = port.unwrap_or(DEFAULT_ADB_PORT);
    Ok(format!("{ip}:{p}"))
}

/// `adb connect <ip>:<port>`. Retorna o serial conectado (ip:porta).
pub fn connect(runner: &AdbRunner, host: &str, port: Option<u16>) -> Result<String, AppError> {
    let ep = endpoint(host, port)?;
    let out = runner.run(&["connect".to_string(), ep.clone()])?;
    if out.is_ok() {
        Ok(ep)
    } else {
        Err(AppError::from_cmd(&format!("connect to {ep}"), &out))
    }
}

/// `adb disconnect [<ip>:<port>]`. Sem serial, desconecta todas as redes.
pub fn disconnect(runner: &AdbRunner, serial: Option<&str>) -> Result<(), AppError> {
    let mut args = vec!["disconnect".to_string()];
    if let Some(s) = serial {
        if !s.trim().is_empty() {
            args.push(s.trim().to_string());
        }
    }
    let out = runner.run(&args)?;
    if out.is_ok() {
        Ok(())
    } else {
        Err(AppError::from_cmd("disconnect", &out))
    }
}

/// `adb pair <ip>:<port> <code>` — pareamento de Android 11+ (sem USB).
pub fn pair(runner: &AdbRunner, host: &str, port: u16, code: &str) -> Result<(), AppError> {
    let ip = normalize_ip(host)?;
    let code = code.trim();
    if code.is_empty() {
        return Err(AppError::new("Enter the 6-digit pairing code shown on the headset."));
    }
    let ep = format!("{ip}:{port}");
    let out = runner.run(&["pair".to_string(), ep.clone(), code.to_string()])?;
    if out.is_ok() {
        Ok(())
    } else {
        let stdout = out.stdout.trim();
        let ok_marker = stdout
            .to_lowercase()
            .contains("successfully paired")
            || stdout.to_lowercase().contains("already paired");
        if ok_marker {
            return Ok(());
        }
        Err(AppError::from_cmd(&format!("pair with {ep}"), &out))
    }
}

/// `adb tcpip <port>` — habilita ADB por rede no dispositivo (requer USB ativo).
pub fn enable_tcpip(runner: &AdbRunner, serial: &str, port: Option<u16>) -> Result<(), AppError> {
    let p = port.unwrap_or(DEFAULT_ADB_PORT);
    let out = runner.run_for_serial(serial, &["tcpip".to_string(), p.to_string()])?;
    if out.is_ok() {
        Ok(())
    } else {
        Err(AppError::from_cmd("enable network ADB (tcpip)", &out))
    }
}

/// Descobre o IP da interface ativa do dispositivo (via shell).
pub fn discover_ip(runner: &AdbRunner, serial: &str) -> Option<String> {
    device_ip(runner, serial)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_validation() {
        assert_eq!(endpoint("192.168.1.42", None).unwrap(), "192.168.1.42:5555");
        assert_eq!(
            endpoint("192.168.1.42", Some(4444)).unwrap(),
            "192.168.1.42:4444"
        );
        assert_eq!(endpoint("::1", None).unwrap(), "::1:5555");
        assert!(endpoint("not-an-ip", None).is_err());
        assert!(endpoint("", None).is_err());
    }

    #[test]
    fn normalize_host() {
        assert_eq!(normalize_ip(" 1.2.3.4 ").unwrap(), "1.2.3.4");
        assert!(normalize_ip("").is_err());
    }
}
