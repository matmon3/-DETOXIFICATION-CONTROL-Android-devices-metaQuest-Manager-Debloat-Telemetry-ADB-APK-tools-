import { useEffect, useMemo, useState } from "react";
import { Camera, Fingerprint, Keyboard, MousePointer, RefreshCw, Sun, Volume2, Type } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { AqmError, Device, ScreenToolsState, ScreenInput } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";
import { DeviceSelect } from "../components/DeviceSelect";

interface Props {
  devices: Device[];
}

export function ScreenToolsView({ devices }: Props) {
  const connected = useMemo(() => devices.filter((d) => d.state === "connected"), [devices]);
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const { t } = useI18n();

  const [state, setState] = useState<ScreenToolsState | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // remote input form
  const [tapX, setTapX] = useState("540");
  const [tapY, setTapY] = useState("960");
  const [swX1, setSwX1] = useState("540");
  const [swY1, setSwY1] = useState("1200");
  const [swX2, setSwX2] = useState("540");
  const [swY2, setSwY2] = useState("600");
  const [swDur, setSwDur] = useState("300");
  const [key, setKey] = useState("KEYCODE_HOME");
  const [text, setText] = useState("");

  const refresh = async () => {
    if (!serial) return;
    setBusy("state");
    setError(null);
    try {
      const s = await api.screenToolsState(serial);
      setState(s);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `screen state failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, [serial]);

  const doPreview = async () => {
    if (!serial) return;
    setBusy("preview");
    setError(null);
    try {
      const r = await api.screenPreview(serial);
      setPreview(convertFileSrc(r.path));
      log("INFO", `screen preview: ${r.width}x${r.height} (${r.bytes} bytes)`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `screen preview failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const setVolume = async (stream: "media" | "ring" | "alarm", value: number) => {
    if (!serial) return;
    setBusy(`vol-${stream}`);
    setError(null);
    try {
      await api.screenVolumeSet(serial, stream, value);
      await refresh();
      log("INFO", `volume ${stream}=${value}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `volume ${stream} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const setBrightness = async (value: number) => {
    if (!serial) return;
    setBusy("bright");
    setError(null);
    try {
      await api.screenBrightnessSet(serial, value);
      await refresh();
      log("INFO", `brightness=${value}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `brightness failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const sendInput = async (input: ScreenInput, label: string) => {
    if (!serial) return;
    setBusy(`in-${input.action}`);
    setError(null);
    try {
      await api.screenSendInput(serial, input);
      const labelT =
        input.action === "tap" ? t("TAP") :
        input.action === "swipe" ? t("SWIPE") :
        input.action === "key" ? `${t("KEY")} ${key}` :
        input.action === "text" ? t("TEXT") : label;
      setNote(`${labelT} ${t("sent")}`);
      log("INFO", `input ${label} on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `input ${label} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const vol = (v: number | null | undefined) => v ?? 0;

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Screen Tools")}>{t("Screen Tools")}</h1>
          <div className="crumb">{t("PREVIEW · VOLUME · BRIGHTNESS · REMOTE INPUT")}</div>
        </div>
        <div className="actions">
          <DeviceSelect devices={devices} serial={serial} onChange={onSelect} />
          <button className="btn" onClick={() => void refresh()} disabled={busy !== null || !serial}>
            <RefreshCw size={13} className="icon" /> {t("Refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">✕ {error.message}</div>
          {error.detail && <details><summary>{t("View technical details")}</summary><pre>{error.detail}</pre></details>}
        </div>
      )}
      {note && <div className="note-box">▸ {note}</div>}
      {!serial && <div className="empty">{t("CONNECT A DEVICE TO CONTROL ITS SCREEN")}</div>}

      {serial && (
        <>
          {/* ---- Preview / display ---- */}
          <div className="panel">
            <div className="panel-head">
              <div className="t"><Camera size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("QUEST DISPLAY")}</div>
              <span className="sub">{preview ? t("SNAPSHOT PREVIEW") : t("PRESS CAPTURE TO FETCH FRAME")}</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <div className="screen-frame">
                {preview ? (
                  <>
                    <img src={preview} alt={t("device screen")} />
                    <div className="stream-overlay"><span className="blink" style={{ width: 6, height: 6, display: "inline-block" }} /> {t("SNAPSHOT")}</div>
                  </>
                ) : (
                  <div className="empty">{t("NO FRAME — CAPTURE DEVICE SCREEN")}</div>
                )}
                <div className="scanline-live" />
              </div>
              <div className="metric-row">
                <span>{t("FRAME")} <b>{state ? `${state.screenWidth ?? "?"}×${state.screenHeight ?? "?"}` : "—"}</b></span>
                <span>{t("DENSITY")} <b>{state?.density ?? "—"}</b></span>
                <span style={{ marginLeft: "auto" }}>
                  <button className="btn btn-sm btn-neon" disabled={busy !== null} onClick={() => void doPreview()}>
                    {busy === "preview" ? t("CAPTURING…") : t("CAPTURE FRAME")}
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* ---- Volume + brightness ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><Volume2 size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("VOLUME")}</div>
                <span className="sub">{t("STREAM CONTROL")}</span>
              </div>
              <div className="panel-body">
                <div className="vol-row">
                  <span className="k">{t("Media")}</span>
                  <input type="range" min={0} max={state?.mediaVolume !== null && state?.mediaVolume !== undefined ? 15 : 100} value={vol(state?.mediaVolume)} disabled={busy !== null}
                    onChange={(e) => void setVolume("media", Number(e.target.value))} />
                  <span className="v">{vol(state?.mediaVolume)}</span>
                </div>
                <div className="vol-row">
                  <span className="k">{t("Ring")}</span>
                  <input type="range" min={0} max={state?.ringVolume !== null && state?.ringVolume !== undefined ? 7 : 100} value={vol(state?.ringVolume)} disabled={busy !== null}
                    onChange={(e) => void setVolume("ring", Number(e.target.value))} />
                  <span className="v">{vol(state?.ringVolume)}</span>
                </div>
                <div className="vol-row">
                  <span className="k">{t("Alarm")}</span>
                  <input type="range" min={0} max={state?.alarmVolume !== null && state?.alarmVolume !== undefined ? 7 : 100} value={vol(state?.alarmVolume)} disabled={busy !== null}
                    onChange={(e) => void setVolume("alarm", Number(e.target.value))} />
                  <span className="v">{vol(state?.alarmVolume)}</span>
                </div>
                <div style={{ borderTop: "1px dashed var(--border)", margin: "10px 0" }} />
                <div className="vol-row">
                  <span className="k" style={{ width: 56 }}><Sun size={11} style={{ display: "inline", marginRight: 4 }} />{t("Bright")}</span>
                  <input type="range" min={1} max={state?.brightnessMax ?? 255} value={state?.brightness ?? 1} disabled={busy !== null}
                    onChange={(e) => void setBrightness(Number(e.target.value))} />
                  <span className="v">{state?.brightness ?? "—"}</span>
                </div>
                <div className="kv-note">
                  {t("Brightness requires the device to allow manual control (adaptive brightness off).")}
                </div>
              </div>
            </div>

            {/* ---- Remote input ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><MousePointer size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("REMOTE INPUT")}</div>
                <span className="sub">{t("TAP · SWIPE · KEY · TEXT")}</span>
              </div>
              <div className="panel-body">
                <div className="kv-note" style={{ marginBottom: 8 }}>{t("TAP")}</div>
                <div className="vol-row">
                  <input style={{ padding: "3px 6px", width: 70 }} value={tapX} onChange={(e) => setTapX(e.target.value)} />
                  <input style={{ padding: "3px 6px", width: 70 }} value={tapY} onChange={(e) => setTapY(e.target.value)} />
                  <button className="btn btn-sm" disabled={busy !== null}
                    onClick={() => void sendInput({ action: "tap", x: Number(tapX), y: Number(tapY) }, "tap")}>
                    <MousePointer size={11} /> {t("TAP")}
                  </button>
                </div>
                <div className="kv-note" style={{ margin: "8px 0" }}>{t("SWIPE")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 4 }}>
                  <input style={{ padding: "3px 6px" }} placeholder="x1" value={swX1} onChange={(e) => setSwX1(e.target.value)} />
                  <input style={{ padding: "3px 6px" }} placeholder="y1" value={swY1} onChange={(e) => setSwY1(e.target.value)} />
                  <input style={{ padding: "3px 6px" }} placeholder="x2" value={swX2} onChange={(e) => setSwX2(e.target.value)} />
                  <input style={{ padding: "3px 6px" }} placeholder="y2" value={swY2} onChange={(e) => setSwY2(e.target.value)} />
                </div>
                <div className="vol-row">
                  <input style={{ padding: "3px 6px", width: 90 }} placeholder={t("duration ms")} value={swDur} onChange={(e) => setSwDur(e.target.value)} />
                  <button className="btn btn-sm" disabled={busy !== null}
                    onClick={() => void sendInput({ action: "swipe", x: Number(swX1), y: Number(swY1), x2: Number(swX2), y2: Number(swY2), durationMs: Number(swDur) }, "swipe")}>
                    {t("SWIPE")}
                  </button>
                </div>
                <div className="kv-note" style={{ margin: "8px 0" }}>{t("KEY / TEXT")}</div>
                <div className="vol-row">
                  <select style={{ flex: 1, padding: "3px 6px" }} value={key} onChange={(e) => setKey(e.target.value)}>
                    <option value="KEYCODE_HOME">{t("HOME")}</option>
                    <option value="KEYCODE_BACK">{t("BACK")}</option>
                    <option value="KEYCODE_ENTER">{t("ENTER")}</option>
                    <option value="KEYCODE_POWER">{t("POWER")}</option>
                    <option value="KEYCODE_VOLUME_UP">{t("VOLUME UP")}</option>
                    <option value="KEYCODE_VOLUME_DOWN">{t("VOLUME DOWN")}</option>
                    <option value="KEYCODE_DPAD_UP">{t("DPAD UP")}</option>
                    <option value="KEYCODE_DPAD_DOWN">{t("DPAD DOWN")}</option>
                    <option value="KEYCODE_MENU">{t("MENU")}</option>
                  </select>
                  <button className="btn btn-sm" disabled={busy !== null}
                    onClick={() => void sendInput({ action: "key", key }, `key ${key}`)}>
                    <Keyboard size={11} /> {t("KEY")}
                  </button>
                </div>
                <div className="vol-row">
                  <input style={{ flex: 1, padding: "3px 6px" }} placeholder={t("type text…")} value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn btn-sm" disabled={busy !== null || !text.trim()}
                    onClick={() => void sendInput({ action: "text", text }, "text input")}>
                    <Type size={11} /> {t("TEXT")}
                  </button>
                </div>
                <div className="kv-note">
                  <Fingerprint size={11} style={{ display: "inline", marginRight: 4, color: "var(--purple)" }} />
                  {t("Coordinates use device pixels ({w}×{h}).", { w: state?.screenWidth ?? "?", h: state?.screenHeight ?? "?" })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {busy === "state" && serial && <div className="scan"><span className="blink" /> {t("READING DEVICE STATE…")}</div>}
    </div>
  );
}
