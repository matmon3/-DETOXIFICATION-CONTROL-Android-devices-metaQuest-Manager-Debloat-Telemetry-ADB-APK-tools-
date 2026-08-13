//! Fase 3: monitor de performance em tempo real.
//!
//! Coleta via `dumpsys cpuinfo`, `/proc/meminfo`, `dumpsys battery` e `df`.
//! Parsing tolerante: campos ausentes viram `None`/0 em vez de erro.

use serde::Serialize;

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerfProcess {
    pub pid: String,
    pub name: String,
    pub cpu: f32,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerfStorage {
    pub total: u64,
    pub used: u64,
    pub free: u64,
    pub mount: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerfSnapshot {
    pub cpu_load: String,
    pub cpu_total: f32,
    pub processes: Vec<PerfProcess>,
    pub mem_total_kb: u64,
    pub mem_free_kb: u64,
    pub mem_avail_kb: u64,
    pub battery_level: Option<u8>,
    pub battery_status: Option<String>,
    pub battery_temp_c: Option<f32>,
    pub storage: Option<PerfStorage>,
    pub uptime_s: Option<u64>,
}

fn extract(line: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}:");
    line.trim()
        .strip_prefix(&prefix)
        .map(|s| s.trim().to_string())
}

fn extract_mem_kb(text: &str, key: &str) -> u64 {
    text.lines()
        .find_map(|l| extract(l, key))
        .and_then(|v| v.replace("kB", "").trim().replace(',', "").parse::<u64>().ok())
        .unwrap_or(0)
}

/// Coleta um snapshot de performance do dispositivo.
pub fn snapshot(runner: &AdbRunner, serial: &str) -> Result<PerfSnapshot, AppError> {
    let mut snap = PerfSnapshot::default();

    // CPU (dumpsys cpuinfo): linhas ` 12% 1234/com.example: ...` e `30% TOTAL:`.
    let cpu = runner.shell(serial, "dumpsys cpuinfo").unwrap_or_default();
    let cpu_text = cpu.stdout.clone();
    for line in cpu_text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(v) = parse_pct(line) {
            if line.contains("TOTAL:") {
                snap.cpu_total = v;
            } else if let Some((pid, name)) = parse_proc(line) {
                snap.processes.push(PerfProcess { pid, name, cpu: v });
            }
        } else if let Some(rest) = line.strip_prefix("Load:") {
            snap.cpu_load = rest.trim().to_string();
        }
    }
    snap.processes.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    snap.processes.truncate(20);

    // Memória.
    let mem = runner.shell(serial, "cat /proc/meminfo").unwrap_or_default();
    snap.mem_total_kb = extract_mem_kb(&mem.stdout, "MemTotal");
    snap.mem_free_kb = extract_mem_kb(&mem.stdout, "MemFree");
    snap.mem_avail_kb = extract_mem_kb(&mem.stdout, "MemAvailable");

    // Bateria.
    let bat = runner.shell(serial, "dumpsys battery").unwrap_or_default();
    snap.battery_level = bat
        .stdout
        .lines()
        .find_map(|l| extract(l, "level"))
        .and_then(|v| v.parse::<u8>().ok());
    snap.battery_status = bat
        .stdout
        .lines()
        .find_map(|l| extract(l, "status"))
        .and_then(|v| v.parse::<u8>().ok())
        .map(|s| match s {
            2 => "Charging".to_string(),
            3 => "Discharging".to_string(),
            4 => "Not charging".to_string(),
            5 => "Full".to_string(),
            1 => "Unknown".to_string(),
            _ => format!("Status {s}"),
        });
    snap.battery_temp_c = bat
        .stdout
        .lines()
        .find_map(|l| extract(l, "temperature"))
        .and_then(|v| v.parse::<f32>().ok())
        .map(|t| t / 10.0);

    // Armazenamento.
    let df = runner
        .shell(serial, "df -k /storage/emulated/0")
        .ok()
        .or_else(|| runner.shell(serial, "df -k /sdcard").ok())
        .unwrap_or_default();
    if let Some(last) = df.stdout.lines().filter(|l| l.trim().starts_with('/')).last() {
        let cols: Vec<&str> = last.split_whitespace().collect();
        if cols.len() >= 4 {
            snap.storage = Some(PerfStorage {
                total: cols[1].replace(',', "").parse::<u64>().map(|k| k * 1024).unwrap_or(0),
                used: cols[2].replace(',', "").parse::<u64>().map(|k| k * 1024).unwrap_or(0),
                free: cols[3].replace(',', "").parse::<u64>().map(|k| k * 1024).unwrap_or(0),
                mount: cols.last().unwrap_or(&"").to_string(),
            });
        }
    }

    // Uptime.
    let up = runner.shell(serial, "cat /proc/uptime").unwrap_or_default();
    snap.uptime_s = up.stdout.split_whitespace().next().and_then(|v| v.parse::<u64>().ok());

    Ok(snap)
}

/// Extrai a porcentagem no início da linha ("12%").
fn parse_pct(line: &str) -> Option<f32> {
    let end = line.find('%')?;
    line[..end].trim().parse::<f32>().ok()
}

/// "1234/com.example: ..." → (pid, name).
fn parse_proc(line: &str) -> Option<(String, String)> {
    let rest = line.split('%').nth(1)?.trim();
    let (pid, tail) = rest.split_once('/')?;
    let name = tail.split(':').next()?.to_string();
    Some((pid.trim().to_string(), name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cpuinfo_lines() {
        let lines = [
            "  12% 1234/com.example: 5.0% user + 7.0% kernel",
            "  30% TOTAL: 12% user + 18% kernel",
            "  1.2% 42/system_server: 0.5% user + 0.7% kernel",
        ];
        let mut total = None;
        let mut procs = Vec::new();
        for l in lines {
            if let Some(v) = parse_pct(l) {
                if l.contains("TOTAL:") {
                    total = Some(v);
                } else if let Some((pid, name)) = parse_proc(l) {
                    procs.push((pid, name, v));
                }
            }
        }
        assert_eq!(total, Some(30.0));
        assert_eq!(procs[0], ("1234".into(), "com.example".into(), 12.0));
        assert_eq!(procs[1], ("42".into(), "system_server".into(), 1.2));
    }
}
