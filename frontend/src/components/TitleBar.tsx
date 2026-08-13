import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Radio, Smartphone } from "lucide-react";
import type { Device } from "../api/types";
import { useActiveDevice } from "../hooks/useActiveDevice";
import { useI18n } from "../hooks/useI18n";

const win = getCurrentWindow();

function QcLogo() {
  return (
    <svg viewBox="0 0 24 24" className="titlebar-logo" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="2.5" y1="12" x2="21.5" y2="12" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function TitleBar({ connectedCount, devices }: { connectedCount: number; devices: Device[] }) {
  const { activeSerial, setActive } = useActiveDevice();
  const { t } = useI18n();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <QcLogo />
        <span className="titlebar-title">DETOXIFICATION CONTROL</span>
        <span className="titlebar-sep" />
        <span className="titlebar-sub">{t("META QUEST / ANDROID CONTROL CENTER")}</span>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="titlebar-status">
        {devices.length > 0 && (
          <span className="dev-switch">
            <Smartphone size={11} style={{ color: "var(--purple)" }} />
            <select
              className="select-sm dev-switch-select"
              value={activeSerial}
              onChange={(e) => setActive(e.target.value)}
              title={t("Active device")}
            >
              {devices.map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model ? d.model.replace(/_/g, " ") : d.serial}
                  {d.transport === "wifi" ? " (wifi)" : ""}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="ind">
          <span className={`led ${connectedCount > 0 ? "led-green" : "led-dim"}`} />
          {connectedCount > 0
            ? t("{n} DEVICE{s}", { n: connectedCount, s: connectedCount > 1 ? "S" : "" })
            : t("NO DEVICE")}
        </span>
        <Radio size={12} style={{ color: connectedCount > 0 ? "var(--purple)" : "var(--text-faint)" }} />
      </div>
      <div className="win-btns">
        <button className="win-btn" onClick={() => win.minimize()} title={t("Minimize")} aria-label={t("Minimize")}>
          <Minus size={14} />
        </button>
        <button className="win-btn" onClick={() => win.toggleMaximize()} title={t("Maximize")} aria-label={t("Maximize")}>
          <Square size={11} />
        </button>
        <button className="win-btn close" onClick={() => win.close()} title={t("Close")} aria-label={t("Close")}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
