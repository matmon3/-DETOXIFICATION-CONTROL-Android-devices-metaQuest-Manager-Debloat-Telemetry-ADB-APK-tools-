import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Camera, Copy, RefreshCw } from "lucide-react";
import type { AqmError, Device } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

export function ScreenshotView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);

  useEffect(() => {
    if (!serial && connected.length > 0) setSerial(connected[0].serial);
  }, [connected, serial]);

  const take = useCallback(async () => {
    if (!serial) return;
    setBusy(true);
    setError(null);
    try {
      const dir = await open({
        directory: true,
        title: t("Save screenshot to folder"),
      });
      if (!dir) return;
      const destDir = typeof dir === "string" ? dir : dir[0];
      const file = await api.screenshotTake(serial, destDir);
      setSavedPath(file);
      setPreview(convertFileSrc(file));
      log("INFO", `screenshot saved: ${file}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `screenshot failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [serial, t]);

  const copyPath = async () => {
    if (!savedPath) return;
    try {
      await navigator.clipboard.writeText(savedPath);
      log("INFO", "screenshot path copied");
    } catch {
      log("WARN", "clipboard unavailable");
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Screenshot")}</h1>
          <div className="crumb">{t("SCREENCAP / PNG CAPTURE")}</div>
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
          <button className="btn btn-primary" onClick={() => void take()} disabled={busy || !serial}>
            <Camera size={13} className="icon" />
            {busy ? t("Capturing") : t("Take Screenshot")}
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

      <div className="panel">
        <div className="panel-head">
          <span className="t">{t("CAPTURE PREVIEW")}</span>
        </div>
        <div className="panel-body">
          {!serial ? (
            <div className="empty">{t("CONNECT A DEVICE")}</div>
          ) : busy && !preview ? (
            <div className="scan">
              <span className="blink" /> {t("RUNNING SCREENCAP…")}
            </div>
          ) : preview ? (
            <>
              <img src={preview} className="shot-preview" alt="screenshot" />
              <div className="shot-path">
                <span className="faint">{t("FILE:")}</span> {savedPath}
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => void copyPath()}>
                  <Copy size={12} className="icon" /> {t("Copy path")}
                </button>
                <button className="btn" onClick={() => void take()}>
                  <RefreshCw size={12} className="icon" /> {t("Retake")}
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              {t("NO CAPTURE YET")}
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)" }}>
                {t("Screenshots are saved as PNG on your computer.")}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t">{t("NOTES QUEST")}</span>
        </div>
        <div className="panel-body">
          <div className="kv">
            <span className="k">{t("Guardian")}</span>
            <span className="v dim">
              {t("If the screen shows black/gray, the headset may be in sleep or the guardian screen is active. Wake it before capturing.")}
            </span>
            <span className="k">{t("Format")}</span>
            <span className="v dim">
              {t("PNG via {cmd} (raw capture on device).", { cmd: "screencap -p" })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
