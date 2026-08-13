import { useCallback, useEffect, useState } from "react";
import { Power, RefreshCw, Zap } from "lucide-react";
import type { AqmError, FastbootDevice } from "../api/types";
import { api, toError } from "../api/bridge";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

export function FastbootView() {
  const { t } = useI18n();
  const [devices, setDevices] = useState<FastbootDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await api.fastbootList();
      setDevices(list);
      log("INFO", `fastboot devices: ${list.length}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `fastboot list failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reboot = async (serial: string, mode?: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.fastbootReboot(serial, mode);
      setNote(t("Reboot requested for {s} ({m}).", { s: serial, m: mode ?? "system" }));
      log("INFO", `fastboot reboot ${serial} mode=${mode ?? "system"}`);
      void refresh();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `fastboot reboot failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Fastboot")}</h1>
          <div className="crumb">{t("SAFE BOOTLOADER OPS")}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={13} className="icon" />
            {busy ? t("Scanning") : t("Scan")}
          </button>
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
      {note && <div className="note-box">▸ {note}</div>}

      <div className="panel">
        <div className="panel-head">
          <div className="t">
            <Zap size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("BOOTLOADER DEVICES")}
          </div>
          <span className="sub">{devices.length} {t("FOUND")}</span>
        </div>
        <div className="panel-body">
          {devices.length === 0 && (
            <div className="empty">
              {t("NO DEVICES IN FASTBOOT MODE")}
              <div className="faint" style={{ marginTop: 6, fontSize: 11 }}>
                {t("To enter fastboot: adb reboot bootloader (or power + volume down).")}
              </div>
            </div>
          )}
          {devices.map((d) => (
            <div className="dev-row" key={d.serial}>
              <div className="row-icon">
                <Zap size={14} style={{ color: "var(--yellow)" }} />
              </div>
              <div className="row-main">
                <div className="row-title">{d.serial}</div>
                <div className="row-sub">{t("mode: {m}", { m: d.mode })}</div>
              </div>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void reboot(d.serial)}>
                <Power size={13} className="icon" /> {t("Reboot System")}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void reboot(d.serial, "bootloader")}>
                <Power size={13} className="icon" /> {t("Reboot Bootloader")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
