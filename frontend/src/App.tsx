import { useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, type Page } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useDevices } from "./hooks/useDevices";
import { ActiveDeviceProvider } from "./hooks/useActiveDevice";
import { DashboardView } from "./views/DashboardView";
import { DevicesView } from "./views/DevicesView";
import { DeviceDetailView } from "./views/DeviceDetailView";
import { TerminalView } from "./views/TerminalView";
import { SettingsView } from "./views/SettingsView";
import { AppsView } from "./views/AppsView";
import { FilesView } from "./views/FilesView";
import { ScreenshotView } from "./views/ScreenshotView";
import { RecordView } from "./views/RecordView";
import { LogcatView } from "./views/LogcatView";
import { PerformanceView } from "./views/PerformanceView";
import { NetworkView } from "./views/NetworkView";
import { BackupsView } from "./views/BackupsView";
import { QuestView } from "./views/QuestView";
import { FastbootView } from "./views/FastbootView";
import { AdbToolkitView } from "./views/AdbToolkitView";
import { QuestOptimizerView } from "./views/QuestOptimizerView";
import { QuestDebloatView } from "./views/QuestDebloatView";
import { ScreenToolsView } from "./views/ScreenToolsView";
import { CommandLibraryView } from "./views/CommandLibraryView";
import { ActivityLogView } from "./views/ActivityLogView";
import { ThemeEditorView } from "./views/ThemeEditorView";
import { PerfView } from "./views/PerfView";

const SIDEBAR_W_KEY = "detoxification.sidebarW";

export default function App() {
  const { devices, connected, loading } = useDevices();
  const [page, setPage] = useState<Page>("dashboard");
  const [serial, setSerial] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const go = (p: Page, s?: string) => {
    if (s) setSerial(s);
    setPage(p);
  };

  const openDevice = (s: string) => {
    setSerial(s);
    setPage("device");
  };

  const currentDevices = useMemo(() => devices, [devices]);

  // Resizable sidebar (persisted width, clamped)
  useEffect(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_W_KEY));
    if (saved >= 40 && saved <= 420) {
      document.documentElement.style.setProperty("--sidebar-w", `${saved}px`);
    }
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const rootEl = root.current;
    if (!rootEl) return;
    const el = rootEl.querySelector<HTMLElement>(".side-resize");
    el?.classList.add("dragging");
    document.body.style.userSelect = "none";

    const move = (ev: PointerEvent) => {
      const w = Math.max(40, Math.min(420, ev.clientX));
      document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    };
    const up = () => {
      const w = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w"),
      );
      if (w > 0) localStorage.setItem(SIDEBAR_W_KEY, String(w));
      el?.classList.remove("dragging");
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  let view: React.ReactNode = null;
  switch (page) {
    case "dashboard":
      view = <DashboardView devices={currentDevices} loading={loading} go={go} openDevice={openDevice} />;
      break;
    case "devices":
      view = <DevicesView devices={currentDevices} loading={loading} openDevice={openDevice} onRefresh={() => {}} />;
      break;
    case "device":
      view = serial ? (
        <DeviceDetailView serial={serial} back={() => setPage("devices")} openTerminal={(s) => go("terminal", s)} />
      ) : (
        <DevicesView devices={currentDevices} loading={loading} openDevice={openDevice} onRefresh={() => {}} />
      );
      break;
    case "terminal":
      view = <TerminalView devices={connected.length > 0 ? connected : currentDevices} />;
      break;
    case "settings":
      view = <SettingsView />;
      break;
    case "apps":
      view = <AppsView devices={currentDevices} />;
      break;
    case "files":
      view = <FilesView devices={currentDevices} />;
      break;
    case "logcat":
      view = <LogcatView devices={currentDevices} />;
      break;
    case "screenshot":
      view = <ScreenshotView devices={currentDevices} />;
      break;
    case "record":
      view = <RecordView devices={currentDevices} />;
      break;
    case "performance":
      view = <PerformanceView devices={currentDevices} />;
      break;
    case "network":
      view = <NetworkView devices={currentDevices} />;
      break;
    case "fastboot":
      view = <FastbootView />;
      break;
    case "quest":
      view = <QuestView devices={currentDevices} />;
      break;
    case "backups":
      view = <BackupsView devices={currentDevices} />;
      break;
    // Fase 7: DETOXIFICATION CONTROL
    case "toolkit":
      view = <AdbToolkitView devices={currentDevices} onNavigate={(p) => go(p as Page)} />;
      break;
    case "optimizer":
      view = <QuestOptimizerView devices={currentDevices} />;
      break;
    case "debloat":
      view = <QuestDebloatView devices={currentDevices} />;
      break;
    case "screentools":
      view = <ScreenToolsView devices={currentDevices} />;
      break;
    case "cmdlib":
      view = <CommandLibraryView devices={currentDevices} />;
      break;
    case "activity":
      view = <ActivityLogView />;
      break;
    case "theme":
      view = <ThemeEditorView />;
      break;
    case "perf":
      view = <PerfView devices={currentDevices} />;
      break;
    default:
      view = <DashboardView devices={currentDevices} loading={loading} go={go} openDevice={openDevice} />;
  }

  return (
    <div className="app overlay" ref={root}>
      <ActiveDeviceProvider devices={currentDevices}>
        <TitleBar connectedCount={connected.length} devices={currentDevices} />
        <div className="app-body">
          <Sidebar page={page} go={go} devices={currentDevices} />
          <div className="side-resize" onPointerDown={startResize} />
          <main className="main">{view}</main>
        </div>
        <StatusBar connectedCount={connected.length} />
      </ActiveDeviceProvider>
    </div>
  );
}
