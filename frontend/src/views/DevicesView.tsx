import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import type { Device } from "../api/types";
import { Indicator, TransportTag } from "../components/Indicator";
import { api } from "../api/bridge";
import { log } from "../appLog";
import { useI18n } from "../hooks/useI18n";

interface Props {
  devices: Device[];
  loading: boolean;
  openDevice: (serial: string) => void;
  onRefresh: () => void;
}

export function DevicesView({ devices, loading, openDevice, onRefresh }: Props) {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const list = await api.refreshDevices();
      log("INFO", `manual scan: ${list.length} device(s)`);
    } catch {
      log("WARN", "manual scan failed");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...devices].sort((a, b) => a.serial.localeCompare(b.serial));

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Connected Devices")}</h1>
          <div className="crumb">
            {t("ADB REGISTRY / {n} NODE{n2} FOUND", {
              n: devices.length,
              n2: devices.length === 1 ? "" : "S",
            })}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={refresh} disabled={refreshing || loading}>
            <RefreshCw size={13} className="icon" />
            {refreshing ? t("Scanning") : t("Rescan")}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t">{t("ADB")} <span className="accent">{t("DEVICE TABLE")}</span></span>
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
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)" }}>
                {t("Connect a device via USB or Wi-Fi. Enable USB debugging in developer options.")}
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
                  <th>{t("PRODUCT")}</th>
                  <th>{t("TRANSPORT")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr key={d.serial} className="clickable" onClick={() => openDevice(d.serial)}>
                    <td>{d.serial}</td>
                    <td>{d.model ? d.model.replace(/_/g, " ") : "—"}</td>
                    <td><Indicator state={d.state} /></td>
                    <td>{d.transport_id ? `id:${d.transport_id}` : "—"}</td>
                    <td>{d.product ? d.product.replace(/_/g, " ") : "—"}</td>
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
          <span className="t">{t("Wi-Fi")} <span className="accent">{t("ADB")}</span></span>
        </div>
        <div className="panel-body">
          <div className="kv">
            <span className="k">{t("Connect")}</span>
            <span className="v dim">
              {`adb connect 192.168.x.x:5555`} —{" "}
              <span className="faint">{t("assistant in Fase 4 (Network module)")}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
