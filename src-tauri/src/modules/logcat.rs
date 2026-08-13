//! Fase 3: visualizador de logcat em streaming.
//!
//! Mantém uma sessão única de `adb logcat -v threadtime` em um processo local.
//! As linhas vão para um buffer circular (últimas 800) e são emitidas como
//! eventos `logcat:line`. O frontend pode começar/parar, limpar o buffer do
//! device (`logcat -c`) e ler o snapshot do buffer ao abrir a tela.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

const BUFFER_CAP: usize = 800;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogcatLine {
    pub serial: String,
    pub line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogcatStopped {
    pub reason: String,
}

struct Session {
    serial: String,
    token: String,
    child: Mutex<Option<Child>>,
    buffer: Arc<Mutex<VecDeque<String>>>,
}

static SESSION: OnceLock<Mutex<Option<Session>>> = OnceLock::new();

fn session() -> &'static Mutex<Option<Session>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

/// Inicia o streaming de logcat. Retorna o token da sessão.
pub fn start(runner: &AdbRunner, app: AppHandle, serial: &str) -> Result<String, AppError> {
    stop();

    let mut child = Command::new(&runner.adb_path)
        .args(["-s", serial, "logcat", "-v", "threadtime"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
            } else {
                AppError::with_detail(format!("Failed to start logcat: {e}"), e.to_string())
            }
        })?;

    let token = format!("log-{}", crate::modules::util::timestamp_ms());
    let buffer: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::with_capacity(BUFFER_CAP)));
    let buf2 = buffer.clone();
    let serial2 = serial.to_string();

    let stdout = child.stdout.take();
    *session().lock().unwrap() = Some(Session {
        serial: serial.to_string(),
        token: token.clone(),
        child: Mutex::new(Some(child)),
        buffer: buffer.clone(),
    });

    // Reader thread: emite cada linha como evento e mantém o buffer.
    if let Some(so) = stdout {
        let app2 = app.clone();
        let serial3 = serial2.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(so);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                {
                    let mut b = buf2.lock().unwrap();
                    if b.len() >= BUFFER_CAP {
                        b.pop_front();
                    }
                    b.push_back(line.clone());
                }
                let _ = app2.emit(
                    "logcat:line",
                    LogcatLine {
                        serial: serial3.clone(),
                        line,
                    },
                );
            }
            let _ = app2.emit("logcat:stopped", LogcatStopped { reason: "stream ended".into() });
        });
    }

    // Watcher: quando o child terminar, limpa a sessão.
    let t2 = token.clone();
    std::thread::spawn(move || {
        let wait_child = {
            let guard = session().lock().unwrap();
            match guard.as_ref() {
                Some(s) if s.token == t2 => s.child.lock().unwrap().take(),
                _ => None,
            }
        };
        if let Some(mut c) = wait_child {
            let _ = c.wait();
            if let Ok(mut s) = session().lock() {
                if s.as_ref().map(|x| x.token == t2).unwrap_or(false) {
                    *s = None;
                }
            }
        }
    });

    Ok(token)
}

/// Para a sessão atual (se houver).
pub fn stop() {
    let mut guard = session().lock().unwrap();
    if let Some(s) = guard.take() {
        if let Some(mut c) = s.child.lock().unwrap().take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

/// Limpa os buffers do logcat no device (`logcat -c`).
pub fn clear(runner: &AdbRunner, serial: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["logcat", "-c"])?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail("Failed to clear logcat on device.", out.stderr));
    }
    // Limpa também o buffer local.
    if let Ok(s) = session().lock() {
        if let Some(sess) = s.as_ref() {
            if sess.serial == serial {
                sess.buffer.lock().unwrap().clear();
            }
        }
    }
    Ok(())
}

/// Retorna as últimas linhas do buffer (snapshot para abrir a tela).
pub fn snapshot() -> Vec<String> {
    let guard = session().lock().unwrap();
    match guard.as_ref() {
        Some(s) => s.buffer.lock().unwrap().iter().cloned().collect(),
        None => Vec::new(),
    }
}

/// True se há sessão ativa.
pub fn active() -> bool {
    session().lock().unwrap().is_some()
}
