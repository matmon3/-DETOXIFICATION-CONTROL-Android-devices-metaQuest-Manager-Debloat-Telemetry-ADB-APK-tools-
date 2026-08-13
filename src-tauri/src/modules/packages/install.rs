//! Instalação de APKs com progresso em tempo real e cancelamento.
//!
//! Usa `adb install` / `adb install-multiple` com streaming de stderr para
//! extrair a porcentagem e emitir eventos `transfer:*`. Tudo roda do host
//! (adb faz o upload sozinho), sem push intermediário.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::transfer::{TransferDone, TransferProgress, TransferRegistry};

#[derive(Clone)]
pub struct InstallOpts {
    pub replace: bool,
    pub grant_all: bool,
}

/// Inicia a instalação em thread e retorna o token da operação.
pub fn start_install(
    runner: &AdbRunner,
    registry: Arc<TransferRegistry>,
    app: AppHandle,
    serial: &str,
    apk_paths: &[String],
    opts: InstallOpts,
) -> Result<String, AppError> {
    if apk_paths.is_empty() {
        return Err(AppError::new("No APK selected for install."));
    }
    for p in apk_paths {
        if !Path::new(p).exists() {
            return Err(AppError::new(format!("APK not found: {p}")));
        }
    }

    let (token, cancel) = registry.create();
    let app2 = app.clone();
    let runner = runner.clone();
    let serial = serial.to_string();
    let paths = apk_paths.to_vec();
    let token_out = token.clone();

    std::thread::spawn(move || {
        let result = do_install(&runner, &serial, &paths, &opts, &app2, &token, cancel);
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

fn do_install(
    runner: &AdbRunner,
    serial: &str,
    paths: &[String],
    opts: &InstallOpts,
    app: &AppHandle,
    token: &str,
    cancel: Arc<AtomicBool>,
) -> Result<String, AppError> {
    let mut args: Vec<String> = vec![String::from("install")];
    if paths.len() > 1 {
        args[0] = String::from("install-multiple");
    }
    if opts.replace {
        args.push(String::from("-r"));
    }
    if opts.grant_all {
        args.push(String::from("-g"));
    }
    args.extend(paths.iter().cloned());

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
        let stderr = out.stderr.trim();
        let message = if stderr.contains("INSTALL_FAILED_VERSION_DOWNGRADE") {
            "A newer version of this app is already installed."
        } else if stderr.contains("INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
            "Update incompatible with the installed version. Try uninstalling first."
        } else if stderr.contains("INSTALL_FAILED_ALREADY_EXISTS") {
            "App already installed. Enable 'Replace' to update."
        } else if stderr.contains("INSTALL_FAILED_INSUFFICIENT_STORAGE") {
            "Not enough storage on device."
        } else if stderr.contains("INSTALL_FAILED_USER_RESTRICTED") {
            "Installation restricted by the device (check developer options / install restrictions)."
        } else {
            "Installation failed on device."
        };
        return Err(AppError::with_detail(
            message.to_string(),
            stderr.to_string(),
        ));
    }
    Ok("App installed successfully.".into())
}
