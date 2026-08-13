//! Sistema de temas (Fase 7 - DETOXIFICATION CONTROL).
//!
//! Tema completo controlado pelo usuário: cores, glow, scanlines, glitch,
//! animações, transparência, bordas, raio, fonte, tamanho e densidade.
//! Persistido em `~/.config/detoxification-control/theme.json` e exportável/importável
//! como JSON.

use serde::{Deserialize, Serialize};

use crate::config;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub name: String,
    /// Cor primária (roxo neon por padrão).
    pub primary: String,
    /// Cor secundária (azul elétrico).
    pub secondary: String,
    /// Cor de destaque (magenta).
    pub accent: String,
    pub text: String,
    pub background: String,
    pub panel: String,
    /// Intensidade do glow neon 0-100.
    pub glow: u8,
    /// Intensidade das scanlines 0-100.
    pub scanlines: u8,
    /// Intensidade do glitch 0-100.
    pub glitch: u8,
    /// Intensidade das animações 0-100.
    pub animations: u8,
    /// Transparência dos painéis 0-100.
    pub transparency: u8,
    /// Espessura das bordas em px.
    pub border_width: u8,
    /// Arredondamento dos elementos em px.
    pub radius: u8,
    /// Fonte monoespaçada.
    pub font: String,
    /// Tamanho base da fonte em px.
    pub font_size: u8,
    /// Densidade da interface 0-100.
    pub density: u8,
}

impl Default for Theme {
    fn default() -> Self {
        Self::preset("NEON PURPLE")
            .expect("default preset")
    }
}

impl Theme {
    /// Retorna um tema pré-definido pelo nome (case-insensitive).
    pub fn preset(name: &str) -> Option<Self> {
        let n = name.trim().to_uppercase();
        let t = match n.as_str() {
            "VOID" => Theme {
                name: "VOID".into(),
                primary: "#8A2BE2".into(),
                secondary: "#0066FF".into(),
                accent: "#FF00FF".into(),
                text: "#E7E7EA".into(),
                background: "#050509".into(),
                panel: "#0A0A14".into(),
                glow: 60,
                scanlines: 25,
                glitch: 15,
                animations: 70,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 13,
                density: 50,
            },
            "NEON PURPLE" => Theme {
                name: "NEON PURPLE".into(),
                primary: "#A855F7".into(),
                secondary: "#7C3AED".into(),
                accent: "#FF2D95".into(),
                text: "#F0EFFF".into(),
                background: "#08060E".into(),
                panel: "#120D1E".into(),
                glow: 85,
                scanlines: 30,
                glitch: 25,
                animations: 80,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 13,
                density: 55,
            },
            "CYBER BLUE" => Theme {
                name: "CYBER BLUE".into(),
                primary: "#00D4FF".into(),
                secondary: "#0066FF".into(),
                accent: "#FF00FF".into(),
                text: "#DFF6FF".into(),
                background: "#03040A".into(),
                panel: "#071026".into(),
                glow: 80,
                scanlines: 35,
                glitch: 20,
                animations: 75,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 13,
                density: 55,
            },
            "LAIN" => Theme {
                name: "LAIN".into(),
                primary: "#6FE3E1".into(),
                secondary: "#2A2E45".into(),
                accent: "#FF2D95".into(),
                text: "#C7D0D6".into(),
                background: "#010101".into(),
                panel: "#0A0A0A".into(),
                glow: 40,
                scanlines: 45,
                glitch: 35,
                animations: 50,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 12,
                density: 65,
            },
            "MATRIX" => Theme {
                name: "MATRIX".into(),
                primary: "#00FF41".into(),
                secondary: "#008F11".into(),
                accent: "#00FF41".into(),
                text: "#C4FFD4".into(),
                background: "#000000".into(),
                panel: "#050B05".into(),
                glow: 75,
                scanlines: 60,
                glitch: 10,
                animations: 60,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 13,
                density: 50,
            },
            "NIGHT CITY" => Theme {
                name: "NIGHT CITY".into(),
                primary: "#FF274C".into(),
                secondary: "#00F0FF".into(),
                accent: "#FDBB2D".into(),
                text: "#F2E9E9".into(),
                background: "#0B0707".into(),
                panel: "#150A0A".into(),
                glow: 70,
                scanlines: 30,
                glitch: 30,
                animations: 85,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 13,
                density: 50,
            },
            "TERMINAL" => Theme {
                name: "TERMINAL".into(),
                primary: "#33FF66".into(),
                secondary: "#66FFAA".into(),
                accent: "#FFFFFF".into(),
                text: "#D8FFE6".into(),
                background: "#020503".into(),
                panel: "#071008".into(),
                glow: 30,
                scanlines: 35,
                glitch: 5,
                animations: 20,
                transparency: 0,
                border_width: 1,
                radius: 2,
                font: "JetBrains Mono".into(),
                font_size: 12,
                density: 60,
            },
            _ => return None,
        };
        Some(t)
    }

    /// Todos os presets na ordem de exibição.
    pub fn presets() -> Vec<Theme> {
        ["VOID", "NEON PURPLE", "CYBER BLUE", "LAIN", "MATRIX", "NIGHT CITY", "TERMINAL"]
            .iter()
            .filter_map(|n| Self::preset(n))
            .collect()
    }
}

fn theme_file() -> std::path::PathBuf {
    config::data_dir().join("theme.json")
}

fn read_file() -> Option<Theme> {
    std::fs::read_to_string(theme_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

fn write_file(theme: &Theme) -> Result<(), String> {
    let dir = config::data_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(theme).map_err(|e| e.to_string())?;
    std::fs::write(theme_file(), json).map_err(|e| e.to_string())
}

/// Tema atual salvo (ou default se nenhum foi salvo).
pub fn current() -> Theme {
    read_file().unwrap_or_default()
}

/// Salva o tema atual.
pub fn save(theme: &Theme) -> Result<Theme, String> {
    write_file(theme)?;
    Ok(theme.clone())
}

/// Exporta o tema como string JSON.
pub fn export(theme: &Theme) -> Result<String, String> {
    serde_json::to_string_pretty(theme).map_err(|e| e.to_string())
}

/// Importa um tema a partir de JSON. Retorna o tema validado/salvo.
pub fn import(json: &str) -> Result<Theme, String> {
    let theme: Theme = serde_json::from_str(json).map_err(|e| format!("Invalid theme JSON: {e}"))?;
    write_file(&theme)?;
    Ok(theme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_are_valid() {
        for t in Theme::presets() {
            assert!(t.primary.starts_with('#'));
            assert!(t.glow <= 100 && t.scanlines <= 100);
        }
    }

    #[test]
    fn preset_lookup_is_case_insensitive() {
        assert!(Theme::preset("lain").is_some());
        assert!(Theme::preset("neon purple").is_some());
        assert!(Theme::preset("nope").is_none());
    }
}
