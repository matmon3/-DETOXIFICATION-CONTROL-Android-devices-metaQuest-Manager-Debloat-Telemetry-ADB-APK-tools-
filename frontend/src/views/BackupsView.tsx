import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  FolderOpen,
  Package,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import type { AqmError, AppInfo, BackupEntry, Device } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

export function BackupsView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);

  const [baseDir, setBaseDir] = useState<string>("");
  const [includeApk, setIncludeApk] = useState(true);
  const [includeData, setIncludeData] = useState(false);

  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadBackups = async () => {
    if (!baseDir) return;
    setBusy("list");
    setError(null);
    try {
      const list = await api.backupList(baseDir);
      setEntries(list);
      log("INFO", `backup list: ${list.length} entries`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `backup list failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDir]);

  const loadApps = async () => {
    if (!serial) return;
    setAppsLoading(true);
    setError(null);
    try {
      const list = await api.packagesList(serial, true);
      setApps(list.filter((a) => !a.isSystem));
      setSelected(new Set());
      log("INFO", `backup apps loaded: ${list.length}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `backup apps failed: ${err.message}`);
    } finally {
      setAppsLoading(false);
    }
  };

  const toggle = (pkg: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((a) => a.package)),
    );
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return apps.filter((a) => (q ? a.package.toLowerCase().includes(q) : true));
  }, [apps, search]);

  const pickDir = async () => {
    const d = await open({ directory: true, title: t("Backup directory") });
    if (!d) return;
    setBaseDir(typeof d === "string" ? d : d[0]);
  };

  const createBackup = async () => {
    if (!serial || !baseDir) {
      setError({
        message: t("Select a device and a backup directory."),
        detail: t("Pick the destination folder with the folder button above."),
      });
      return;
    }
    if (selected.size === 0) {
      setError({ message: t("Select at least one app to back up.") });
      return;
    }
    setBusy("create");
    setError(null);
    setNote(null);
    try {
      const pkgs = Array.from(selected);
      const res = await api.backupCreate(serial, pkgs, baseDir, includeApk, includeData);
      setNote(
        t("Backup created: {t} — {n} APK{s}{d}", {
          t: res.timestamp,
          n: res.apkCount,
          s: res.apkCount === 1 ? "" : "s",
          d: res.dataDirs.length ? `, ${res.dataDirs.length} ${t("+data")}` : "",
        }),
      );
      log("INFO", `backup created: ${res.dir}`);
      void loadBackups();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `backup failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (entry: BackupEntry) => {
    if (!serial) {
      setError({ message: t("Connect a device to restore.") });
      return;
    }
    setBusy(`restore:${entry.name}`);
    setError(null);
    setNote(null);
    try {
      const done = await api.backupRestore(serial, entry.dir, undefined);
      setNote(t("Restored {n} package{s} to {t}.", { n: done.length, s: done.length === 1 ? "" : "s", t: serial }));
      log("INFO", `backup restored from ${entry.name}: ${done.join(", ")}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `restore failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Backups")}</h1>
          <div className="crumb">{t("APK + DATA ARCHIVE / RESTORE")}</div>
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
          <button className="btn btn-ghost" onClick={() => void pickDir()} title={t("Backup directory")}>
            <FolderOpen size={13} className="icon" />
            {baseDir ? t("Change Dir") : t("Backup Dir")}
          </button>
          <button className="btn btn-primary" onClick={() => void createBackup()} disabled={busy !== null || selected.size === 0}>
            <Save size={13} className="icon" />
            {busy === "create" ? t("Backing up") : t("Create Backup")}
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
        {/* ---- Seleção de apps ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t">
              <Package size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("SELECT APPS")}
            </div>
            <div className="actions" style={{ gap: 6 }}>
              <span className="sub">{selected.size} {t("SELECTED")}</span>
              <button className="btn btn-ghost" onClick={() => void loadApps()} disabled={appsLoading || !serial}>
                <RefreshCw size={13} className="icon" />
                {appsLoading ? t("Loading") : t("Load")}
              </button>
            </div>
          </div>
          <div className="panel-body">
            <label className="opt-row">
              <input type="checkbox" checked={includeApk} onChange={(e) => setIncludeApk(e.target.checked)} />
              {t("Include APK files")}
            </label>
            <label className="opt-row">
              <input type="checkbox" checked={includeData} onChange={(e) => setIncludeData(e.target.checked)} />
              {t("Include app data (root / debuggable)")}
            </label>
            <input
              className="search-input"
              style={{ width: "100%", boxSizing: "border-box", margin: "8px 0" }}
              placeholder={t("filter packages…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="app-select">
              {appsLoading && apps.length === 0 ? (
                <div className="scan"><span className="blink" /> {t("READING PACKAGES…")}</div>
              ) : filtered.length === 0 ? (
                <div className="empty">
                  {apps.length === 0 ? t("LOAD APPS TO BACK UP") : t("NO MATCHES")}
                </div>
              ) : (
                <>
                  <div className="app-select-row head">
                    <span>
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                    </span>
                    <span>{t("PACKAGE")}</span>
                    <span>{t("VERSION")}</span>
                  </div>
                  {filtered.map((a) => (
                    <div key={a.package} className={`app-select-row ${selected.has(a.package) ? "selected" : ""}`}>
                      <span>
                        <input type="checkbox" checked={selected.has(a.package)} onChange={() => toggle(a.package)} />
                      </span>
                      <span className="pkg">{a.package}</span>
                      <span className="faint">{a.versionName}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ---- Backups existentes ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t">
              <Archive size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("ARCHIVES")}
            </div>
            <button className="btn btn-ghost" onClick={() => void loadBackups()} disabled={busy === "list" || !baseDir}>
              <RefreshCw size={13} className="icon" />
              {t("Refresh")}
            </button>
          </div>
          <div className="panel-body">
            {!baseDir && (
              <div className="empty">{t("SELECT A BACKUP DIRECTORY TO LIST ARCHIVES")}</div>
            )}
            {baseDir && entries.length === 0 && (
              <div className="empty">{t("NO BACKUPS FOUND IN THIS DIRECTORY")}</div>
            )}
            {entries.map((e) => (
              <div className="dev-row" key={e.dir}>
                <div className="row-icon">
                  <Archive size={14} style={{ color: "var(--purple-neon)" }} />
                </div>
                <div className="row-main">
                  <div className="row-title">{e.name}</div>
                  <div className="row-sub">
                    {e.serial} · {e.packageCount} {t("pkg")} · {e.apkCount} APK
                    {e.hasData ? ` · ${t("+data")}` : ""}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={busy !== null || !serial}
                  onClick={() => void restore(e)}
                  title={t("Restore APKs to the selected device")}
                >
                  <RotateCcw size={13} className="icon" />
                  {t("Restore")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
