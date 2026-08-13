use std::path::PathBuf;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// Configurações persistidas em ~/.config/detoxification-control/settings.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Settings {
    /// Caminho explícito para o binário adb. Se vazio, procura no PATH.
    pub adb_path: Option<String>,
    /// Caminho explícito para o binário fastboot. Se vazio, procura no PATH.
    pub fastboot_path: Option<String>,
    /// Diretório padrão para downloads/screenshots do PC.
    pub download_dir: Option<String>,
    /// Diretório padrão para backups.
    pub backup_dir: Option<String>,
    /// Tema: "dark" | "light"
    pub theme: Option<String>,
}

const APP_DIR: &str = "detoxification-control";

/// Diretório base de dados do app.
///
/// - Linux: `~/.config/detoxification-control` (ou `$XDG_CONFIG_HOME`)
/// - Windows: `%APPDATA%\detoxification-control`
pub fn data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
        base.join(APP_DIR)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let base = std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"));
        base.join(APP_DIR)
    }
}

fn settings_file() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn load() -> Settings {
    let path = settings_file();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let path = settings_file();
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn cached() -> &'static Settings {
    static CACHE: OnceLock<Settings> = OnceLock::new();
    CACHE.get_or_init(load)
}

/// Cache carregado na inicialização. Usado para resolução do binário adb.
pub fn current() -> &'static Settings {
    cached()
}

/// Nomes de binário a procurar no PATH. No Windows o executável é `<name>.exe`.
fn candidate_names(name: &str) -> Vec<String> {
    let base = name.to_string();
    #[cfg(target_os = "windows")]
    {
        if base.to_lowercase().ends_with(".exe") {
            vec![base]
        } else {
            vec![format!("{name}.exe"), base]
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = base;
        vec![name.to_string()]
    }
}

pub fn find_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path_var) {
        for candidate in candidate_names(name) {
            let candidate = dir.join(candidate);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Resolve o binário adb: settings > env DETOXIFICATION_CONTROL_ADB > PATH > fallback "adb".
pub fn resolve_adb() -> PathBuf {
    if let Some(p) = current().adb_path.as_deref() {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    if let Ok(p) = std::env::var("DETOXIFICATION_CONTROL_ADB") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    find_in_path("adb").unwrap_or_else(|| PathBuf::from("adb"))
}

pub fn resolve_fastboot() -> Option<PathBuf> {
    if let Some(p) = current().fastboot_path.as_deref() {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    find_in_path("fastboot")
}
