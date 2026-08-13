import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Radio, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import type { AqmError, Device, PerformanceTweak, QuestVersion, ServiceProcess, TelemetryComponent } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";
import { DeviceSelect } from "../components/DeviceSelect";

interface Props {
  devices: Device[];
}

export function QuestOptimizerView({ devices }: Props) {
  const connected = useMemo(() => devices.filter((d) => d.state === "connected"), [devices]);
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const { t } = useI18n();

  const [version, setVersion] = useState<QuestVersion | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryComponent[]>([]);
  const [processes, setProcesses] = useState<ServiceProcess[]>([]);
  const [tweaks, setTweaks] = useState<PerformanceTweak[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    if (!serial) return;
    setError(null);
    setBusy("all");
    try {
      const [v, t, p, tw] = await Promise.all([
        api.optimizerDetect(serial),
        api.optimizerTelemetryScan(serial),
        api.optimizerProcesses(serial),
        api.optimizerTweaks(serial),
      ]);
      setVersion(v);
      setTelemetry(t);
      setProcesses(p);
      setTweaks(tw);
      log("INFO", `optimizer scan ok on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `optimizer scan failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }, [serial]);

  useEffect(() => {
    void refreshAll();
  }, [serial, refreshAll]);

  const toggleTelemetry = async (pkg: string, active: boolean) => {
    if (!serial) return;
    setBusy(`tel-${pkg}`);
    setError(null);
    setNote(null);
    try {
      await api.optimizerTelemetryToggle(serial, pkg, active);
      setNote(t(active ? "Disabled {p}" : "Enabled {p}", { p: pkg }));
      log("INFO", `telemetry ${active ? "disable" : "enable"} ${pkg}`);
      void refreshAll();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `telemetry toggle failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const disableAllTelemetry = async () => {
    if (!serial) return;
    setBusy("tel-all");
    setError(null);
    setNote(null);
    try {
      const res = await api.optimizerTelemetryDisableAll(serial);
      const ok = res.filter((r) => r.ok).length;
      const bad = res.length - ok;
      setNote(t("{n} telemetry components disabled · {m} failed.", { n: ok, m: bad }));
      log("INFO", `disable all telemetry: ${ok} ok, ${bad} failed`);
      void refreshAll();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `disable all telemetry failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const applyTweak = async (twk: PerformanceTweak) => {
    if (!serial) return;
    setBusy(`tw-${twk.key}`);
    setError(null);
    setNote(null);
    try {
      const wanted = twk.current === twk.value ? (twk.value === "1" ? "0" : twk.value === "0" ? "1" : twk.value) : twk.value;
      await api.optimizerApplyTweak(serial, twk.key, wanted);
      setNote(t("Applied {n} = {v}", { n: twk.name, v: wanted }));
      log("INFO", `tweak ${twk.key}=${wanted}`);
      void refreshAll();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `tweak failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const activeTel = telemetry.filter((c) => c.active && !c.critical);
  const disabledTel = telemetry.filter((c) => !c.active);

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Quest Optimizer")}>{t("Quest Optimizer")}</h1>
          <div className="crumb">{t("TELEMETRY · PROCESSES · PERFORMANCE")}</div>
        </div>
        <div className="actions">
          <DeviceSelect devices={devices} serial={serial} onChange={onSelect} />
          <button className="btn" onClick={() => void refreshAll()} disabled={busy !== null || !serial}>
            <RefreshCw size={13} className="icon" /> {t("Scan")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">✕ {error.message}</div>
          {error.detail && (
            <details><summary>{t("View technical details")}</summary><pre>{error.detail}</pre></details>
          )}
        </div>
      )}
      {note && <div className="note-box">▸ {note}</div>}
      {!serial && <div className="empty">{t("CONNECT A DEVICE TO ANALYZE")}</div>}

      {serial && (
        <>
          {/* ---- Device detect ---- */}
          <div className="status-grid">
            <div className="status-cell"><div className="k">{t("Model")}</div><div className="v">{version?.model ?? "…"}</div></div>
            <div className="status-cell"><div className="k">{t("Headset")}</div><div className="v">{version?.headset ?? (version?.isQuest ? "QUEST" : "ANDROID")}</div></div>
            <div className="status-cell"><div className="k">{t("Android")}</div><div className="v">{version?.androidVersion ?? "…"}</div></div>
            <div className="status-cell"><div className="k">{t("Quest OS")}</div><div className="v">{version?.osVersion ?? "…"}</div></div>
            <div className="status-cell"><div className="k">{t("Telemetry active")}</div><div className="v" style={{ color: "var(--red)" }}>{activeTel.length}</div></div>
          </div>

          <div className="grid-2">
            {/* ---- Telemetry ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><Radio size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("TELEMETRY DETECTION")}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="sub">{t("SCANNED ON DEVICE")}</span>
                  <button
                    className="btn btn-sm btn-neon"
                    disabled={busy !== null || activeTel.length === 0}
                    onClick={() => void disableAllTelemetry()}
                    title={t("Disables every active, non-critical telemetry component")}
                  >
                    {t("Disable all")} ({activeTel.length})
                  </button>
                </div>
              </div>
              <div className="panel-body" style={{ maxHeight: 360, overflowY: "auto" }}>
                {telemetry.length === 0 && <div className="empty">{t("NO TELEMETRY COMPONENTS FOUND")}</div>}
                {telemetry.map((c) => (
                  <div key={c.package} className="comp-row">
                    <span className="pkg">{c.package} <span className="faint" style={{ fontSize: 10 }}>{c.source}</span></span>
                    <span className={`st ${c.critical ? "CRITICAL" : c.active ? "ACTIVE" : "DISABLED"}`}>
                      {c.critical ? t("CRITICAL") : c.active ? t("ACTIVE") : t("OFF")}
                    </span>
                    <button
                      className="btn btn-sm"
                      disabled={busy !== null || c.critical}
                      onClick={() => void toggleTelemetry(c.package, c.active)}
                      title={c.critical ? t("Protected component") : c.active ? t("Disable") : t("Restore")}
                    >
                      {c.active ? t("Disable") : t("Restore")}
                    </button>
                  </div>
                ))}
                <div className="kv-note">
                  {t("{n} disabled · critical components are protected.", { n: disabledTel.length })}
                </div>
              </div>
            </div>

            {/* ---- Processes ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><Cpu size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("BACKGROUND PROCESSES")}</div>
                <span className="sub">{t("READ-ONLY")}</span>
              </div>
              <div className="panel-body" style={{ maxHeight: 360, overflowY: "auto", padding: 0 }}>
                <table className="tbl">
                  <thead>
                    <tr><th>{t("PID")}</th><th>{t("Process")}</th><th>{t("CPU")}</th><th>{t("RAM")}</th><th>{t("Status")}</th></tr>
                  </thead>
                  <tbody>
                    {processes.slice(0, 30).map((p, i) => (
                      <tr key={`${p.pid}-${i}`}>
                        <td style={{ color: "var(--text-faint)" }}>{p.pid}</td>
                        <td style={{ wordBreak: "break-all", whiteSpace: "normal", maxWidth: 220 }}>{p.name}</td>
                        <td>{p.cpu.toFixed(1)}%</td>
                        <td>{p.rssMb > 0 ? `${p.rssMb} MB` : "—"}</td>
                        <td><span className={`st-badge ${p.status.replace(/\s+/g, "_")}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ---- Performance tweaks ---- */}
          <div className="panel">
            <div className="panel-head">
              <div className="t"><Zap size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("PERFORMANCE TWEAKS")}</div>
              <span className="sub">{t("SHOWS EXACTLY WHAT WILL CHANGE")}</span>
            </div>
            <div className="panel-body">
              {tweaks.length === 0 && <div className="empty">{t("SCAN TO LOAD TWEAKS")}</div>}
              {tweaks.map((tw) => {
                const active = tw.current === tw.value;
                return (
                  <div key={tw.key} className="comp-row" style={{ gridTemplateColumns: "1fr 110px auto" }}>
                    <div>
                      <div className="pkg" style={{ color: "var(--text)" }}>{tw.name} <span className="faint">({tw.key})</span></div>
                      <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>{tw.desc}</div>
                    </div>
                    <div>
                      <div className={`st ${active ? "ACTIVE" : "DISABLED"}`}>{tw.current ?? "—"}</div>
                    </div>
                    <button
                      className="btn btn-neon"
                      disabled={busy !== null}
                      onClick={() => void applyTweak(tw)}
                      title={t("Toggles the documented value")}
                    >
                      {active ? t("Reset") : t("Apply")}
                    </button>
                  </div>
                );
              })}
              <div className="kv-note">
                <ShieldAlert size={11} style={{ display: "inline", marginRight: 4, color: "var(--yellow)" }} />
                {t("All tweaks are reversible. Applied values are logged in the Activity Log.")}
              </div>
            </div>
          </div>
        </>
      )}
      {busy === "all" && serial && <div className="scan"><span className="blink" /> {t("ANALYZING DEVICE…")}</div>}
    </div>
  );
}
