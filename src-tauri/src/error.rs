use std::fmt;

use serde::Serialize;

/// Erro amigável do aplicativo.
///
/// `message` é exibido diretamente ao usuário (e.g. "Could not install APK").
/// `detail` guarda o output técnico bruto para "View technical details".
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub message: String,
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    /// Constrói erro a partir de um comando ADB que falhou, com dicas amigáveis.
    pub fn from_cmd(action: &str, out: &crate::modules::adb::executor::CmdOut) -> Self {
        let stderr = out.stderr.trim();
        let stdout = out.stdout.trim();
        let raw = if !stderr.is_empty() {
            stderr.to_string()
        } else if !stdout.is_empty() {
            stdout.to_string()
        } else {
            format!("exit code {:?}", out.exit_code)
        };

        let message = if raw.to_lowercase().contains("unauthorized") {
            format!("Could not {action}. The device has not authorized this computer.")
        } else if raw.to_lowercase().contains("offline") {
            format!("Could not {action}. The device is offline.")
        } else if raw.to_lowercase().contains("no devices") || raw.to_lowercase().contains("not found") {
            format!("Could not {action}. No device found. Check the USB connection and that ADB debugging is enabled.")
        } else if raw.to_lowercase().contains("closed") || raw.to_lowercase().contains("connection reset") {
            format!("Could not {action}. The connection was interrupted.")
        } else {
            format!("Could not {action}.")
        };

        Self {
            message,
            detail: Some(raw),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            Self::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
        } else {
            Self::with_detail(format!("I/O error while running a command: {e}"), e.to_string())
        }
    }
}
