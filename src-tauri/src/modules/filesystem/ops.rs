//! Operações no filesystem remoto: criar, renomear, excluir.
//!
//! Todo caminho remoto passa por `shell_quote` antes de entrar no shell do
//! dispositivo (nunca interpolação crua).

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::filesystem::list::{join_path, normalize_path};
use crate::modules::util::shell_quote;

/// Cria um diretório (com pais, se necessário).
pub fn mkdir(runner: &AdbRunner, serial: &str, path: &str) -> Result<(), AppError> {
    let clean = normalize_path(path);
    let cmd = format!("mkdir -p {}", shell_quote(&clean));
    let out = runner.run_serial(serial, &["shell", &cmd])?;
    check_ok(&out, &format!("Failed to create directory {clean}"))
}

/// Cria um arquivo vazio.
pub fn touch(runner: &AdbRunner, serial: &str, path: &str) -> Result<(), AppError> {
    let clean = normalize_path(path);
    let cmd = format!("touch {}", shell_quote(&clean));
    let out = runner.run_serial(serial, &["shell", &cmd])?;
    check_ok(&out, &format!("Failed to create file {clean}"))
}

/// Renomeia/move um arquivo ou diretório.
pub fn rename(
    runner: &AdbRunner,
    serial: &str,
    from: &str,
    to: &str,
) -> Result<(), AppError> {
    let from_c = normalize_path(from);
    let to_c = normalize_path(to);
    let cmd = format!("mv {} {}", shell_quote(&from_c), shell_quote(&to_c));
    let out = runner.run_serial(serial, &["shell", &cmd])?;
    check_ok(&out, &format!("Failed to rename {from_c}"))
}

/// Exclui um arquivo ou diretório (recursivo).
pub fn delete(runner: &AdbRunner, serial: &str, path: &str) -> Result<(), AppError> {
    let clean = normalize_path(path);
    if clean == "/" {
        return Err(AppError::new("Refusing to delete the root directory."));
    }
    let cmd = format!("rm -rf {}", shell_quote(&clean));
    let out = runner.run_serial(serial, &["shell", &cmd])?;
    check_ok(&out, &format!("Failed to delete {clean}"))
}

/// Copia um arquivo ou diretório (recursivo) para destino.
pub fn copy(
    runner: &AdbRunner,
    serial: &str,
    from: &str,
    to: &str,
) -> Result<(), AppError> {
    let from_c = normalize_path(from);
    let to_c = normalize_path(to);
    let cmd = format!("cp -r {} {}", shell_quote(&from_c), shell_quote(&to_c));
    let out = runner.run_serial(serial, &["shell", &cmd])?;
    check_ok(&out, &format!("Failed to copy {from_c}"))
}

/// Caminho para novo item dentro de um diretório (ex.: pasta pai + nome).
pub fn child_path(parent: &str, name: &str) -> String {
    join_path(&normalize_path(parent), name)
}

fn check_ok(out: &crate::modules::adb::executor::CmdOut, msg: &str) -> Result<(), AppError> {
    if out.exit_code != Some(0) {
        Err(AppError::with_detail(msg.to_string(), out.stderr.clone()))
    } else {
        Ok(())
    }
}
