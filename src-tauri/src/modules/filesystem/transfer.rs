//! Upload/download de arquivos com progresso (eventos `transfer:*`)
//! e cancelamento.

use std::path::Path;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::transfer::{TransferDone, TransferProgress, TransferRegistry};
use crate::modules::util::shell_quote;

#[derive(Clone, Copy, PartialEq)]
pub enum Direction {
    Push,
    Pull,
}

/// Inicia upload (Push) ou download (Pull) em thread e retorna o token.
pub fn start_transfer(
    runner: &AdbRunner,
    registry: Arc<TransferRegistry>,
    app: AppHandle,
    serial: &str,
    direction: Direction,
    local: &str,
    remote: &str,
) -> Result<String, AppError> {
    match direction {
        Direction::Push => {
            if !Path::new(local).exists() {
                return Err(AppError::new(format!("Local file not found: {local}")));
            }
        }
        Direction::Pull => {
            if local.is_empty() {
                return Err(AppError::new("Local destination is empty."));
            }
        }
    }

    let (token, cancel) = registry.create();
    let app2 = app.clone();
    let runner = runner.clone();
    let serial = serial.to_string();
    let local = local.to_string();
    let remote = remote.to_string();
    let token_out = token.clone();

    std::thread::spawn(move || {
        let result = do_transfer(&runner, &serial, direction, &local, &remote, &app2, &token, cancel);
        let (ok, message, detail) = match result {
            Ok(msg) => (true, msg, None),
            Err(e) => (false, e.message.clone(), e.detail.clone()),
        };
        let _ = app2.emit(
            "transfer:done",
            TransferDone { token: token.clone(), ok, message, detail },
        );
        registry.finish(&token);
    });

    Ok(token_out)
}

fn do_transfer(
    runner: &AdbRunner,
    serial: &str,
    direction: Direction,
    local: &str,
    remote: &str,
    app: &AppHandle,
    token: &str,
    cancel: Arc<std::sync::atomic::AtomicBool>,
) -> Result<String, AppError> {
    let verb = if direction == Direction::Push { "push" } else { "pull" };
    let mut args = vec![String::from(verb)];
    if direction == Direction::Push {
        args.push(local.to_string());
        args.push(remote.to_string());
    } else {
        args.push(remote.to_string());
        args.push(local.to_string());
    }

    let stderr_events = app.clone();
    let t2a = token.to_string();
    let t2b = t2a.clone();
    let last_pct = Arc::new(Mutex::new(None::<u8>));
    let e1 = stderr_events.clone();
    let lp = last_pct.clone();
    let e2 = stderr_events;
    let out = runner.run_streaming(
        serial,
        &args,
        cancel,
        move |line| {
            let _ = e1.emit(
                "transfer:progress",
                TransferProgress {
                    token: t2a.clone(),
                    pct: None,
                    line: Some(line),
                },
            );
        },
        move |pct| {
            let mut last = lp.lock().unwrap();
            if last.map(|l| pct >= l).unwrap_or(true) {
                *last = Some(pct);
                let _ = e2.emit(
                    "transfer:progress",
                    TransferProgress {
                        token: t2b.clone(),
                        pct: Some(pct),
                        line: None,
                    },
                );
            }
        },
    )?;

    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("adb {verb} failed"),
            out.stderr,
        ));
    }
    let remote_disp = if direction == Direction::Push {
        format!("{remote} ({} bytes)", local_size(local))
    } else {
        remote.to_string()
    };
    Ok(format!("{verb} completed: {remote_disp}"))
}

/// Caminho remoto quoteado para uso em comandos shell (ex.: remoção pós-install).
pub fn quote_remote(path: &str) -> String {
    shell_quote(path)
}

fn local_size(path: &str) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}
