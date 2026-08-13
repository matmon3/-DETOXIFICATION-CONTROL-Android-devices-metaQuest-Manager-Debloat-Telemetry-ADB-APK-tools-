//! Command Library (Fase 7 - DETOXIFICATION CONTROL).
//!
//! Biblioteca de comandos ADB salvos pelo usuário. Persistida em
//! `~/.config/detoxification-control/commands.json`. Execução sempre via
//! `process spawn` estruturado — a string é parseada com shlex em args,
//! nunca passada a `sh -c`.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::AppError;
use crate::modules::adb::executor::{AdbRunner, CmdOut};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCommand {
    pub id: String,
    pub name: String,
    /// Comando ADB. Se começa com "shell", o restante é o comando do device.
    pub command: String,
    /// "any" | "quest" | "android"
    pub device: String,
    pub category: String,
    /// "LOW" | "MEDIUM" | "HIGH"
    pub risk: String,
    pub favorite: bool,
    pub created: String,
    pub updated: String,
}

impl Default for SavedCommand {
    fn default() -> Self {
        let now = now_iso();
        Self {
            id: String::new(),
            name: "New Command".into(),
            command: "shell getprop".into(),
            device: "any".into(),
            category: "Other".into(),
            risk: "LOW".into(),
            favorite: false,
            created: now.clone(),
            updated: now,
        }
    }
}

fn now_iso() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| {
            let s = d.as_secs();
            let days = s / 86400;
            format!(
                "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
                1970 + days / 365,
                (days % 365) / 30 + 1,
                days % 30 + 1,
                (s / 3600) % 24,
                (s / 60) % 60,
                s % 60
            )
        })
        .unwrap_or_else(|_| "unknown".into())
}

fn store_file() -> std::path::PathBuf {
    config::data_dir().join("commands.json")
}

fn load_all() -> Vec<SavedCommand> {
    std::fs::read_to_string(store_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_all(cmds: &[SavedCommand]) -> Result<(), String> {
    let dir = config::data_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cmds).map_err(|e| e.to_string())?;
    std::fs::write(store_file(), json).map_err(|e| e.to_string())
}

fn new_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("cmd-{ts}")
}

/// Lista os comandos salvos.
pub fn list() -> Vec<SavedCommand> {
    let mut cmds = load_all();
    cmds.sort_by(|a, b| {
        b.favorite
            .cmp(&a.favorite)
            .then_with(|| a.category.cmp(&b.category))
            .then_with(|| a.name.cmp(&b.name))
    });
    cmds
}

/// Cria ou atualiza um comando. Se `id` vazio, gera um novo.
pub fn save(cmd: &SavedCommand) -> Result<SavedCommand, AppError> {
    let mut cmds = load_all();
    let now = now_iso();
    let mut stored = cmd.clone();
    if stored.id.is_empty() {
        stored.id = new_id();
        stored.created = now.clone();
    }
    stored.updated = now;

    if let Some(existing) = cmds.iter_mut().find(|c| c.id == stored.id) {
        *existing = stored.clone();
    } else {
        cmds.push(stored.clone());
    }
    save_all(&cmds).map_err(AppError::new)?;
    Ok(stored)
}

/// Remove um comando pelo id.
pub fn delete(id: &str) -> Result<(), AppError> {
    let mut cmds = load_all();
    cmds.retain(|c| c.id != id);
    save_all(&cmds).map_err(AppError::new)
}

/// Alterna o favorito de um comando.
pub fn toggle_favorite(id: &str) -> Result<SavedCommand, AppError> {
    let mut cmds = load_all();
    let Some(cmd) = cmds.iter_mut().find(|c| c.id == id) else {
        return Err(AppError::new("Command not found."));
    };
    cmd.favorite = !cmd.favorite;
    cmd.updated = now_iso();
    let saved = cmd.clone();
    save_all(&cmds).map_err(AppError::new)?;
    Ok(saved)
}

/// Executa um comando salvo no dispositivo.
///
/// A string é parseada com shlex (estruturado, sem eval). Se o primeiro token
/// for `shell`, o restante é enviado como um único argumento de shell remoto.
pub fn execute(runner: &AdbRunner, serial: &str, id: &str) -> Result<CmdOut, AppError> {
    let cmds = load_all();
    let cmd = cmds
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| AppError::new("Command not found."))?
        .clone();

    if cmd.command.trim().is_empty() {
        return Err(AppError::new("Command is empty."));
    }

    let tokens: Vec<String> = shlex::split(&cmd.command)
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.to_string())
        .collect();
    if tokens.is_empty() {
        return Err(AppError::new("Could not parse command."));
    }

    if tokens[0] == "shell" {
        let shell_cmd = tokens[1..].join(" ");
        runner.shell(serial, &shell_cmd)
    } else {
        runner.run_for_serial(serial, &tokens)
    }
}

/// Exporta a biblioteca como JSON (array).
pub fn export_json() -> Result<String, String> {
    serde_json::to_string_pretty(&load_all()).map_err(|e| e.to_string())
}

/// Importa uma biblioteca de comandos a partir de JSON. Mescla por id.
pub fn import_json(json: &str) -> Result<usize, AppError> {
    let incoming: Vec<SavedCommand> =
        serde_json::from_str(json).map_err(|e| AppError::new(format!("Invalid commands JSON: {e}")))?;
    let mut cmds = load_all();
    let mut added = 0;
    for mut c in incoming {
        if c.id.is_empty() {
            c.id = new_id();
        }
        if let Some(existing) = cmds.iter_mut().find(|x| x.id == c.id) {
            *existing = c;
        } else {
            cmds.push(c);
        }
        added += 1;
    }
    save_all(&cmds).map_err(AppError::new)?;
    Ok(added)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_shell_args() {
        let c = SavedCommand {
            command: "shell getprop ro.product.model".into(),
            ..Default::default()
        };
        let tokens: Vec<String> = shlex::split(&c.command)
            .unwrap()
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(tokens[0], "shell");
        assert_eq!(tokens[1..].join(" "), "getprop ro.product.model");
    }

    #[test]
    fn id_is_generated() {
        assert!(new_id().starts_with("cmd-"));
    }
}
