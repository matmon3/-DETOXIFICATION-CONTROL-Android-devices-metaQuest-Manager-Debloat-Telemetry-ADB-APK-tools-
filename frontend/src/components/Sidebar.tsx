import {
  LayoutDashboard,
  Smartphone,
  Package,
  Folder,
  Terminal,
  ScrollText,
  Camera,
  Video,
  Activity,
  Wifi,
  Zap,
  Headset,
  Archive,
  Settings,
  ChevronRight,
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
import { useI18n } from "../hooks/useI18n";

export type Page =
  | "dashboard"
  | "devices"
  | "device"
  | "apps"
  | "files"
  | "terminal"
  | "logcat"
  | "screenshot"
  | "record"
  | "performance"
  | "network"
  | "fastboot"
  | "quest"
  | "backups"
  | "toolkit"
  | "optimizer"
  | "debloat"
  | "screentools"
  | "cmdlib"
  | "activity"
  | "theme"
  | "perf"
  | "settings";

interface NavProps {
  page: Page;
  go: (p: Page, serial?: string) => void;
  devices: Device[];
}

function Item({
  id: _id,
  icon,
  label,
  sub,
  active,
  onClick,
  indicator,
}: {
  id: Page;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
  indicator?: "green" | "red" | "yellow" | "dim";
}) {
  return (
    <div className={`side-item ${active ? "active" : ""}`} onClick={onClick} title={label}>
      <span className="icon">{icon}</span>
      {label}
      {sub && <span className="sub">{sub}</span>}
      {indicator && <span className={`dot led-${indicator}`} />}
    </div>
  );
}

export function Sidebar({ page, go, devices }: NavProps) {
  const { t } = useI18n();
  const connectedCount = devices.filter((d) => d.state === "connected").length;
  const anyQuest = devices.some(
    (d) => d.state === "connected" && /quest|oculus/i.test(d.model ?? ""),
  );

  const is = (p: Page) => page === p || (p === "device" && page === "device");

  return (
    <div className="sidebar">
      <div className="side-section">
        <div className="side-label">{t("DEVICE CONTROL INTERFACE")}</div>
        <Item
          id="dashboard"
          icon={<LayoutDashboard />}
          label={t("Dashboard")}
          active={is("dashboard")}
          onClick={() => go("dashboard")}
          indicator={connectedCount > 0 ? "green" : "dim"}
        />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Devices")}</div>
        <Item
          id="devices"
          icon={<Smartphone />}
          label={t("Connected")}
          sub={`${connectedCount}`}
          active={is("devices")}
          onClick={() => go("devices")}
        />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Applications")}</div>
        <Item id="apps" icon={<Package />} label={t("Installed")} active={is("apps")} onClick={() => go("apps")} />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Files")}</div>
        <Item id="files" icon={<Folder />} label={t("File Manager")} active={is("files")} onClick={() => go("files")} />
      </div>

      <div className="side-section">
        <div className="side-label">{t("ADB")}</div>
        <Item id="terminal" icon={<Terminal />} label={t("Terminal")} active={is("terminal")} onClick={() => go("terminal")} />
        <Item id="logcat" icon={<ScrollText />} label={t("Logcat")} active={is("logcat")} onClick={() => go("logcat")} />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Tools")}</div>
        <Item id="screenshot" icon={<Camera />} label={t("Screenshot")} active={is("screenshot")} onClick={() => go("screenshot")} />
        <Item id="record" icon={<Video />} label={t("Screen Record")} active={is("record")} onClick={() => go("record")} />
        <Item id="performance" icon={<Activity />} label={t("Performance")} active={is("performance")} onClick={() => go("performance")} />
        <Item id="network" icon={<Wifi />} label={t("Network")} active={is("network")} onClick={() => go("network")} />
        <Item id="fastboot" icon={<Zap />} label={t("Fastboot")} active={is("fastboot")} onClick={() => go("fastboot")} />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Quest")}</div>
        <Item
          id="quest"
          icon={<Headset />}
          label={t("Quest Tools")}
          sub={anyQuest ? t("DETECTED") : undefined}
          active={is("quest")}
          onClick={() => go("quest")}
          indicator={anyQuest ? "green" : "dim"}
        />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Control Center")}</div>
        <Item id="toolkit" icon={<Wrench />} label={t("ADB Toolkit")} active={is("toolkit")} onClick={() => go("toolkit")} />
        <Item id="optimizer" icon={<Gauge />} label={t("Optimizer")} active={is("optimizer")} onClick={() => go("optimizer")} />
        <Item id="perf" icon={<Cpu />} label={t("Performance")} active={is("perf")} onClick={() => go("perf")} />
        <Item id="debloat" icon={<Ban />} label={t("Debloat")} active={is("debloat")} onClick={() => go("debloat")} />
        <Item id="screentools" icon={<MonitorPlay />} label={t("Screen Tools")} active={is("screentools")} onClick={() => go("screentools")} />
        <Item id="cmdlib" icon={<BookMarked />} label={t("Command Library")} active={is("cmdlib")} onClick={() => go("cmdlib")} />
        <Item id="activity" icon={<History />} label={t("Activity Log")} active={is("activity")} onClick={() => go("activity")} />
        <Item id="theme" icon={<Palette />} label={t("Theme Editor")} active={is("theme")} onClick={() => go("theme")} />
      </div>

      <div className="side-section">
        <div className="side-label">{t("Storage")}</div>
        <Item id="backups" icon={<Archive />} label={t("Backups")} active={is("backups")} onClick={() => go("backups")} />
      </div>

      <div className="side-section" style={{ marginTop: "auto" }}>
        <Item id="settings" icon={<Settings />} label={t("Settings")} active={is("settings")} onClick={() => go("settings")} />
      </div>

      <div className="sidebar-footer">
        <ChevronRight size={10} style={{ display: "inline", marginRight: 4, color: "var(--purple)" }} />
        {t("NODE / DETOXIFICATION CONTROL / {n} LINK{s} ACTIVE", {
          n: connectedCount,
          s: connectedCount === 1 ? "" : "S",
        })}
      </div>
    </div>
  );
}
