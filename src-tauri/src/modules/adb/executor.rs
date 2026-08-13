//! Motor de execução do ADB.
//!
//! Responsável por invocar o binário `adb` com argumentos estruturados
//! (nunca via `sh -c`), com timeout e captura segura de stdout/stderr.
//! Separado da lógica de UI para permitir mocks em testes.

use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::AppError;

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct CmdOut {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

impl CmdOut {
    pub fn is_ok(&self) -> bool {
        self.exit_code == Some(0)
    }
    pub fn stdout_trimmed(&self) -> &str {
        self.stdout.trim()
    }
}

#[derive(Debug, Clone)]
pub struct AdbRunner {
    pub adb_path: PathBuf,
    pub timeout: Duration,
}

impl AdbRunner {
    pub fn new(adb_path: PathBuf) -> Self {
        Self {
            adb_path,
            timeout: Duration::from_secs(20),
        }
    }

    pub fn with_timeout(mut self, d: Duration) -> Self {
        self.timeout = d;
        self
    }

    /// Executa `adb <args>` (sem serial).
    pub fn run(&self, args: &[String]) -> Result<CmdOut, AppError> {
        self.run_impl(args)
    }

    /// Executa `adb -s <serial> <args>`.
    pub fn run_for_serial(&self, serial: &str, args: &[String]) -> Result<CmdOut, AppError> {
        let mut full = vec!["-s".to_string(), serial.to_string()];
        full.extend_from_slice(args);
        self.run_impl(&full)
    }

    /// Executa `adb -s <serial> <args>` (args como `&[&str]`, padrão dos módulos).
    pub fn run_serial(&self, serial: &str, args: &[&str]) -> Result<CmdOut, AppError> {
        let mut full = vec!["-s".to_string(), serial.to_string()];
        full.extend(args.iter().map(|s| s.to_string()));
        self.run_impl(&full)
    }

    /// Executa `adb -s <serial> shell <cmd>` — o comando shell é passado como
    /// um único argumento estruturado, evitando eval/injeção.
    pub fn shell(&self, serial: &str, cmd: &str) -> Result<CmdOut, AppError> {
        self.run_for_serial(serial, &["shell".to_string(), cmd.to_string()])
    }

    /// Executa um comando de shell do dispositivo em lote (junta com `;`).
    pub fn shell_batch(&self, serial: &str, cmds: &[&str]) -> Result<CmdOut, AppError> {
        self.shell(serial, &cmds.join(";"))
    }

    fn run_impl(&self, args: &[String]) -> Result<CmdOut, AppError> {
        let mut child = Command::new(&self.adb_path)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    AppError::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
                } else {
                    AppError::with_detail(format!("Failed to start adb: {e}"), e.to_string())
                }
            })?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let out_buf = Arc::new(Mutex::new(String::new()));
        let err_buf = Arc::new(Mutex::new(String::new()));

        if let Some(mut so) = stdout {
            let buf = out_buf.clone();
            std::thread::spawn(move || {
                let mut s = String::new();
                let _ = so.read_to_string(&mut s);
                *buf.lock().unwrap() = s;
            });
        }
        if let Some(mut se) = stderr {
            let buf = err_buf.clone();
            std::thread::spawn(move || {
                let mut s = String::new();
                let _ = se.read_to_string(&mut s);
                *buf.lock().unwrap() = s;
            });
        }

        let deadline = Instant::now() + self.timeout;
        let mut timed_out = false;
        let exit_code = loop {
            match child.try_wait() {
                Ok(Some(st)) => break st.code().or(Some(-1)),
                Ok(None) => {
                    if Instant::now() >= deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        timed_out = true;
                        break Some(-1);
                    }
                    std::thread::sleep(Duration::from_millis(40));
                }
                Err(e) => {
                    return Err(AppError::with_detail(
                        format!("Failed while waiting for adb: {e}"),
                        e.to_string(),
                    ))
                }
            }
        };

        let stdout_text = out_buf.lock().unwrap().clone();
        let stderr_text = err_buf.lock().unwrap().clone();
        Ok(CmdOut {
            stdout: stdout_text,
            stderr: stderr_text,
            exit_code: if timed_out { None } else { exit_code },
            timed_out,
        })
    }

    /// Executa um comando em modo streaming.
    ///
    /// - `cancel`: quando o AtomicBool virar `true`, o processo é encerrado.
    /// - `on_line`: chamado para cada linha do stderr (progresso de instalação/push).
    /// - `on_progress`: chamado quando uma linha de stderr contém uma porcentagem
    ///   (formato adb: `[ 45%]` / `45%`). Retorna a porcentagem extraída (0-100).
    /// - Timeout longo (default 300s) para operações de transferência.
    pub fn run_streaming(
        &self,
        serial: &str,
        args: &[String],
        cancel: Arc<AtomicBool>,
        on_line: impl Fn(String) + Send + 'static,
        on_progress: impl Fn(u8) + Send + 'static,
    ) -> Result<CmdOut, AppError> {
        self.run_streaming_impl(serial, args, cancel, Duration::from_secs(300), on_line, on_progress)
    }

    fn run_streaming_impl(
        &self,
        serial: &str,
        args: &[String],
        cancel: Arc<AtomicBool>,
        timeout: Duration,
        on_line: impl Fn(String) + Send + 'static,
        on_progress: impl Fn(u8) + Send + 'static,
    ) -> Result<CmdOut, AppError> {
        let mut full = vec!["-s".to_string(), serial.to_string()];
        full.extend_from_slice(args);
        let mut child = Command::new(&self.adb_path)
            .args(&full)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    AppError::new("ADB binary not found. Install android-tools or set the ADB path in Settings.")
                } else {
                    AppError::with_detail(format!("Failed to start adb: {e}"), e.to_string())
                }
            })?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let out_buf = Arc::new(Mutex::new(String::new()));

        if let Some(so) = stdout {
            let buf = out_buf.clone();
            std::thread::spawn(move || {
                let mut s = String::new();
                let _ = BufReader::new(so).read_to_string(&mut s);
                *buf.lock().unwrap() = s;
            });
        }
        if let Some(se) = stderr {
            std::thread::spawn(move || {
                let reader = BufReader::new(se);
                for line in reader.lines() {
                    let Ok(line) = line else { break };
                    if !line.trim().is_empty() {
                        on_line(line.clone());
                    }
                    if let Some(pct) = extract_percent(&line) {
                        on_progress(pct);
                    }
                }
            });
        }

        let deadline = Instant::now() + timeout;
        let mut timed_out = false;
        let exit_code = loop {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.wait();
                break Some(-1);
            }
            match child.try_wait() {
                Ok(Some(st)) => break st.code().or(Some(-1)),
                Ok(None) => {
                    if Instant::now() >= deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        timed_out = true;
                        break Some(-1);
                    }
                    std::thread::sleep(Duration::from_millis(40));
                }
                Err(e) => {
                    return Err(AppError::with_detail(
                        format!("Failed while waiting for adb: {e}"),
                        e.to_string(),
                    ))
                }
            }
        };

        let stdout_text = out_buf.lock().unwrap().clone();
        Ok(CmdOut {
            stdout: stdout_text,
            stderr: String::new(),
            exit_code: if timed_out { None } else { exit_code },
            timed_out,
        })
    }

    /// Mata um processo se ainda estiver vivo (usado pelo cancelamento).
    pub fn kill(child: &mut Child) {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Extrai uma porcentagem `[ 45%]` / `app.apk: 12%` de uma linha do adb.
fn extract_percent(line: &str) -> Option<u8> {
    let bytes = line.as_bytes();
    for i in (0..bytes.len()).rev() {
        if bytes[i] != b'%' {
            continue;
        }
        let mut j = i;
        while j > 0 && bytes[j - 1].is_ascii_digit() {
            j -= 1;
        }
        if j < i {
            if let Ok(v) = line[j..i].parse::<u8>() {
                if v <= 100 {
                    return Some(v);
                }
            }
        }
        break;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_progress() {
        assert_eq!(extract_percent("[  45%]"), Some(45));
        assert_eq!(extract_percent("app.apk: 12%"), Some(12));
        assert_eq!(extract_percent("Performing Streamed Install"), None);
        assert_eq!(extract_percent("[100%]"), Some(100));
    }
}
