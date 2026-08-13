//! Quest Performance (DETOXIFICATION CONTROL).
//!
//! Controles de desempenho do headset no estilo "The Ocular Migraine"
//! (https://github.com/petermg/TheOcularMigraineMCP):
//! - Resolução do eye buffer: `debug.oculus.textureWidth` / `textureHeight`.
//! - Nível de CPU (0-5) estático ou dinâmico: `debug.oculus.cpuLevel`.
//! - Nível de GPU (0-5) estático ou dinâmico: `debug.oculus.gpuLevel`.
//! - FFR fixo (0-4) estático ou dinâmico: `debug.oculus.foveation.level` +
//!   `debug.oculus.foveation.dynamic`.
//!
//! Semântica: ESTÁTICO = nível forçado sempre. DINÂMICO = o sistema ajusta
//! até o nível máximo quando necessário (para CPU/GPU o override é removido,
//! restaurando o clocking dinâmico padrão da aplicação).

use serde::Serialize;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

pub const CPU_LEVEL_MAX: u8 = 5;
pub const GPU_LEVEL_MAX: u8 = 5;
pub const FFR_LEVEL_MAX: u8 = 4;
/// Limites de resolução do eye buffer aceitos.
pub const RES_MIN: u32 = 320;
pub const RES_MAX: u32 = 4160;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfState {
    pub cpu_level: Option<u8>,
    pub cpu_dynamic: bool,
    pub gpu_level: Option<u8>,
    pub gpu_dynamic: bool,
    pub ffr_level: Option<u8>,
    pub ffr_dynamic: bool,
    pub texture_width: Option<u32>,
    pub texture_height: Option<u32>,
    pub panel_width: Option<u32>,
    pub panel_height: Option<u32>,
}

fn read_prop(runner: &AdbRunner, serial: &str, prop: &str) -> Option<String> {
    runner
        .shell(serial, &format!("getprop {prop}"))
        .ok()
        .map(|o| o.stdout_trimmed().to_string())
        .filter(|v| !v.is_empty())
}

fn parse_u8(v: Option<String>) -> Option<u8> {
    v.as_deref().and_then(|s| s.parse::<u8>().ok())
}

fn parse_u32(v: Option<String>) -> Option<u32> {
    v.as_deref().and_then(|s| s.parse::<u32>().ok())
}

/// Coleta o estado atual de performance do headset.
pub fn state(runner: &AdbRunner, serial: &str) -> PerfState {
    let cpu = parse_u8(read_prop(runner, serial, "debug.oculus.cpuLevel"));
    let gpu = parse_u8(read_prop(runner, serial, "debug.oculus.gpuLevel"));
    let ffr = parse_u8(read_prop(runner, serial, "debug.oculus.foveation.level"));
    let ffr_dynamic = read_prop(runner, serial, "debug.oculus.foveation.dynamic")
        .as_deref()
        .map(|v| v == "1")
        .unwrap_or(true);

    let mut st = PerfState {
        // Sem override (prop vazio/ausente) = clocking dinâmico do sistema.
        cpu_level: cpu,
        cpu_dynamic: cpu.is_none(),
        gpu_level: gpu,
        gpu_dynamic: gpu.is_none(),
        ffr_level: ffr,
        ffr_dynamic,
        texture_width: parse_u32(read_prop(runner, serial, "debug.oculus.textureWidth")),
        texture_height: parse_u32(read_prop(runner, serial, "debug.oculus.textureHeight")),
        panel_width: None,
        panel_height: None,
    };

    if let Ok(out) = runner.shell(serial, "wm size") {
        for line in out.stdout.lines() {
            if let Some(rest) = line.trim().strip_prefix("Physical size:") {
                if let Some((w, h)) = rest.trim().split_once('x') {
                    st.panel_width = w.trim().parse().ok();
                    st.panel_height = h.trim().parse().ok();
                }
            }
        }
    }
    st
}

fn setprop(runner: &AdbRunner, serial: &str, prop: &str, value: &str) -> Result<(), AppError> {
    let out = runner.run_serial(serial, &["shell", "setprop", prop, value])?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("Failed to set {prop}={value}"),
            out.stderr,
        ));
    }
    Ok(())
}

fn check_level(level: u8, max: u8, what: &str) -> Result<(), AppError> {
    if level > max {
        return Err(AppError::new(format!("{what} level must be 0-{max}.")));
    }
    Ok(())
}

/// Define o nível de CPU (0-5). `dynamic=true` restaura o clocking dinâmico.
pub fn set_cpu(runner: &AdbRunner, serial: &str, level: u8, dynamic: bool) -> Result<(), AppError> {
    if !dynamic {
        check_level(level, CPU_LEVEL_MAX, "CPU")?;
    }
    if dynamic {
        setprop(runner, serial, "debug.oculus.cpuLevel", "")
    } else {
        setprop(runner, serial, "debug.oculus.cpuLevel", &level.to_string())
    }
}

/// Define o nível de GPU (0-5). `dynamic=true` restaura o clocking dinâmico.
pub fn set_gpu(runner: &AdbRunner, serial: &str, level: u8, dynamic: bool) -> Result<(), AppError> {
    if !dynamic {
        check_level(level, GPU_LEVEL_MAX, "GPU")?;
    }
    if dynamic {
        setprop(runner, serial, "debug.oculus.gpuLevel", "")
    } else {
        setprop(runner, serial, "debug.oculus.gpuLevel", &level.to_string())
    }
}

/// Define o nível de FFR fixo (0-4).
/// - Estático: foveation.dynamic=0 + nível fixo.
/// - Dinâmico: foveation.dynamic=1 + nível como máximo permitido.
pub fn set_ffr(runner: &AdbRunner, serial: &str, level: u8, dynamic: bool) -> Result<(), AppError> {
    check_level(level, FFR_LEVEL_MAX, "FFR")?;
    setprop(
        runner,
        serial,
        "debug.oculus.foveation.dynamic",
        if dynamic { "1" } else { "0" },
    )?;
    setprop(runner, serial, "debug.oculus.foveation.level", &level.to_string())
}

/// Define a resolução do eye buffer (textureWidth/Height).
pub fn set_resolution(
    runner: &AdbRunner,
    serial: &str,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    if !(RES_MIN..=RES_MAX).contains(&width) || !(RES_MIN..=RES_MAX).contains(&height) {
        return Err(AppError::new(format!(
            "Resolution must be between {RES_MIN} and {RES_MAX} pixels per axis."
        )));
    }
    setprop(
        runner,
        serial,
        "debug.oculus.textureWidth",
        &width.to_string(),
    )?;
    setprop(
        runner,
        serial,
        "debug.oculus.textureHeight",
        &height.to_string(),
    )
}

/// Remove o override de resolução (volta ao padrão do headset/app).
pub fn reset_resolution(runner: &AdbRunner, serial: &str) -> Result<(), AppError> {
    setprop(runner, serial, "debug.oculus.textureWidth", "")?;
    setprop(runner, serial, "debug.oculus.textureHeight", "")
}

/// Remove TODOS os overrides de performance (CPU/GPU/FFR/resolução).
pub fn reset_all(runner: &AdbRunner, serial: &str) -> Result<(), AppError> {
    for prop in [
        "debug.oculus.cpuLevel",
        "debug.oculus.gpuLevel",
        "debug.oculus.foveation.level",
        "debug.oculus.foveation.dynamic",
        "debug.oculus.textureWidth",
        "debug.oculus.textureHeight",
    ] {
        setprop(runner, serial, prop, "")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_u8_props() {
        assert_eq!(parse_u8(Some("3".into())), Some(3));
        assert_eq!(parse_u8(Some("5".into())), Some(5));
        assert_eq!(parse_u8(Some("".into())), None);
        assert_eq!(parse_u8(None), None);
        assert_eq!(parse_u8(Some("xx".into())), None);
    }

    #[test]
    fn parses_u32_props() {
        assert_eq!(parse_u32(Some("1440".into())), Some(1440));
        assert_eq!(parse_u32(Some("".into())), None);
    }

    #[test]
    fn level_bounds() {
        assert!(check_level(6, CPU_LEVEL_MAX, "CPU").is_err());
        assert!(check_level(5, CPU_LEVEL_MAX, "CPU").is_ok());
        assert!(check_level(6, GPU_LEVEL_MAX, "GPU").is_err());
        assert!(check_level(5, GPU_LEVEL_MAX, "GPU").is_ok());
        assert!(check_level(5, FFR_LEVEL_MAX, "FFR").is_err());
        assert!(check_level(4, FFR_LEVEL_MAX, "FFR").is_ok());
    }

    #[test]
    fn resolution_bounds() {
        assert!(!(RES_MIN..=RES_MAX).contains(&100));
        assert!(!(RES_MIN..=RES_MAX).contains(&5000));
        assert!((RES_MIN..=RES_MAX).contains(&1440));
        assert!((RES_MIN..=RES_MAX).contains(&1584));
    }
}
