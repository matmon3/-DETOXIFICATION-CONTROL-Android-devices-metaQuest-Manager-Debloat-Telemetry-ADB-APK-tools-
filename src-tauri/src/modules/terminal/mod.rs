//! Terminal ADB integrado.
//!
//! Converte a linha digitada pelo usuário em argumentos estruturados
//! (via shlex) e executa com `adb`, nunca através de um shell. O prefixo
//! `adb ` é opcional; o serial é injetado automaticamente quando selecionado.

use crate::error::AppError;
use crate::modules::adb::executor::CmdOut;
use crate::modules::devices::DeviceManager;

/// Executa um comando do terminal ADB.
///
/// `input` pode ser `adb shell ls` ou `shell ls`. Se `serial` for informado
/// e o comando ainda não contiver `-s`, o serial é injetado após `adb`.
pub fn execute(
    manager: &DeviceManager,
    input: &str,
    serial: Option<&str>,
) -> Result<CmdOut, AppError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("Empty command."));
    }

    // Exclui comandos shell nativos (sh -c / bash / eval / etc.) por segurança.
    let first = trimmed.split_whitespace().next().unwrap_or("");
    let banned = ["sh", "bash", "zsh", "eval", "xargs", "su", "sudo", "rm", "dd"];
    if banned.contains(&first) {
        return Err(AppError::with_detail(
            format!("`{first}` is not allowed in the ADB terminal. Run device commands via `adb shell <cmd>` instead."),
            "Shell wrappers are disabled to prevent unsafe execution on the host.",
        ));
    }

    let mut tokens: Vec<String> = shlex::split(trimmed)
        .ok_or_else(|| AppError::new("Could not parse the command. Check quoting."))?;
    if tokens.is_empty() {
        return Err(AppError::new("Empty command."));
    }

    // Remove prefixo `adb`
    if tokens[0] == "adb" {
        tokens.remove(0);
    }
    if tokens.is_empty() {
        return Err(AppError::new("Empty command."));
    }

    // Injeta serial quando ausente
    if let Some(serial) = serial {
        if !tokens.windows(2).any(|w| w[0] == "-s") {
            let mut full = vec!["-s".to_string(), serial.to_string()];
            full.append(&mut tokens);
            tokens = full;
        }
    }

    manager.adb_runner().run(&tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_adb_prefix() {
        let tokens: Vec<String> = shlex::split("adb shell getprop ro.product.model").unwrap();
        assert_eq!(tokens[0], "adb");
    }

    #[test]
    fn parses_quoted_args() {
        let tokens = shlex::split("shell \"echo 'hi world'\"").unwrap();
        assert_eq!(tokens, ["shell", "echo 'hi world'"]);
    }
}
