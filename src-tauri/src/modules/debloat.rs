//! Quest Debloat (Fase 7 - DETOXIFICATION CONTROL).
//!
//! Análise dos pacotes instalados com categorias (SYSTEM / META / QUEST /
//! STORE / SOCIAL / TELEMETRY / SERVICES / USER / UNKNOWN) e nível de risco
//! (LOW / MEDIUM / HIGH). Nunca desativa componentes críticos sem aviso.
//! Sempre detecta a versão do Quest antes de oferecer ações.

use serde::Serialize;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::optimizer;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebloatPackage {
    pub package: String,
    /// "SYSTEM" | "META" | "QUEST" | "STORE" | "SOCIAL" | "TELEMETRY" |
    /// "SERVICES" | "USER APPS" | "UNKNOWN"
    pub category: String,
    /// "LOW" | "MEDIUM" | "HIGH"
    pub risk: String,
    pub disabled: bool,
    pub system: bool,
    /// Pacotes que quebrariam o OS se desativados.
    pub critical: bool,
    /// Seguro de desativar (telemetria/bloat de baixo risco).
    pub recommended: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebloatReport {
    pub serial: String,
    pub headset: Option<String>,
    pub model: Option<String>,
    pub os_version: Option<String>,
    pub android_version: Option<String>,
    pub is_quest: bool,
    pub total: usize,
    pub disabled: usize,
    pub packages: Vec<DebloatPackage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebloatResult {
    pub package: String,
    pub ok: bool,
    pub message: String,
}

const STORE_KEYWORDS: &[&str] = &["store", "horizon", "shop", "market"];
const SOCIAL_KEYWORDS: &[&str] = &[
    "social", "friends", "party", "messenger", "instagram", "facebook",
    "chat", "messages", "link", "livestream", "streaming",
];
const SERVICES_KEYWORDS: &[&str] = &[
    "service", "sync", "update", "updates", "battery", "guardian", "home",
    "settings", "environment", "systemux", "panelapp", "portal", "assistant",
    "vrshell", "shell", "system_activity", "launcher",
];
const QUEST_SAFE_KEYWORDS: &[&str] = &[
    "firststeps", "tutorial", "intro", "welcome", "onboarding", "sample",
    "demo", "cinema", "tour", "avatareditor", "browser", "storefront",
];

/// Categoriza um pacote por heurísticas de nome. Nunca remove; só classifica.
fn classify(pkg: &str, is_system: bool) -> (String, String, bool) {
    let low = pkg.to_lowercase();

    // 1) Telemetria primeiro (qualquer fabricante).
    if low.contains("telemetry")
        || low.contains("analytics")
        || low.contains("metrics")
        || low.contains("diagnostic")
        || low.contains("bugreport")
        || low.contains("crashreport")
        || low.contains("survey")
        || low.contains("experiment")
        || low.contains("datamining")
    {
        return ("TELEMETRY".into(), "LOW".into(), true);
    }

    // 2) Android core.
    if low.starts_with("com.android.")
        || low.starts_with("com.google.android.")
        || low == "android"
        || low.starts_with("android.")
    {
        return ("SYSTEM".into(), "HIGH".into(), false);
    }

    // 3) Meta/Oculus (Quest).
    if low.starts_with("com.meta.") || low.starts_with("com.oculus.") || low.starts_with("com.facebook.") {
        if low.contains("telemetry") || low.contains("analytics") {
            return ("TELEMETRY".into(), "LOW".into(), true);
        }
        if STORE_KEYWORDS.iter().any(|k| low.contains(k)) {
            return ("STORE".into(), "MEDIUM".into(), false);
        }
        if SOCIAL_KEYWORDS.iter().any(|k| low.contains(k)) {
            return ("SOCIAL".into(), "MEDIUM".into(), false);
        }
        if QUEST_SAFE_KEYWORDS.iter().any(|k| low.contains(k)) {
            return ("QUEST".into(), "LOW".into(), true);
        }
        if SERVICES_KEYWORDS.iter().any(|k| low.contains(k)) {
            return ("SERVICES".into(), "HIGH".into(), false);
        }
        return ("QUEST".into(), "MEDIUM".into(), false);
    }

    // 4) Usuário.
    if !is_system {
        return ("USER APPS".into(), "LOW".into(), false);
    }

    // 5) Serviços genéricos.
    if SERVICES_KEYWORDS.iter().any(|k| low.contains(k)) {
        return ("SERVICES".into(), "MEDIUM".into(), false);
    }
    if STORE_KEYWORDS.iter().any(|k| low.contains(k)) {
        return ("STORE".into(), "MEDIUM".into(), false);
    }

    ("UNKNOWN".into(), "HIGH".into(), false)
}

fn describe(category: &str, pkg: &str) -> String {
    match category {
        "TELEMETRY" => "Componente de telemetria/analytics. Seguro de desativar.".into(),
        "USER APPS" => "Aplicativo instalado pelo usuário.".into(),
        "STORE" => "Componente de loja/compras.".into(),
        "SOCIAL" => "Componente social.".into(),
        "QUEST" => {
            let low = pkg.to_lowercase();
            if QUEST_SAFE_KEYWORDS.iter().any(|k| low.contains(k)) {
                "App demo/tutorial do Quest. Removível.".into()
            } else {
                "Componente da plataforma Quest.".into()
            }
        }
        "SYSTEM" => "Componente crítico do sistema operacional Android.".into(),
        "SERVICES" => "Serviço de plataforma em segundo plano.".into(),
        _ => "Pacote sem classificação confiável.".into(),
    }
}

/// Analisa todos os pacotes do dispositivo e classifica por categoria/risco.
pub fn analyze(runner: &AdbRunner, serial: &str) -> Result<DebloatReport, AppError> {
    let v = optimizer::detect_quest(runner, serial);

    let system = runner.shell(serial, "pm list packages -s")?;
    let system_set: std::collections::HashSet<String> = system
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect();

    let disabled = runner.shell(serial, "pm list packages -d")?;
    let disabled_set: std::collections::HashSet<String> = disabled
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect();

    let all = runner.shell(serial, "pm list packages")?;
    let mut packages = Vec::new();
    for line in all.stdout.lines() {
        let Some(pkg) = line.trim().strip_prefix("package:") else { continue };
        let pkg = pkg.trim().to_string();
        if pkg.is_empty() {
            continue;
        }
        let is_system = system_set.contains(&pkg);
        let (category, risk, recommended) = classify(&pkg, is_system);
        let critical = risk == "HIGH" && category != "TELEMETRY";
        packages.push(DebloatPackage {
            description: describe(&category, &pkg),
            category,
            risk,
            disabled: disabled_set.contains(&pkg),
            system: is_system,
            critical,
            recommended,
            package: pkg,
        });
    }

    packages.sort_by(|a, b| {
        risk_order(&b.risk)
            .cmp(&risk_order(&a.risk))
            .then_with(|| a.category.cmp(&b.category))
            .then_with(|| a.package.cmp(&b.package))
    });

    let total = packages.len();
    let disabled_count = packages.iter().filter(|p| p.disabled).count();
    Ok(DebloatReport {
        serial: serial.to_string(),
        headset: v.headset.clone(),
        model: v.model,
        os_version: v.os_version,
        android_version: v.android_version,
        is_quest: v.is_quest,
        total,
        disabled: disabled_count,
        packages,
    })
}

fn risk_order(r: &str) -> u8 {
    match r {
        "HIGH" => 3,
        "MEDIUM" => 2,
        "LOW" => 1,
        _ => 0,
    }
}

/// Desativa ou reativa um pacote (com verificação de risco no frontend).
pub fn toggle(runner: &AdbRunner, serial: &str, pkg: &str, disable: bool) -> Result<(), AppError> {
    if disable {
        crate::modules::packages::actions::disable(runner, serial, pkg)
    } else {
        crate::modules::packages::actions::enable(runner, serial, pkg)
    }
}

/// Ação em lote. Retorna resultado individual de cada pacote.
pub fn apply(
    runner: &AdbRunner,
    serial: &str,
    packages: Vec<String>,
    disable: bool,
) -> Vec<DebloatResult> {
    let mut results = Vec::new();
    for pkg in packages {
        let res = toggle(runner, serial, &pkg, disable);
        match res {
            Ok(()) => results.push(DebloatResult {
                package: pkg,
                ok: true,
                message: if disable { "disabled" } else { "enabled" }.into(),
            }),
            Err(e) => results.push(DebloatResult {
                package: pkg,
                ok: false,
                message: e.message,
            }),
        }
    }
    results
}

/// Informações detalhadas de um pacote (reuso do detail do packages).
pub fn info(
    runner: &AdbRunner,
    serial: &str,
    pkg: &str,
) -> Result<crate::modules::packages::PackageDetail, AppError> {
    crate::modules::packages::detail::package_detail(runner, serial, pkg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_categories() {
        let (c, r, rec) = classify("com.oculus.telemetry", true);
        assert_eq!(c, "TELEMETRY");
        assert_eq!(r, "LOW");
        assert!(rec);

        let (c, _, _) = classify("com.oculus.vrshell", true);
        assert_eq!(c, "SERVICES");

        let (c, _, _) = classify("com.android.systemui", true);
        assert_eq!(c, "SYSTEM");

        let (c, _, _) = classify("com.oculus.horizon", true);
        assert_eq!(c, "STORE");

        let (c, _, _) = classify("com.example.userapp", false);
        assert_eq!(c, "USER APPS");

        let (c, _, _) = classify("com.meta.quest.firststeps", true);
        assert_eq!(c, "QUEST");
    }

    #[test]
    fn critical_flags() {
        let (c, r, _) = classify("com.android.systemui", true);
        assert_eq!((c.as_str(), r.as_str()), ("SYSTEM", "HIGH"));
        let (c, r, _) = classify("com.oculus.telemetry", true);
        assert_eq!(r, "LOW");
        assert_eq!(c, "TELEMETRY");
    }
}
