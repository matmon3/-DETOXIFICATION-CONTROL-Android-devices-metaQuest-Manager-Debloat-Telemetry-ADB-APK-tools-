import { useMemo, useState } from "react";
import {
  Activity,
  Camera,
  FileBox,
  FileDown,
  FileUp,
  FolderPlus,
  FolderOpen,
  Info,
  Loader,
  Package,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import type { AqmError, Device } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";
import { DeviceSelect } from "../components/DeviceSelect";

interface Props {
  devices: Device[];
  onNavigate: (page: string) => void;
}

interface Op {
  label: string;
  ok: boolean;
  output: string;
}

export function AdbToolkitView({ devices, onNavigate }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [ops, setOps] = useState<Op[]>([]);

  // APPS inputs
  const [pkg, setPkg] = useState<string>("");
  const [apkPath, setApkPath] = useState<string>("");
  // FILES inputs
  const [localPath, setLocalPath] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>("/sdcard/");
  const [renameTo, setRenameTo] = useState<string>("");

  const pushOp = (label: string, ok: boolean, output: string) =>
    setOps((prev) => [{ label, ok, output }, ...prev].slice(0, 12));

  const run = async (id: string, label: string, fn: (s: string) => Promise<string>, logText?: string) => {
    if (!serial) return;
    setBusy(id);
    setError(null);
    try {
      const out = await fn(serial);
      pushOp(label, true, out);
      log("INFO", logText ?? `${label} ok on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      pushOp(label, false, err.detail ?? err.message);
      log("ERROR", `${label} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runPkg = async (id: string, label: string, fn: (s: string, p: string) => Promise<unknown>) => {
    if (!serial || !pkg.trim()) return;
    const clean = pkg.trim();
    setBusy(id);
    setError(null);
    try {
      const res = await fn(serial, clean);
      pushOp(label, true, typeof res === "string" ? res : "OK");
      log("INFO", `${label} ${clean}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      pushOp(label, false, err.detail ?? err.message);
      log("ERROR", `${label} ${clean}: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const installApk = async () => {
    if (!serial || !apkPath.trim()) return;
    setBusy("install");
    setError(null);
    try {
      const res = await api.packageInstall(serial, [apkPath], true, false);
      pushOp("Install APK", true, res);
      log("INFO", `install ${apkPath}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      pushOp("Install APK", false, err.detail ?? err.message);
      log("ERROR", `install failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runFiles = async (id: string, label: string, fn: (s: string) => Promise<unknown>) => {
    if (!serial) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fn(serial);
      pushOp(label, true, typeof res === "string" ? res : "OK");
      log("INFO", `${label} ok`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      pushOp(label, false, err.detail ?? err.message);
      log("ERROR", `${label} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const btn = (_id: string, icon: React.ReactNode, label: string, desc: string, on: () => void, danger?: boolean) => (
    <button className={`toolkit-btn ${danger ? "btn-danger" : ""}`} disabled={busy !== null || !serial} onClick={on}>
      <span className="t-icon">{icon}</span>
      {label}
      <span className="t-desc">{desc}</span>
    </button>
  );

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("ADB Toolkit")}>{t("ADB Toolkit")}</h1>
          <div className="crumb">{t("COMMAND CENTER — DEVICE / APPS / FILES")}</div>
        </div>
        <div className="actions">
          <DeviceSelect devices={devices} serial={serial} onChange={onSelect} />
          <button className="btn" onClick={() => setOps([])}>{t("Clear")}</button>
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
      {!serial && <div className="empty">{t("CONNECT A DEVICE TO ENABLE THE TOOLKIT")}</div>}

      {serial && (
        <>
          {/* ---- DEVICE ---- */}
          <div className="panel">
            <div className="panel-head">
              <div className="t"><Power size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("DEVICE")}</div>
              <span className="sub">{t("INFO · REBOOT · SCREEN")}</span>
            </div>
            <div className="panel-body">
              <div className="toolkit-grid">
                {btn("deviceinfo", <Info size={15} />, t("Device Info"), t("Full getprop + battery + storage"), () =>
                  run("deviceinfo", "Device Info", async (s) => {
                    const i = await api.deviceInfo(s);
                    return JSON.stringify(i, null, 2);
                  }))}
                {btn("reboot", <RefreshCw size={15} />, t("Reboot"), t("Restart device"), () =>
                  run("reboot", "Reboot", async (s) => {
                    await api.deviceReboot(s, "");
                    return t("Rebooting...");
                  }))}
                {btn("bootloader", <RotateCcw size={15} />, t("Bootloader"), t("Reboot to bootloader"), () =>
                  run("bootloader", "Reboot Bootloader", async (s) => {
                    await api.deviceReboot(s, "bootloader");
                    return t("Rebooting to bootloader...");
                  }))}
                {btn("recovery", <Activity size={15} />, t("Recovery"), t("Reboot to recovery"), () =>
                  run("recovery", "Reboot Recovery", async (s) => {
                    await api.deviceReboot(s, "recovery");
                    return t("Rebooting to recovery...");
                  }))}
                {btn("shutdown", <Power size={15} />, t("Shutdown"), t("Power off device"), () =>
                  run("shutdown", "Shutdown", async (s) => {
                    const o = await api.adbExecute(["-s", s, "shell", "reboot", "-p"]);
                    return o.exit_code === 0 ? t("Powering off...") : o.stderr || t("Issued shutdown.");
                  }), true)}
                {btn("screenshot", <Camera size={15} />, t("Screenshot"), t("Capture screen to disk"), () =>
                  run("screenshot", "Screenshot", async (s) => {
                    const p = await api.screenshotTake(s, "/home/mat/Pictures");
                    return t("Saved: {p}", { p });
                  }))}
                {btn("record", <Video size={15} />, t("Screen Record"), t("Open recording tool"), () => onNavigate("record"))}
              </div>
            </div>
          </div>

          {/* ---- APPS ---- */}
          <div className="panel">
            <div className="panel-head">
              <div className="t"><Package size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("APPS")}</div>
              <span className="sub">{t("TARGET PACKAGE REQUIRED")}</span>
            </div>
            <div className="panel-body">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <input
                  style={{ flex: 1, minWidth: 220, padding: "6px 9px" }}
                  placeholder={t("com.example.package")}
                  value={pkg}
                  onChange={(e) => setPkg(e.target.value)}
                />
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("pkginfo", "Package Info", async (s, p) => {
                    const d = await api.packageDetail(s, p);
                    return `versionName: ${d.versionName}\nversionCode: ${d.versionCode}\nuid: ${d.uid}\nsystem: ${d.isSystem}\ndisabled: ${d.disabled}\ncodePath: ${d.codePath}`;
                  })}>
                  <Info size={12} /> {t("Info")}
                </button>
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("launch", "Launch App", async (s, p) => {
                    await api.packageAction(s, p, "launch");
                    return t("Launched.");
                  })}>
                  <Play size={12} /> {t("Launch")}
                </button>
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("stop", "Force Stop", async (s, p) => {
                    await api.packageAction(s, p, "stop");
                    return t("Stopped.");
                  })}>
                  <Square size={12} /> {t("Force Stop")}
                </button>
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("clear", "Clear Data", async (s, p) => {
                    await api.packageAction(s, p, "clearData");
                    return t("Data cleared.");
                  })}>
                  <Trash2 size={12} /> {t("Clear Data")}
                </button>
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("disable", "Disable", async (s, p) => {
                    await api.packageAction(s, p, "disable", true);
                    return t("Disabled for user 0.");
                  })}>
                  {t("Disable")}
                </button>
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("enable", "Enable", async (s, p) => {
                    await api.packageAction(s, p, "enable", true);
                    return t("Enabled.");
                  })}>
                  {t("Enable")}
                </button>
                <button className="btn btn-danger" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("uninstall", "Uninstall", async (s, p) => {
                    await api.packageAction(s, p, "uninstall", true);
                    return t("Uninstalled.");
                  })}>
                  {t("Uninstall")}
                </button>
                <button className="btn" disabled={!pkg.trim() || busy !== null}
                  onClick={() => void runPkg("extract", "Extract APK", async (s, p) => {
                    const files = await api.packageExport(s, p, "/home/mat/Downloads/extracted");
                    return files.join("\n");
                  })}>
                  <FileDown size={12} /> {t("Extract APK")}
                </button>
                <button className="btn" disabled={busy !== null || !serial} onClick={() => onNavigate("apps")}>
                  <FolderOpen size={12} /> {t("App Manager")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ flex: 1, minWidth: 220, padding: "6px 9px" }}
                  placeholder={t("/path/to/app.apk (local)")}
                  value={apkPath}
                  onChange={(e) => setApkPath(e.target.value)}
                />
                <button className="btn btn-neon" disabled={!apkPath.trim() || busy !== null} onClick={() => void installApk()}>
                  <FileBox size={12} /> {t("Install APK")}
                </button>
              </div>
            </div>
          </div>

          {/* ---- FILES ---- */}
          <div className="panel">
            <div className="panel-head">
              <div className="t"><FileUp size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("FILES")}</div>
              <span className="sub">{t("PUSH · PULL · MANAGE")}</span>
            </div>
            <div className="panel-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <input style={{ padding: "6px 9px" }} placeholder={t("Local path (host)")} value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)} />
                <input style={{ padding: "6px 9px" }} placeholder={t("Remote path (device)")} value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button className="btn" disabled={!localPath || !remotePath || busy !== null}
                  onClick={() => void runFiles("push", "Push", async (s) => {
                    const dest = await api.fsUpload(s, localPath, remotePath);
                    return t("Pushed → {t}", { t: dest });
                  })}>
                  <FileUp size={12} /> {t("Push")}
                </button>
                <button className="btn" disabled={!localPath || !remotePath || busy !== null}
                  onClick={() => void runFiles("pull", "Pull", async (s) => {
                    const dest = await api.fsDownload(s, remotePath, localPath);
                    return t("Pulled → {t}", { t: dest });
                  })}>
                  <FileDown size={12} /> {t("Pull")}
                </button>
                <button className="btn" disabled={!remotePath || busy !== null}
                  onClick={() => void runFiles("delete", "Delete", async (s) => {
                    await api.fsDelete(s, remotePath);
                    return t("Deleted.");
                  })}>
                  <Trash2 size={12} /> {t("Delete")}
                </button>
                <button className="btn" disabled={!remotePath || !renameTo || busy !== null}
                  onClick={() => void runFiles("rename", "Rename", async (s) => {
                    await api.fsRename(s, remotePath, renameTo);
                    return t("Renamed → {t}", { t: renameTo });
                  })}>
                  {t("Rename")}
                </button>
                <button className="btn" disabled={!remotePath || busy !== null}
                  onClick={() => void runFiles("mkdir", "Create Folder", async (s) => {
                    await api.fsMkdir(s, remotePath);
                    return t("Created.");
                  })}>
                  <FolderPlus size={12} /> {t("Create Folder")}
                </button>
                <button className="btn" disabled={busy !== null} onClick={() => onNavigate("files")}>
                  <FolderOpen size={12} /> {t("File Manager")}
                </button>
              </div>
              <input style={{ padding: "6px 9px", width: "100%" }} placeholder={t("Rename target path")}
                value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
            </div>
          </div>

          {/* ---- OUTPUT ---- */}
          <div className="panel">
            <div className="panel-head">
              <div className="t"><Loader size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("COMMAND OUTPUT")}</div>
              <span className="sub">{ops.length} {t("ENTRIES")}</span>
            </div>
            <div className="panel-body" style={{ maxHeight: 320, overflowY: "auto" }}>
              {ops.length === 0 && <div className="empty">{t("NO OUTPUT YET — RUN A TOOL")}</div>}
              {ops.map((o, i) => (
                <div key={i} className="comp-row" style={{ gridTemplateColumns: "140px 60px 1fr" }}>
                  <span className="pkg">{o.label}</span>
                  <span className={`st ${o.ok ? "ACTIVE" : "DISABLED"}`}>{o.ok ? t("OK") : t("FAIL")}</span>
                  <span className="term-out" style={{ marginTop: 0 }}>{o.output}</span>
                </div>
              ))}
              {busy && <div className="scan"><span className="blink" /> {t("EXECUTING…")}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
