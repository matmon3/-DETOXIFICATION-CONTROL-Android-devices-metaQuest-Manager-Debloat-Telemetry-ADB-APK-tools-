import { useEffect, useState } from "react";
import {
  Package,
  Folder,
  Terminal,
  ScrollText,
  Camera,
  Archive,
  Wifi,
  Plus,
  Wrench,
  Gauge,
  Ban,
  MonitorPlay,
  BookMarked,
  History,
  Palette,
  Cpu,
} from "lucide-react";
import type { Device } from "../api/types";
import { api } from "../api/bridge";
import { Indicator, TransportTag } from "../components/Indicator";
import { useAppLog } from "../appLog";
import type { Page } from "../components/Sidebar";
import { useI18n } from "../hooks/useI18n";

interface Props {
  devices: Device[];
  loading: boolean;
  go: (p: Page, serial?: string) => void;
  openDevice: (serial: string) => void;
}

export function DashboardView({ devices, loading, go, openDevice }: Props) {
  const logs = useAppLog();
  const [adbVer, setAdbVer] = useState("ADB ...");
  const connected = devices.filter((d) => d.state === "connected");
  const { t } = useI18n();

  useEffect(() => {
    api.adbVersion().then(setAdbVer).catch(() => setAdbVer(t("ADB NOT FOUND")));
  }, [t]);

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Dashboard")}</h1>
          <div className="crumb">{t("DEVICE CONTROL INTERFACE / NODE {n} ONLINE", { n: connected.length })}</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => go("apps")}>
            <Package size={13} className="icon" />
            {t("Install APK")}
          </button>
          <button className="btn" onClick={() => go("devices")}>
            <Plus size={13} className="icon" />
            {t("Connect Device")}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t">{t("DEVICE")} <span className="accent">{t("REGISTRY")}</span></span>
          {loading && (
            <span className="scan">
              <span className="blink" /> {t("SCANNING")}
            </span>
          )}
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {devices.length === 0 && !loading ? (
            <div className="empty">
              {t("NO DEVICES DETECTED")}
              <div className="faint" style={{ marginTop: 6, fontSize: 11 }}>
                {t("connect a device via USB and authorize this computer")}
              </div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("SERIAL")}</th>
                  <th>{t("MODEL")}</th>
                  <th>{t("STATE")}</th>
                  <th>{t("LINK")}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.serial} className="clickable" onClick={() => openDevice(d.serial)}>
                    <td>{d.serial}</td>
                    <td>{d.model ? d.model.replace(/_/g, " ") : "—"}</td>
                    <td><Indicator state={d.state} /></td>
                    <td><TransportTag transport={d.transport} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t">{t("QUICK")} <span className="accent">{t("ACTIONS")}</span></span>
        </div>
        <div className="panel-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => go("files")} disabled={connected.length === 0}>
            <Folder size={13} className="icon" /> {t("Files")}
          </button>
          <button className="btn" onClick={() => go("terminal")} disabled={connected.length === 0}>
            <Terminal size={13} className="icon" /> {t("Terminal")}
          </button>
          <button className="btn" onClick={() => go("logcat")} disabled={connected.length === 0}>
            <ScrollText size={13} className="icon" /> {t("Logcat")}
          </button>
          <button className="btn" onClick={() => go("screenshot")} disabled={connected.length === 0}>
            <Camera size={13} className="icon" /> {t("Screenshot")}
          </button>
          <button className="btn" onClick={() => go("backups")} disabled={connected.length === 0}>
            <Archive size={13} className="icon" /> {t("Backup")}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t">{t("DETOXIFICATION CONTROL")} <span className="accent">{t("MODULES")}</span></span>
        </div>
        <div className="panel-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => go("toolkit")} disabled={connected.length === 0}>
            <Wrench size={13} className="icon" /> {t("ADB Toolkit")}
          </button>
          <button className="btn" onClick={() => go("optimizer")} disabled={connected.length === 0}>
            <Gauge size={13} className="icon" /> {t("Optimizer")}
          </button>
          <button className="btn" onClick={() => go("perf")} disabled={connected.length === 0}>
            <Cpu size={13} className="icon" /> {t("Quest Performance")}
          </button>
          <button className="btn" onClick={() => go("debloat")} disabled={connected.length === 0}>
            <Ban size={13} className="icon" /> {t("Debloat")}
          </button>
          <button className="btn" onClick={() => go("screentools")} disabled={connected.length === 0}>
            <MonitorPlay size={13} className="icon" /> {t("Screen Tools")}
          </button>
          <button className="btn" onClick={() => go("cmdlib")}>
            <BookMarked size={13} className="icon" /> {t("Command Library")}
          </button>
          <button className="btn" onClick={() => go("activity")}>
            <History size={13} className="icon" /> {t("Activity Log")}
          </button>
          <button className="btn" onClick={() => go("theme")}>
            <Palette size={13} className="icon" /> {t("Theme Editor")}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("NETWORK")} <span className="accent">{t("STATUS")}</span></span>
          </div>
          <div className="panel-body">
            <div className="kv">
              <span className="k">{t("LINK")}</span>
              <span className="v ok">{t("ACTIVE")}</span>
              <span className="k">{t("ADB")}</span>
              <span className="v hl">{connected.length > 0 ? t("ONLINE") : t("STANDBY")}</span>
              <span className="k">{t("DEVICE")}</span>
              <span className="v">{connected.length > 0 ? t("CONNECTED") : t("NONE")}</span>
              <span className="k">{t("LATENCY")}</span>
              <span className="v dim">—</span>
            </div>
            <div className="kv-note">&gt; {adbVer}</div>
            <div className="kv-note">&gt; {t("CONNECTION ESTABLISHED")}</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("OPERATION")} <span className="accent">{t("LOG")}</span></span>
            <Wifi size={12} style={{ color: "var(--purple)" }} />
          </div>
          <div className="panel-body">
            <div className="log-list">
              {logs.length === 0 ? (
                <div className="empty" style={{ padding: 12 }}>{t("NO OPERATIONS RECORDED")}</div>
              ) : (
                logs.map((l) => (
                  <div className="row" key={l.id}>
                    <span className="time">{l.time}</span>
                    <span className={`lv ${l.level}`}>{l.level}</span>
                    <span className="txt">{l.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
