import { useEffect, useMemo, useState } from "react";
import {
  Battery,
  Gauge,
  Headset,
  Loader,
  Power,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Store,
  Thermometer,
} from "lucide-react";
import type { AqmError, Device, QuestStatus } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

export function QuestView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);

  const [status, setStatus] = useState<QuestStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    if (!serial) return;
    setBusy("status");
    setError(null);
    try {
      const s = await api.questStatus(serial);
      setStatus(s);
      log("INFO", `quest status: ${JSON.stringify(s)}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `quest status failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  const toggle = async (
    id: string,
    label: string,
    fn: (serial: string) => Promise<unknown>,
  ) => {
    if (!serial) return;
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      await fn(serial);
      setNote(`${label} applied.`);
      log("INFO", `quest: ${label} on ${serial}`);
      void refresh();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `quest ${label} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const reboot = async (mode: string, label: string) => {
    if (!serial) return;
    setBusy("reboot");
    setError(null);
    setNote(null);
    try {
      await api.deviceReboot(serial, mode);
      setNote(`Rebooting into ${label}...`);
      log("INFO", `reboot ${serial} mode=${mode}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `reboot failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const item = (icon: React.ReactNode, label: string, value: string, ok?: boolean) => (
    <div className="kv">
      <div className="k">{label}</div>
      <div className={`v ${ok === undefined ? "" : ok ? "ok" : "bad"}`}>
        {icon} {value}
      </div>
    </div>
  );

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Quest Tools")}</h1>
          <div className="crumb">{t("OCULUS / META PLATFORM CONTROLS")}</div>
        </div>
        <div className="actions">
          <select className="select-sm" value={serial} onChange={(e) => onSelect(e.target.value)} title={t("Device")}>
            {connected.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model ? d.model.replace(/_/g, " ") : d.serial}
              </option>
            ))}
            {connected.length === 0 && <option value="">{t("— no device —")}</option>}
          </select>
          <button className="btn" onClick={() => void refresh()} disabled={busy !== null || !serial}>
            <RefreshCw size={13} className="icon" />
            {busy === "status" ? t("Reading") : t("Refresh")}
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

      <div className="grid-2">
        {/* ---- Status ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t">
              <Headset size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("HEADSET STATUS")}
            </div>
            <span className="sub">{status ? t("LIVE") : "—"}</span>
          </div>
          <div className="panel-body">
            {!serial && <div className="empty">{t("CONNECT A DEVICE")}</div>}
            {serial && !status && (
              <div className="scan"><span className="blink" /> {t("READING DEVICE STATE…")}</div>
            )}
            {status && (
              <>
                {item(<Battery size={12} />, t("Battery"), `${status.batteryLevel ?? "?"}%`, (status.batteryLevel ?? 0) >= 20)}
                {item(<Thermometer size={12} />, t("Temp"), `${status.batteryTempC?.toFixed(1) ?? "?"}°C`, (status.batteryTempC ?? 0) < 60)}
                {item(<Smartphone size={12} />, t("VR Shell"), status.vrShellRunning ? t("RUNNING") : t("STOPPED"), status.vrShellRunning)}
                {item(<Gauge size={12} />, t("Power Save"), status.powerSave ? t("ON") : t("OFF"), !status.powerSave)}
              </>
            )}
          </div>
        </div>

        {/* ---- Toggles ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t">
              <Loader size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("PLATFORM TOGGLES")}
            </div>
            <span className="sub">{t("SIDELOAD / HUD / GUARDIAN")}</span>
          </div>
          <div className="panel-body">
            <Toggle
              label={t("FPS Counter")}
              desc={t("HUD de FPS no shell VR")}
              value={status?.fpsCounter ?? false}
              disabled={!serial || busy !== null}
              onToggle={(v) => toggle("fps", "FPS counter", (s) => api.questSetFpsCounter(s, v))}
            />
            <Toggle
              label={t("Phone SDK")}
              desc={t("Sideload de apps de desenvolvimento")}
              value={status?.phoneSdk ?? false}
              disabled={!serial || busy !== null}
              onToggle={(v) => toggle("sdk", "Phone SDK", (s) => api.questSetPhoneSdk(s, v))}
            />
            <Toggle
              label={t("Slow SDK")}
              desc={t("Reduz polling — economiza bateria")}
              value={status?.slowSdk ?? false}
              disabled={!serial || busy !== null}
              onToggle={(v) => toggle("slow", "Slow SDK", (s) => api.questSetSlowSdk(s, v))}
            />
            <Toggle
              label={t("Guardian")}
              desc={t("Guardião de limite de área")}
              value={status?.guardianEnabled ?? false}
              disabled={!serial || busy !== null}
              onToggle={(v) => toggle("guardian", "Guardian", (s) => api.questSetGuardian(s, v))}
            />
          </div>
        </div>
      </div>

      {/* ---- Ações ---- */}
      <div className="panel">
        <div className="panel-head">
          <div className="t">
            <RotateCcw size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("ACTIONS / BOOT")}
          </div>
          <span className="sub">{t("RESTART HUD · BOOT MODES")}</span>
        </div>
        <div className="panel-body actions-grid">
          <button
            className="btn"
            disabled={busy !== null || !serial}
            onClick={() => void toggle("vrshell", "VR shell restart", (s) => api.questRestartVrShell(s))}
          >
            <RotateCcw size={13} className="icon" /> {t("Restart VR Shell")}
          </button>
          <button
            className="btn"
            disabled={busy !== null || !serial}
            onClick={() => void toggle("store", "Open Quest Store", (s) => api.questOpenStore(s))}
          >
            <Store size={13} className="icon" /> {t("Open Quest Store")}
          </button>
          <button className="btn" disabled={busy !== null || !serial} onClick={() => void reboot("", "system")}>
            <Power size={13} className="icon" /> {t("Reboot System")}
          </button>
          <button className="btn" disabled={busy !== null || !serial} onClick={() => void reboot("bootloader", "bootloader")}>
            <Power size={13} className="icon" /> {t("Reboot Bootloader")}
          </button>
          <button className="btn" disabled={busy !== null || !serial} onClick={() => void reboot("recovery", "recovery")}>
            <Power size={13} className="icon" /> {t("Reboot Recovery")}
          </button>
          <button className="btn" disabled={busy !== null || !serial} onClick={() => void reboot("fastboot", "fastboot")}>
            <Power size={13} className="icon" /> {t("Reboot Fastboot")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  disabled,
  onToggle,
}: {
  label: string;
  desc: string;
  value: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <label className={`opt-row ${disabled ? "opt-disabled" : ""}`}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
      <span style={{ flex: 1 }}>
        <span style={{ display: "block" }}>{label}</span>
        <span className="faint" style={{ fontSize: 10.5 }}>{desc}</span>
      </span>
      <span className={value ? "v ok" : "v bad"}>{value ? t("ON") : t("OFF")}</span>
    </label>
  );
}
