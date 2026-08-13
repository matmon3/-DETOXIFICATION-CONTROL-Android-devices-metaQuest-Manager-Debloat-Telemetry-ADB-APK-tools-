import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import type { AqmError, Device, PerfSnapshot } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

const fmtMem = (kb: number) => {
  if (!kb) return "—";
  const mb = kb / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
};

const fmtBytes = (n: number) => {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
};

const fmtUptime = (sec: number | null) => {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export function PerformanceView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const [snap, setSnap] = useState<PerfSnapshot | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!serial && connected.length > 0) setSerial(connected[0].serial);
  }, [connected, serial]);

  useEffect(() => {
    if (!serial) return;
    setRunning(true);
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const s = await api.perfSnapshot(serial);
        if (alive) {
          setSnap(s);
          setError(null);
        }
      } catch (e) {
        const err = toError(e);
        if (alive) {
          setError(err);
          log("ERROR", `perf snapshot failed: ${err.message}`);
        }
      }
    };
    void tick();
    const iv = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
      setRunning(false);
    };
  }, [serial]);

  const usedPct = (s: PerfSnapshot) => {
    if (s.memTotalKb === 0) return null;
    const used = s.memTotalKb - s.memAvailKb;
    return Math.round((used / s.memTotalKb) * 100);
  };

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Performance")}</h1>
          <div className="crumb">{t("LIVE MONITOR / 2S POLL")}</div>
        </div>
        <div className="actions">
          <select className="select-sm" value={serial} onChange={(e) => onSelect(e.target.value)}>
            {connected.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model ? d.model.replace(/_/g, " ") : d.serial}
              </option>
            ))}
            {connected.length === 0 && <option value="">{t("— no device —")}</option>}
          </select>
          {running && (
            <span className="scan">
              <span className="blink" /> {t("LIVE")}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">✕ {error.message}</div>
          {error.detail && (
            <details>
              <summary>{t("View technical details")}</summary>
              <pre>{error.detail}</pre>
            </details>
          )}
        </div>
      )}

      {!snap ? (
        <div className="panel">
          <div className="panel-body">
            <div className="empty">
              {serial ? t("COLLECTING FIRST SNAPSHOT…") : t("CONNECT A DEVICE")}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-4">
            <MetricCard label={t("CPU")} value={`${snap.cpuTotal.toFixed(1)}%`} sub={snap.cpuLoad} />
            <MetricCard
              label={t("RAM")}
              value={`${usedPct(snap) ?? "?"}%`}
              sub={`${fmtMem(snap.memTotalKb - snap.memAvailKb)} / ${fmtMem(snap.memTotalKb)}`}
            />
            <MetricCard
              label={t("Battery")}
              value={snap.batteryLevel != null ? `${snap.batteryLevel}%` : "—"}
              sub={snap.batteryStatus ?? "—"}
            />
            <MetricCard
              label={t("Temp")}
              value={snap.batteryTempC != null ? `${snap.batteryTempC.toFixed(1)}°C` : "—"}
              sub={t("battery")}
            />
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <span className="t">
                  {t("STORAGE")} <span className="accent">{snap.storage?.mount ?? ""}</span>
                </span>
              </div>
              <div className="panel-body">
                {snap.storage ? (
                  <>
                    <div className="kv">
                      <span className="k">{t("Used")}</span>
                      <span className="v">{fmtBytes(snap.storage.used)}</span>
                      <span className="k">{t("Free")}</span>
                      <span className="v">{fmtBytes(snap.storage.free)}</span>
                      <span className="k">{t("Total")}</span>
                      <span className="v">{fmtBytes(snap.storage.total)}</span>
                      <span className="k">{t("Uptime")}</span>
                      <span className="v">{fmtUptime(snap.uptimeS)}</span>
                    </div>
                    <div className="bar">
                      <div
                        className={`fill ${snap.storage.total ? "" : ""}`}
                        style={{
                          width: `${snap.storage.total ? Math.round((snap.storage.used / snap.storage.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="empty">{t("NO STORAGE DATA")}</div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("TOP PROCESSES")}</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                {snap.processes.length === 0 ? (
                  <div className="empty">{t("NO PROCESS DATA")}</div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>{t("PID")}</th>
                        <th>{t("NAME")}</th>
                        <th>{t("CPU")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.processes.slice(0, 12).map((p) => (
                        <tr key={`${p.pid}-${p.name}`}>
                          <td className="faint">{p.pid}</td>
                          <td>{p.name}</td>
                          <td className={p.cpu >= 20 ? "bad" : ""}>{p.cpu.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
                <span className="t">{t("MEMORY /PROC/MEMINFO")}</span>
            </div>
            <div className="panel-body">
              <div className="kv">
                <span className="k">{t("Total")}</span>
                <span className="v">{fmtMem(snap.memTotalKb)}</span>
                <span className="k">{t("Available")}</span>
                <span className="v">{fmtMem(snap.memAvailKb)}</span>
                <span className="k">{t("Free")}</span>
                <span className="v">{fmtMem(snap.memFreeKb)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="t">
          <Activity size={11} style={{ color: "var(--purple)" }} /> {label}
        </span>
      </div>
      <div className="panel-body">
        <div className="metric-value">{value}</div>
        <div className="faint" style={{ fontSize: 10.5, wordBreak: "break-all" }}>
          {sub}
        </div>
      </div>
    </div>
  );
}
