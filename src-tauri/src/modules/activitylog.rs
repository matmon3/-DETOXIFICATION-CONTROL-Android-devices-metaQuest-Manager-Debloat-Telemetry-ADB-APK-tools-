//! Activity Log (Fase 7 - DETOXIFICATION CONTROL).
//!
//! Registra tudo que o app faz no dispositivo. Mantém um ring buffer em
//! memória (500 entradas) e persiste em `~/.config/detoxification-control/activity.json`.
//! Cada nova entrada emite o evento `log:entry` para a UI.

use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::config;

const MAX_ENTRIES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    /// "16:42:10"
    pub time: String,
    /// Serial ou modelo do dispositivo.
    pub device: String,
    /// "ADB COMMAND" | "APP" | "FILES" | "OPTIMIZER" | "DEBLOAT" | "SCREEN" | ...
    pub kind: String,
    pub command: String,
    /// "SUCCESS" | "ERROR"
    pub result: String,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
    /// Label humano da operação.
    pub operation: String,
}

static STORE: OnceLock<Mutex<Vec<LogEntry>>> = OnceLock::new();

fn store() -> &'static Mutex<Vec<LogEntry>> {
    STORE.get_or_init(|| Mutex::new(load_file()))
}

fn now_parts() -> (u64, String) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let hh = (now / 3600) % 24;
    let mm = (now / 60) % 60;
    let ss = now % 60;
    (now, format!("{hh:02}:{mm:02}:{ss:02}"))
}

fn log_file() -> std::path::PathBuf {
    config::data_dir().join("activity.json")
}

fn load_file() -> Vec<LogEntry> {
    std::fs::read_to_string(log_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist(entries: &[LogEntry]) {
    let dir = config::data_dir();
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(json) = serde_json::to_string_pretty(entries) {
        let _ = std::fs::write(log_file(), json);
    }
}

/// Registra uma entrada (sem emitir evento).
pub fn record(entry: LogEntry) {
    let mut st = store().lock().unwrap();
    st.push(entry);
    if st.len() > MAX_ENTRIES {
        let excess = st.len() - MAX_ENTRIES;
        st.drain(0..excess);
    }
    persist(&st);
}

/// Cria e registra uma entrada, emitindo `log:entry` se `app` for Some.
pub fn push(app: Option<&AppHandle>, entry: LogEntry) {
    record(entry.clone());
    if let Some(app) = app {
        let _ = app.emit("log:entry", entry);
    }
}

/// Registro + evento. Conveniência para comandos.
pub fn logged(
    app: Option<&AppHandle>,
    device: &str,
    kind: &str,
    operation: &str,
    command: &str,
    result: &str,
    exit_code: Option<i32>,
    error: Option<String>,
) {
    let (_, time) = now_parts();
    let id = {
        let st = store().lock().unwrap();
        st.last().map(|l| l.id + 1).unwrap_or(1)
    };
    let entry = LogEntry {
        id,
        time,
        device: device.to_string(),
        kind: kind.to_string(),
        command: command.to_string(),
        result: result.to_string(),
        exit_code,
        error,
        operation: operation.to_string(),
    };
    push(app, entry);
}

/// Lista entradas, opcionalmente filtradas.
pub fn list(filter: Option<&str>) -> Vec<LogEntry> {
    let st = store().lock().unwrap();
    let mut v = st.clone();
    v.reverse();
    if let Some(f) = filter {
        let f = f.to_lowercase();
        v.retain(|e| {
            e.command.to_lowercase().contains(&f)
                || e.device.to_lowercase().contains(&f)
                || e.kind.to_lowercase().contains(&f)
                || e.operation.to_lowercase().contains(&f)
                || e.result.to_lowercase().contains(&f)
        });
    }
    v
}

/// Limpa o histórico.
pub fn clear() {
    store().lock().unwrap().clear();
    persist(&[]);
}

/// Exporta o histórico como JSON.
pub fn export_json() -> String {
    let st = store().lock().unwrap();
    serde_json::to_string_pretty(&*st).unwrap_or_else(|_| "[]".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_roundtrip() {
        clear();
        record(LogEntry {
            id: 1,
            time: "16:42:10".into(),
            device: "1WMHH12".into(),
            kind: "ADB COMMAND".into(),
            command: "adb shell getprop".into(),
            result: "SUCCESS".into(),
            exit_code: Some(0),
            error: None,
            operation: "Get props".into(),
        });
        let all = list(None);
        assert_eq!(all.len(), 1);
        let f = list(Some("getprop"));
        assert_eq!(f.len(), 1);
        let f2 = list(Some("xxxx"));
        assert_eq!(f2.len(), 0);
        clear();
    }
}
