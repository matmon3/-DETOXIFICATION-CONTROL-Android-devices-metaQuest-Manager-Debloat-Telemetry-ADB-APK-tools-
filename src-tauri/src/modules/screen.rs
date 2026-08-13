//! Fase 3: screenshot e gravação de tela.
//!
//! - Screenshot: `adb exec-out screencap -p` com stdout redirecionado para um
//!   arquivo local (formato PNG binário, sem passar por string).
//! - Screenrecord: `adb shell screenrecord <opts> <remote>` mantido em um
//!   processo local; `stop` envia `pkill -INT` no device para finalizar o mp4
//!   corretamente. O vídeo fica no device e é puxado/removido depois.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

#[derive(Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordOpts {
    /// Ex.: "1280x720"
    pub size: Option<String>,
    /// Bitrate em bits/s (ex.: "8000000").
    pub bitrate: Option<String>,
    /// FPS (ex.: "30").
    pub fps: Option<String>,
    /// Tempo máximo em segundos (limitador interno do screenrecord).
    pub time_limit: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordStarted {
    pub token: String,
    pub remote_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordStopped {
    pub token: String,
    pub ok: bool,
    pub message: String,
    pub remote_path: Option<String>,
}

struct Recording {
    serial: String,
    remote_path: String,
    child: Mutex<Option<Child>>,
}

static RECORDINGS: OnceLock<Mutex<HashMap<String, Recording>>> = OnceLock::new();

fn recordings() -> &'static Mutex<HashMap<String, Recording>> {
    RECORDINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| format!("{}{:03}", d.as_secs(), d.subsec_millis()))
        .unwrap_or_else(|_| "0".into())
}

fn ts_path() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| {
            let s = d.as_secs();
            format!("{:02}-{:02}-{:02}", (s / 3600) % 24, (s / 60) % 60, s % 60)
        })
        .unwrap_or_else(|_| "000000".into())
}

fn day_path() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| {
            let days = d.as_secs() / 86400;
            format!("{}-{:02}-{:02}", days / 365 + 1970, (days % 365) / 30 + 1, days % 30 + 1)
        })
        .unwrap_or_else(|_| "unknown".into())
}

/// Tira um screenshot e salva em `dest_dir` (PNG). Retorna o caminho do arquivo.
pub fn take_screenshot(
    runner: &AdbRunner,
    serial: &str,
    dest_dir: &str,
) -> Result<String, AppError> {
    let dest = PathBuf::from(dest_dir);
    std::fs::create_dir_all(&dest).map_err(|e| {
        AppError::with_detail(format!("Cannot create screenshot dir: {dest_dir}"), e.to_string())
    })?;
    let name = format!("aqm-{}-{}.png", day_path(), ts_path());
    let file = dest.join(&name);
    let file_handle = std::fs::File::create(&file).map_err(|e| {
        AppError::with_detail(format!("Cannot create screenshot file: {}", file.display()), e.to_string())
    })?;

    let mut child = Command::new(&runner.adb_path)
        .args(["-s", serial, "exec-out", "screencap", "-p"])
        .stdin(Stdio::null())
        .stdout(Stdio::from(file_handle))
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
            } else {
                AppError::with_detail(format!("Failed to start screencap: {e}"), e.to_string())
            }
        })?;

    let mut stderr = String::new();
    if let Some(mut se) = child.stderr.take() {
        let _ = std::io::Read::read_to_string(&mut se, &mut stderr);
    }
    let status = child.wait().map_err(|e| AppError::with_detail("Failed waiting for screencap", e.to_string()))?;
    if !status.success() {
        let _ = std::fs::remove_file(&file);
        let msg = if stderr.to_lowercase().contains("unauthorized") {
            "Screenshot failed. The device has not authorized this computer."
        } else if stderr.to_lowercase().contains("offline") {
            "Screenshot failed. The device is offline."
        } else {
            "Screenshot failed on device."
        };
        return Err(AppError::with_detail(msg, stderr));
    }
    Ok(file.to_string_lossy().to_string())
}

/// Inicia a gravação de tela no device. Retorna (token, remote_path).
pub fn start_record(
    runner: &AdbRunner,
    app: AppHandle,
    serial: &str,
    opts: &RecordOpts,
) -> Result<RecordStarted, AppError> {
    // Se já existe gravação ativa, encerra antes de iniciar outra.
    if let Ok(mut map) = recordings().lock() {
        let existing: Vec<String> = map.keys().cloned().collect();
        for t in existing {
            if let Some(rec) = map.remove(&t) {
                stop_internal(&rec);
            }
        }
    }

    let remote_path = format!("/sdcard/aqm-record-{}.mp4", timestamp());
    let mut args = vec!["-s".to_string(), serial.to_string(), "shell".to_string(), "screenrecord".to_string()];
    if let Some(sz) = &opts.size {
        args.push("--size".into());
        args.push(sz.clone());
    }
    if let Some(br) = &opts.bitrate {
        args.push("--bit-rate".into());
        args.push(br.clone());
    }
    if let Some(fps) = &opts.fps {
        args.push("--fps".into());
        args.push(fps.clone());
    }
    if let Some(limit) = opts.time_limit {
        args.push("--time-limit".into());
        args.push(limit.to_string());
    }
    args.push(remote_path.clone());

    let child = Command::new(&runner.adb_path)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
            } else {
                AppError::with_detail(format!("Failed to start screenrecord: {e}"), e.to_string())
            }
        })?;

    let token = format!("rec-{}", timestamp());
    recordings()
        .lock()
        .unwrap()
        .insert(
            token.clone(),
            Recording {
                serial: serial.to_string(),
                remote_path: remote_path.clone(),
                child: Mutex::new(Some(child)),
            },
        );

    // Watcher: se o child terminar sozinho (ex.: time-limit), emite stopped.
    let t2 = token.clone();
    let app2 = app.clone();
    let rp2 = remote_path.clone();
    let rec_map = recordings();
    std::thread::spawn(move || {
        let wait_child = {
            let guard = rec_map.lock().unwrap();
            guard.get(&t2).and_then(|r| r.child.lock().unwrap().take())
        };
        if let Some(mut c) = wait_child {
            let _ = c.wait();
            let stopped = rec_map.lock().unwrap().remove(&t2).is_some();
            let _ = app2.emit(
                "record:stopped",
                RecordStopped {
                    token: t2.clone(),
                    ok: stopped,
                    message: if stopped {
                        "Recording finished.".into()
                    } else {
                        "Recording ended unexpectedly.".into()
                    },
                    remote_path: if stopped { Some(rp2.clone()) } else { None },
                },
            );
        }
    });

    Ok(RecordStarted { token, remote_path })
}

/// Para uma gravação ativa. Retorna o caminho remoto do mp4.
pub fn stop_record(runner: &AdbRunner, token: &str) -> Result<String, AppError> {
    let rec = recordings()
        .lock()
        .unwrap()
        .remove(token)
        .ok_or_else(|| AppError::new("No active recording with that token."))?;

    // Sinal de interrupção no device finaliza o mp4 corretamente.
    let _ = runner.shell(&rec.serial, "pkill -INT -x screenrecord");

    let mut child = rec.child.lock().unwrap().take();
    if let Some(mut c) = child.take() {
        let deadline = std::time::Instant::now() + Duration::from_secs(6);
        loop {
            match c.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if std::time::Instant::now() >= deadline => {
                    let _ = c.kill();
                    let _ = c.wait();
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(60)),
                Err(_) => break,
            }
        }
    }
    Ok(rec.remote_path)
}

/// Puxa o vídeo do device para `local` e remove o arquivo remoto.
pub fn pull_record(runner: &AdbRunner, serial: &str, remote: &str, local: &str) -> Result<(), AppError> {
    let out = runner.run_for_serial(serial, &["pull".to_string(), remote.to_string(), local.to_string()])?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("Failed to pull recording from {remote}"),
            out.stderr,
        ));
    }
    let _ = runner.shell(serial, &format!("rm -f {}", crate::modules::util::shell_quote(remote)));
    Ok(())
}

fn stop_internal(rec: &Recording) {
    // Não é possível rodar shell aqui (sem runner); apenas mata o child local.
    if let Some(mut c) = rec.child.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

/// Para e remove todas as gravações (usado no shutdown).
pub fn shutdown() {
    if let Ok(mut map) = recordings().lock() {
        for (_, rec) in map.drain() {
            stop_internal(&rec);
        }
    }
}
