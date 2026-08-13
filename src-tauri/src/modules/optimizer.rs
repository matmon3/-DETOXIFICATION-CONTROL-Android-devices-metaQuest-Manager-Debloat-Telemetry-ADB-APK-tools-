//! Quest Optimizer (Fase 7 - DETOXIFICATION CONTROL).
//!
//! TELEMETRY: detecção de componentes de telemetria por varredura real do
//! dispositivo. A detecção é precisa e conservadora:
//!   1. lista curada de pacotes de telemetria/analytics bem documentados
//!      (Meta/Oculus/Facebook), sempre verificados contra o dispositivo;
//!   2. match por palavra-chave APENAS em pacotes de fornecedores de coleta
//!      (com.meta.* / com.oculus.* / com.facebook.*), evitando falsos
//!      positivos de pacotes com "crash", "logging" ou "feedback" no nome.
//! BACKGROUND: processos/serviços em segundo plano classificados por risco.
//! PERFORMANCE: tweaks de plataforma mostrando exatamente o que será alterado.

use std::collections::HashSet;

use serde::Serialize;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

/// Identificação do headset antes de qualquer operação.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuestVersion {
    pub serial: String,
    pub model: Option<String>,
    pub headset: Option<String>,
    pub android_version: Option<String>,
    pub os_version: Option<String>,
    pub is_quest: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryComponent {
    pub package: String,
    pub exists: bool,
    pub active: bool,
    /// Componentes de baixo nível não devem ser desativados.
    pub critical: bool,
    /// "QUEST" | "GOOGLE" | "OEM" | "GENERIC" — origem do componente.
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryResult {
    pub package: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceProcess {
    pub pid: String,
    pub name: String,
    pub cpu: f32,
    pub rss_mb: u64,
    /// "SYSTEM CRITICAL" | "SAFE" | "META" | "USER" | "UNKNOWN"
    pub status: String,
    pub critical: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceTweak {
    pub key: String,
    pub name: String,
    pub desc: String,
    pub kind: String, // "setprop" | "setting"
    pub value: String,
    pub current: Option<String>,
    pub reversible: bool,
}

/// Pacotes de telemetria/analytics bem documentados em headsets Quest/Meta,
/// celulares Android (Google) e fabricantes OEM. A existência de cada um é
/// verificada contra o dispositivo (`pm list`) — entradas aqui só aparecem
/// quando o pacote realmente está instalado.
const KNOWN_TELEMETRY_PACKAGES: &[&str] = &[
    // Quest / Meta (headsets)
    "com.oculus.unifiedtelemetry",
    "com.oculus.gatekeeperservice",
    "com.oculus.notification_proxy",
    "com.oculus.bugreporter",
    "com.oculus.os.logcollector",
    "com.oculus.appsafety",
    "com.oculus.survey",
    "com.oculus.experiments",
    "com.oculus.telemetry",
    "com.facebook.analytics",
    "com.meta.telemetry",
    // Google / Android (celulares)
    "com.google.android.feedback",
    "com.google.android.apps.tycho",
    "com.google.android.gms.phenotype",
    "com.google.android.gms.location.history",
    "com.google.android.diagnostics",
    "com.google.mainline.telemetry",
    // OEM (MIUI / Samsung / Huawei / Oppo / realme / vivo / Amazon)
    "com.miui.analytics",
    "com.miui.msa.global",
    "com.samsung.android.analytics",
    "com.huawei.hianalytics",
    "com.huawei.hiview",
    "com.huawei.hwfeedback",
    "com.oppo.analytics",
    "com.oplus.analytics",
    "com.oneplus.analytics",
    "com.realme.analytics",
    "com.vivo.analytics",
    "com.amazon.precog",
    "com.amazon.dcp",
];

/// Fornecedores que coletam dados (limite do match por palavra-chave).
/// Inclui Quest/Meta, Google e grandes fabricantes OEM.
const TELEMETRY_VENDORS: &[&str] = &[
    // Quest / Meta
    "com.meta.",
    "com.oculus.",
    "com.facebook.",
    // Google
    "com.google.android.",
    "com.google.mainline.",
    // OEM
    "com.miui.",
    "com.xiaomi.",
    "com.samsung.android.",
    "com.sec.android.",
    "com.huawei.",
    "com.honor.",
    "com.oppo.",
    "com.oplus.",
    "com.realme.",
    "com.vivo.",
    "com.bbk.",
    "com.oneplus.",
    "com.amazon.",
];

/// Palavras-chave precisas de telemetria/analytics. Só são aceitas quando o
/// pacote pertence a um fornecedor de coleta (ver `TELEMETRY_VENDORS`).
const TELEMETRY_KEYWORDS: &[&str] = &[
    "telemetry",
    "analytics",
    "metric",
    "diagnostic",
    "bugreport",
    "crashreport",
    "crash_report",
    "logcollector",
    "datacollection",
    "data_collection",
    "experiment",
];

/// Decide se um pacote é um componente de telemetria. Lista curada sempre
/// ganha; o restante exige fornecedor de coleta + palavra-chave precisa.
fn is_telemetry_package(pkg: &str) -> bool {
    if KNOWN_TELEMETRY_PACKAGES
        .iter()
        .any(|k| k.eq_ignore_ascii_case(pkg))
    {
        return true;
    }
    let low = pkg.to_lowercase();
    if !TELEMETRY_VENDORS.iter().any(|v| low.starts_with(v)) {
        return false;
    }
    TELEMETRY_KEYWORDS.iter().any(|k| low.contains(k))
}

/// Origem do componente de telemetria para rotular na UI.
fn source_of(pkg: &str) -> &'static str {
    let low = pkg.to_lowercase();
    const QUEST_PREFIXES: &[&str] = &["com.meta.", "com.oculus.", "com.facebook."];
    const GOOGLE_PREFIXES: &[&str] = &["com.google."];
    const OEM_PREFIXES: &[&str] = &[
        "com.miui.", "com.xiaomi.", "com.samsung.", "com.sec.", "com.huawei.",
        "com.honor.", "com.oppo.", "com.oplus.", "com.realme.", "com.vivo.",
        "com.bbk.", "com.oneplus.", "com.amazon.",
    ];
    if QUEST_PREFIXES.iter().any(|p| low.starts_with(p)) {
        "QUEST"
    } else if GOOGLE_PREFIXES.iter().any(|p| low.starts_with(p)) {
        "GOOGLE"
    } else if OEM_PREFIXES.iter().any(|p| low.starts_with(p)) {
        "OEM"
    } else {
        "GENERIC"
    }
}

/// Pacotes/processos críticos do sistema que nunca devem ser tocados.
const CRITICAL_PROCESSES: &[&str] = &[
    "init", "zygote", "system_server", "surfaceflinger", "servicemanager",
    "hwservicemanager", "vold", "netd", "media", "audioserver", "cameraserver",
    "installd", "drmserver", "keystore", "gateskeeper", "logd", "healthd",
    "debuggerd", "lmkd", "wificond", "wpa_supplicant", "adbd", "traced",
    "perfd", "thermal", "statsd", "dex2oat", "webview_zygote", "renderthread",
];

const CRITICAL_PACKAGES: &[&str] = &[
    "android", "com.android.settings", "com.android.systemui",
    "com.android.phone", "com.android.providers.settings",
    "com.android.providers.media", "com.android.launcher",
];

/// Pacotes de coleta que fazem parte dos serviços do Google e nunca devem ser
/// desativados (desativá-los quebra GMS/Play Services ou o OS).
const CRITICAL_TELEMETRY_PREFIXES: &[&str] = &[
    "com.google.android.gms",
    "com.google.android.gsf",
];

// ---------------------------------------------------------------------------
// Detecção do dispositivo
// ---------------------------------------------------------------------------

fn getprop(runner: &AdbRunner, serial: &str, prop: &str) -> Option<String> {
    runner
        .shell(serial, &format!("getprop {prop}"))
        .ok()
        .map(|o| o.stdout_trimmed().to_string())
        .filter(|v| !v.is_empty())
}

fn normalize_headset(model: &str) -> Option<String> {
    let m = model.to_lowercase();
    if !m.contains("quest") {
        return None;
    }
    if m.contains("3s") {
        Some("Quest 3S".into())
    } else if m.contains("pro") {
        Some("Quest Pro".into())
    } else if m.contains("quest 3") {
        Some("Quest 3".into())
    } else if m.contains("quest 2") {
        Some("Quest 2".into())
    } else {
        Some("Quest".into())
    }
}

/// Detecta modelo e versões do headset ANTES de qualquer alteração.
pub fn detect_quest(runner: &AdbRunner, serial: &str) -> QuestVersion {
    let model = getprop(runner, serial, "ro.product.model");
    let manufacturer = getprop(runner, serial, "ro.product.manufacturer");
    let is_quest = model
        .as_deref()
        .and_then(normalize_headset)
        .is_some()
        || manufacturer
            .as_deref()
            .map(|m| m.to_lowercase().contains("meta") || m.to_lowercase().contains("oculus"))
            .unwrap_or(false);
    QuestVersion {
        serial: serial.to_string(),
        headset: model.as_deref().and_then(normalize_headset),
        model,
        android_version: getprop(runner, serial, "ro.build.version.release"),
        os_version: getprop(runner, serial, "ro.build.version.incremental"),
        is_quest,
    }
}

// ---------------------------------------------------------------------------
// Telemetria
// ---------------------------------------------------------------------------

/// Varre os pacotes instalados e encontra componentes de telemetria.
/// A existência é sempre verificada contra o dispositivo e nenhum pacote é
/// assumido sem estar presente. A detecção combina uma lista curada de
/// componentes conhecidos com um match conservador por fornecedor+palavra,
/// minimizando falsos positivos.
pub fn telemetry_scan(runner: &AdbRunner, serial: &str) -> Result<Vec<TelemetryComponent>, AppError> {
    let all = runner.shell(serial, "pm list packages")?;
    let packages: Vec<String> = all
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .filter(|p| is_telemetry_package(p))
        .collect();

    let disabled = disabled_set(runner, serial)?;

    let mut out = Vec::new();
    for p in packages {
        let critical = CRITICAL_PACKAGES.contains(&p.as_str())
            || p == "com.android.chrome"
            || CRITICAL_TELEMETRY_PREFIXES.iter().any(|pfx| p.starts_with(pfx));
        out.push(TelemetryComponent {
            exists: true,
            active: !disabled.contains(&p),
            critical,
            source: source_of(&p).into(),
            package: p,
        });
    }
    out.sort_by(|a, b| a.package.cmp(&b.package));
    Ok(out)
}

fn disabled_set(runner: &AdbRunner, serial: &str) -> Result<HashSet<String>, AppError> {
    let out = runner.shell(serial, "pm list packages -d")?;
    Ok(out
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect())
}

/// Desativa ou reativa um componente de telemetria (verificado antes).
pub fn telemetry_toggle(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
    disable: bool,
) -> Result<(), AppError> {
    let exists = runner
        .shell(serial, &format!("pm path {pkg}"))
        .map(|o| o.stdout.contains("package:"))
        .unwrap_or(false);
    if !exists {
        return Err(AppError::new(format!("Package {pkg} not present on device.")));
    }
    if disable {
        crate::modules::packages::actions::disable(runner, serial, pkg)
    } else {
        crate::modules::packages::actions::enable(runner, serial, pkg)
    }
}

/// Pacotes de telemetria ativos e seguros de desativar (não críticos),
/// ordenados e sem duplicatas.
fn safe_active(components: &[TelemetryComponent]) -> Vec<String> {
    let mut v: Vec<String> = components
        .iter()
        .filter(|c| c.active && !c.critical)
        .map(|c| c.package.clone())
        .collect();
    v.sort();
    v.dedup();
    v
}

/// Desativa todos os componentes de telemetria ativos e não críticos de uma
/// vez. Componentes críticos (GMS/GSF/core Android) nunca são tocados.
pub fn telemetry_disable_all(
    runner: &AdbRunner,
    serial: &str,
) -> Result<Vec<TelemetryResult>, AppError> {
    let components = telemetry_scan(runner, serial)?;
    let mut results = Vec::new();
    for pkg in safe_active(&components) {
        match telemetry_toggle(runner, serial, &pkg, true) {
            Ok(()) => results.push(TelemetryResult {
                package: pkg,
                ok: true,
                message: "disabled".into(),
            }),
            Err(e) => results.push(TelemetryResult {
                package: pkg,
                ok: false,
                message: e.message,
            }),
        }
    }
    Ok(results)
}

// ---------------------------------------------------------------------------
// Processos em segundo plano
// ---------------------------------------------------------------------------

/// Lista processos ativos com CPU/RAM e classificação de risco.
pub fn processes_list(runner: &AdbRunner, serial: &str) -> Result<Vec<ServiceProcess>, AppError> {
    let out = runner.shell(serial, "top -b -n 1")?;
    let mut procs = Vec::new();
    let mut header: Vec<String> = Vec::new();

    for line in out.stdout.lines() {
        let line = line.trim_end();
        if line.starts_with("Tasks:") || line.starts_with("Mem:") || line.starts_with("CPU:") {
            continue;
        }
        if line.trim().is_empty() {
            continue;
        }
        if line.contains("PID") && line.contains("%CPU") {
            header = line.split_whitespace().map(|s| s.to_string()).collect();
            continue;
        }
        if header.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < header.len() {
            continue;
        }
        let idx = |name: &str| header.iter().position(|h| h == name);
        let Some(pid_i) = idx("PID") else { continue };
        let Some(cpu_i) = idx("%CPU") else { continue };
        let Some(res_i) = idx("RES") else { continue };
        if pid_i >= cols.len() || cpu_i >= cols.len() || res_i >= cols.len() {
            continue;
        }
        let name = cols[header.len() - 1].to_string();
        let pid = cols[pid_i].trim().to_string();
        let cpu = cols[cpu_i].trim().parse::<f32>().unwrap_or(0.0);
        let res = cols[res_i].trim().to_string();

        let rss_mb = res
            .replace(['M', 'K', 'G'], "")
            .parse::<f64>()
            .map(|v| {
                if res.ends_with('G') {
                    (v * 1024.0) as u64
                } else if res.ends_with('K') {
                    (v / 1024.0) as u64
                } else {
                    v as u64
                }
            })
            .unwrap_or(0);

        let (status, critical) = classify_process(&name);
        procs.push(ServiceProcess {
            pid,
            name,
            cpu,
            rss_mb,
            status,
            critical,
        });
    }

    procs.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    procs.truncate(60);
    Ok(procs)
}

fn classify_process(name: &str) -> (String, bool) {
    let low = name.to_lowercase();
    if CRITICAL_PROCESSES.iter().any(|c| low.contains(c)) {
        ("SYSTEM CRITICAL".into(), true)
    } else if low.starts_with("com.meta.") || low.starts_with("com.oculus.") || low.starts_with("com.facebook.") {
        ("META".into(), false)
    } else if low.starts_with("com.") || low.starts_with("org.") {
        ("USER".into(), false)
    } else if low.is_empty() || low.chars().all(|c| c.is_ascii_digit()) {
        ("UNKNOWN".into(), false)
    } else {
        ("SAFE".into(), false)
    }
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/// Lista tweaks de performance disponíveis com o estado atual. Nada é alterado
/// aqui — apenas leitura + exibição do que seria aplicado.
pub fn perf_tweaks(runner: &AdbRunner, serial: &str) -> Vec<PerformanceTweak> {
    let mut tweaks = Vec::new();

    let prop = |p: &str| getprop(runner, serial, p);
    let setting = |k: &str| {
        runner
            .shell(serial, &format!("settings get secure {k}"))
            .ok()
            .map(|o| o.stdout_trimmed().to_string())
            .filter(|v| !v.is_empty() && v != "null")
    };

    tweaks.push(PerformanceTweak {
        key: "debug.oculus.fpsCounter".into(),
        name: "FPS HUD".into(),
        desc: "HUD de FPS no shell VR. Valor 1 = visível.".into(),
        kind: "setprop".into(),
        value: "1".into(),
        current: prop("debug.oculus.fpsCounter"),
        reversible: true,
    });
    tweaks.push(PerformanceTweak {
        key: "debug.oculus.enablePhoneSdk".into(),
        name: "Phone SDK".into(),
        desc: "Sideload de apps de desenvolvimento.".into(),
        kind: "setprop".into(),
        value: "1".into(),
        current: prop("debug.oculus.enablePhoneSdk"),
        reversible: true,
    });
    tweaks.push(PerformanceTweak {
        key: "debug.oculus.slowSDK".into(),
        name: "Slow SDK".into(),
        desc: "Reduz polling do SDK — economiza CPU/bateria.".into(),
        kind: "setprop".into(),
        value: "0".into(),
        current: prop("debug.oculus.slowSDK"),
        reversible: true,
    });
    tweaks.push(PerformanceTweak {
        key: "debug.oculus.gpuLevel".into(),
        name: "GPU Level".into(),
        desc: "Nível de performance gráfica (0-3). Maior = mais frames.".
            into(),
        kind: "setprop".into(),
        value: "3".into(),
        current: prop("debug.oculus.gpuLevel"),
        reversible: true,
    });
    tweaks.push(PerformanceTweak {
        key: "debug.oculus.cpuLevel".into(),
        name: "CPU Level".into(),
        desc: "Nível de performance da CPU (0-3).".into(),
        kind: "setprop".into(),
        value: "3".into(),
        current: prop("debug.oculus.cpuLevel"),
        reversible: true,
    });
    tweaks.push(PerformanceTweak {
        key: "user_guardian".into(),
        name: "Guardian".into(),
        desc: "Guardião de limite de área (secure setting).".into(),
        kind: "setting".into(),
        value: "1".into(),
        current: setting("user_guardian"),
        reversible: true,
    });

    tweaks
}

/// Aplica um tweak. `value` é o novo valor (validado pelo comando).
pub fn perf_apply(runner: &AdbRunner, serial: &str, key: &str, value: &str) -> Result<(), AppError> {
    match key {
        "user_guardian" => {
            let out = runner.run_serial(
                serial,
                &["shell", "settings", "put", "secure", key, value],
            )?;
            if out.exit_code != Some(0) {
                return Err(AppError::with_detail(
                    format!("Failed to set {key}={value}"),
                    out.stderr,
                ));
            }
            Ok(())
        }
        _ => {
            let out = runner.run_serial(serial, &["shell", "setprop", key, value])?;
            if out.exit_code != Some(0) {
                return Err(AppError::with_detail(
                    format!("Failed to set {key}={value}"),
                    out.stderr,
                ));
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_critical() {
        let (s, c) = classify_process("system_server");
        assert_eq!(s, "SYSTEM CRITICAL");
        assert!(c);
        let (s, c) = classify_process("com.oculus.vrshell");
        assert_eq!(s, "META");
        assert!(!c);
        let (s, _) = classify_process("com.example.app");
        assert_eq!(s, "USER");
        let (s, _) = classify_process("surfaceflinger");
        assert_eq!(s, "SYSTEM CRITICAL");
    }

    #[test]
    fn headset_names() {
        assert_eq!(normalize_headset("Quest 3S").as_deref(), Some("Quest 3S"));
        assert_eq!(normalize_headset("Quest 3").as_deref(), Some("Quest 3"));
        assert_eq!(normalize_headset("Quest 2").as_deref(), Some("Quest 2"));
        assert_eq!(normalize_headset("Pixel 7"), None);
    }

    #[test]
    fn parses_rss() {
        let rss = "120M";
        let v = rss.replace(['M', 'K', 'G'], "").parse::<f64>().unwrap();
        assert_eq!(v as u64, 120);
    }

    #[test]
    fn telemetry_known_packages_match() {
        for p in KNOWN_TELEMETRY_PACKAGES {
            assert!(is_telemetry_package(p), "known package missed: {p}");
        }
    }

    #[test]
    fn telemetry_keyword_requires_vendor() {
        assert!(is_telemetry_package("com.oculus.unifiedtelemetry"));
        assert!(is_telemetry_package("com.facebook.analytics"));
        assert!(is_telemetry_package("com.meta.metrics.example"));
        assert!(is_telemetry_package("com.oculus.bugreporter"));
        assert!(is_telemetry_package("com.oculus.os.logcollector"));

        // Google agora é fornecedor de coleta (celulares).
        assert!(is_telemetry_package("com.google.android.metrics"));
        assert!(!is_telemetry_package("com.google.firebase.analytics"));
        assert!(!is_telemetry_package("com.android.chrome"));
        assert!(!is_telemetry_package("com.android.settings"));
        assert!(!is_telemetry_package("com.oculus.vrshell"));
        assert!(!is_telemetry_package("com.oculus.horizon"));
        assert!(!is_telemetry_package("com.oculus.systemux"));
        assert!(!is_telemetry_package("com.oculus.home"));
        assert!(!is_telemetry_package("org.mozilla.firefox"));
    }

    #[test]
    fn telemetry_no_overbroad_keywords() {
        assert!(!is_telemetry_package("com.oculus.crash"));
        assert!(!is_telemetry_package("com.oculus.logging"));
        assert!(!is_telemetry_package("com.oculus.feedback"));
        assert!(!is_telemetry_package("com.oculus.instrumentpanel"));
    }

    #[test]
    fn telemetry_covers_android_and_oem() {
        // Lista curada: Google + OEM.
        assert!(is_telemetry_package("com.google.android.feedback"));
        assert!(is_telemetry_package("com.google.android.apps.tycho"));
        assert!(is_telemetry_package("com.google.android.gms.phenotype"));
        assert!(is_telemetry_package("com.google.mainline.telemetry"));
        assert!(is_telemetry_package("com.miui.analytics"));
        assert!(is_telemetry_package("com.miui.msa.global"));
        assert!(is_telemetry_package("com.samsung.android.analytics"));
        assert!(is_telemetry_package("com.huawei.hiview"));
        assert!(is_telemetry_package("com.amazon.precog"));

        // Fornecedor + palavra-chave nos novos fornecedores.
        assert!(is_telemetry_package("com.google.android.something.telemetry"));
        assert!(is_telemetry_package("com.samsung.android.metrics.x"));
        assert!(is_telemetry_package("com.huawei.analytics"));
        assert!(is_telemetry_package("com.miui.analytics.extra"));

        // Sem falso positivo em pacotes comuns.
        assert!(!is_telemetry_package("com.google.android.youtube"));
        assert!(!is_telemetry_package("com.google.android.gms"));
        assert!(!is_telemetry_package("com.google.android.apps.maps"));
        assert!(!is_telemetry_package("com.samsung.android.messages"));
        assert!(!is_telemetry_package("com.android.settings"));
    }

    #[test]
    fn telemetry_source_labels() {
        assert_eq!(source_of("com.oculus.unifiedtelemetry"), "QUEST");
        assert_eq!(source_of("com.meta.telemetry"), "QUEST");
        assert_eq!(source_of("com.google.android.feedback"), "GOOGLE");
        assert_eq!(source_of("com.miui.analytics"), "OEM");
        assert_eq!(source_of("com.huawei.hiview"), "OEM");
        assert_eq!(source_of("com.unknown.collector"), "GENERIC");
    }

    #[test]
    fn safe_active_filters_critical_and_disabled() {
        let cs = vec![
            TelemetryComponent {
                package: "com.google.android.feedback".into(),
                exists: true,
                active: true,
                critical: false,
                source: "GOOGLE".into(),
            },
            TelemetryComponent {
                package: "com.google.android.gms.phenotype".into(),
                exists: true,
                active: true,
                critical: true,
                source: "GOOGLE".into(),
            },
            TelemetryComponent {
                package: "com.oculus.telemetry".into(),
                exists: true,
                active: false,
                critical: false,
                source: "QUEST".into(),
            },
        ];
        assert_eq!(safe_active(&cs), vec!["com.google.android.feedback"]);
    }
}
