import { useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Circle, Download, Square } from "lucide-react";
import type { AqmError, Device } from "../api/types";
import { api, toError, onRecordStopped } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export function RecordView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [remotePath, setRemotePath] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<AqmError | null>(null);
  const [saving, setSaving] = useState(false);

  const [size, setSize] = useState("");
  const [fps, setFps] = useState("30");
  const [bitrate, setBitrate] = useState("");
  const [timeLimit, setTimeLimit] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!serial && connected.length > 0) setSerial(connected[0].serial);
  }, [connected, serial]);

  // Quando o screenrecord termina sozinho (time-limit), emite evento.
  useEffect(() => {
    const un = onRecordStopped((s) => {
      log(s.ok ? "INFO" : "WARN", `record stopped: ${s.message}`);
      if (s.ok && s.remotePath) {
        setRecording(false);
        setRemotePath(s.remotePath);
        setToken(null);
      } else {
        setRecording(false);
        setToken(null);
        setError({ message: s.message });
      }
      if (timerRef.current) clearInterval(timerRef.current);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const start = async () => {
    if (!serial) return;
    setBusy(true);
    setError(null);
    try {
      const opts = {
        size: size.trim() || undefined,
        fps: fps.trim() || undefined,
        bitrate: bitrate.trim() || undefined,
        timeLimit: timeLimit.trim() ? Number(timeLimit) : undefined,
      };
      const started = await api.recordStart(serial, opts);
      setToken(started.token);
      setRemotePath(started.remotePath);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      log("INFO", `recording started: ${started.remotePath}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `record start failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const remote = await api.recordStop(token);
      setRecording(false);
      setRemotePath(remote);
      if (timerRef.current) clearInterval(timerRef.current);
      log("INFO", "recording stopped, video on device");
      await saveVideo(remote);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `record stop failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveVideo = async (remote: string) => {
    setSaving(true);
    try {
      const dest = await save({
        title: t("Save recording"),
        defaultPath: "detoxification-control-recording.mp4",
        filters: [{ name: "MP4", extensions: ["mp4"] }],
      });
      if (!dest) return;
      await api.recordPull(serial, remote, dest);
      setRemotePath(null);
      log("INFO", `recording saved: ${dest}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const retrySave = () => {
    if (remotePath) void saveVideo(remotePath);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, []);

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Screen Record")}</h1>
          <div className="crumb">{t("SCREENRECORD / MP4 ON DEVICE")}</div>
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
          {recording ? (
            <button className="btn btn-danger" onClick={() => void stop()} disabled={busy}>
              <Square size={13} className="icon" />
              {t("Stop")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void start()} disabled={busy || !serial}>
              <Circle size={13} className="icon" />
              {busy ? t("Starting") : t("Start Recording")}
            </button>
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

      <div className="grid-3">
        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("STATUS LIVE")}</span>
          </div>
          <div className="panel-body">
            {recording ? (
              <>
                <div className="rec-indicator">
                  <span className="rec-dot" />
                  <span className="rec-time">{fmtTime(elapsed)}</span>
                </div>
                <div className="faint" style={{ marginTop: 8, fontSize: 11 }}>
                  {t("REC {path}", { path: remotePath ?? "" })}
                </div>
              </>
            ) : remotePath ? (
              <>
                <div className="ok up" style={{ marginBottom: 6 }}>
                  {t("READY TO SAVE")}
                </div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {remotePath}
                </div>
                <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={retrySave} disabled={saving}>
                  <Download size={12} className="icon" />
                  {saving ? t("Saving…") : t("Save to computer")}
                </button>
              </>
            ) : (
              <div className="dim" style={{ padding: 8 }}>
                {t("IDLE — press Start Recording.")}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("OPTIONS DEVICE SIDE")}</span>
          </div>
          <div className="panel-body">
            <div className="opt-row">
              <label>{t("FPS")}</label>
              <input value={fps} onChange={(e) => setFps(e.target.value)} placeholder="30" />
            </div>
            <div className="opt-row">
              <label>{t("Size")}</label>
              <input value={size} onChange={(e) => setSize(e.target.value)} placeholder={t("auto (e.g. 1280x720)")} />
            </div>
            <div className="opt-row">
              <label>{t("Bitrate")}</label>
              <input value={bitrate} onChange={(e) => setBitrate(e.target.value)} placeholder={t("auto (e.g. 8000000)")} />
            </div>
            <div className="opt-row">
              <label>{t("Time limit (s)")}</label>
              <input value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder={t("none (max 180)")} />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("NOTES LIMITS")}</span>
          </div>
          <div className="panel-body">
            <div className="kv">
              <span className="k">{t("Max duration")}</span>
              <span className="v dim">{t("180s per clip (Android limit)")}</span>
              <span className="k">{t("Sound")}</span>
              <span className="v dim">{t("Not captured by screenrecord")}</span>
              <span className="k">{t("Storage")}</span>
              <span className="v dim">
                {t("Video is stored on the device until you save it to the computer.")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
