import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Download,
  Info,
  Package,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ApkInfo, AqmError, AppInfo, Device, PackageDetail } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { log } from "../appLog";
import { useTransfers } from "../hooks/useTransfers";
import { useI18n } from "../hooks/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Props {
  devices: Device[];
}

type Filter = "all" | "system" | "user" | "disabled" | "enabled" | "quest" | "large";

type Err = AqmError;

const sizeHuman = (n: number) => {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
};

const isQuestPkg = (p: string) =>
  /^com\.oculus\.|^com\.oculusvr\.|^com\.meta\.|^com\.facebook\.oculus/.test(p) ||
  p.includes("horizon");

export function AppsView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  useEffect(() => {
    if (!serial && connected.length > 0) setSerial(connected[0].serial);
  }, [connected, serial]);

  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Err | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailPkg, setDetailPkg] = useState<string | null>(null);
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [analyzePath, setAnalyzePath] = useState<string | null>(null);
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: React.ReactNode;
    label: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const { items, track } = useTransfers();

  const load = useCallback(
    async (force = false) => {
      if (!serial) return;
      setLoading(true);
      setError(null);
      try {
        const list = await api.packagesList(serial, force);
        setApps(list);
        setSelected(new Set());
        log("INFO", `packages: ${list.length} loaded (${serial})`);
      } catch (e) {
        const err = toError(e);
        setError(err);
        log("ERROR", `packages load failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [serial],
  );

  useEffect(() => {
    if (serial) void load();
  }, [serial, load]);

  const runAction = useCallback(
    async (pkg: string, action: "launch" | "stop" | "clearData" | "clearCache" | "disable" | "enable" | "uninstall" | "openSettings") => {
      try {
        await api.packageAction(serial, pkg, action, false);
        log("INFO", `action ${action} on ${pkg} ok`);
        if (action === "disable" || action === "enable" || action === "clearData" || action === "uninstall") {
          void load(true);
        }
      } catch (e) {
        const err = toError(e);
        setError(err);
        log("ERROR", `action ${action} on ${pkg} failed: ${err.message}`);
      }
    },
    [serial, load],
  );

  const installApks = useCallback(
    async (paths: string[]) => {
      if (!serial || paths.length === 0) return;
      setError(null);
      try {
        const token = await api.packageInstall(serial, paths, true, false);
        track(token, `${paths.length} APK${paths.length > 1 ? "s" : ""} → ${serial}`);
      } catch (e) {
        const err = toError(e);
        setError(err);
        log("ERROR", `install start failed: ${err.message}`);
      }
    },
    [serial, track],
  );

  const pickApks = async () => {
    try {
      const picked = await open({
        multiple: true,
        title: t("Select APK files"),
        filters: [{ name: "Android Package", extensions: ["apk", "aab"] }],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      if (paths.length === 1) {
        await analyze(paths[0]);
      } else if (paths.length > 0) {
        await installApks(paths);
      }
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `file picker: ${err.message}`);
    }
  };

  const analyze = async (path: string) => {
    setApkInfo(null);
    setAnalyzePath(path);
    try {
      const info = await api.apkAnalyze(path);
      setApkInfo(info);
      log("INFO", `analyzed ${info.fileName} (${info.package})`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      setAnalyzePath(null);
      log("ERROR", `analyze failed: ${err.message}`);
    }
  };

  const exportApk = async (pkg: string) => {
    try {
      const dest = await open({
        directory: true,
        title: t("Export APK of {pkg}", { pkg }),
      });
      if (!dest) return;
      const files = await api.packageExport(serial, pkg, dest);
      log("INFO", `exported ${pkg}: ${files.join(", ")}`);
      setError(null);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `export ${pkg} failed: ${err.message}`);
    }
  };

  const openDetail = async (pkg: string) => {
    setDetailPkg(pkg);
    setDetail(null);
    try {
      const d = await api.packageDetail(serial, pkg);
      setDetail(d);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `detail ${pkg} failed: ${err.message}`);
    }
  };

  const filtered = useMemo(() => {
    let list = apps;
    switch (filter) {
      case "system":
        list = list.filter((a) => a.isSystem);
        break;
      case "user":
        list = list.filter((a) => !a.isSystem);
        break;
      case "disabled":
        list = list.filter((a) => a.disabled);
        break;
      case "enabled":
        list = list.filter((a) => !a.disabled);
        break;
      case "quest":
        list = list.filter((a) => isQuestPkg(a.package));
        break;
      case "large":
        list = list.filter((a) => a.sizeBytes > 50 * 1024 * 1024);
        break;
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) => a.package.toLowerCase().includes(q) || a.versionName.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => a.package.localeCompare(b.package));
  }, [apps, filter, search]);

  const toggle = (pkg: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSel = filtered.every((a) => next.has(a.package));
      if (allSel) filtered.forEach((a) => next.delete(a.package));
      else filtered.forEach((a) => next.add(a.package));
      return next;
    });
  };

  const batchUninstall = () => {
    const pkgs = Array.from(selected);
    setConfirm({
      title: t("Uninstall {n} app{s}?", { n: pkgs.length, s: pkgs.length > 1 ? "s" : "" }),
      body: (
        <>
          <div className="modal-code">
            {pkgs.slice(0, 5).map((p) => (
              <div key={p}>{p}</div>
            ))}
            {pkgs.length > 5 && <div className="dim">{t("… and {n} more", { n: pkgs.length - 5 })}</div>}
          </div>
          <p className="kv-note">
            {t("This removes the app for the current user. Data is deleted. This cannot be undone.")}
          </p>
        </>
      ),
      label: t("Uninstall"),
      danger: true,
      run: () => {
        setConfirm(null);
        void Promise.all(pkgs.map((p) => api.packageAction(serial, p, "uninstall", false))).then(
          () => {
            log("INFO", `batch uninstall: ${pkgs.length} apps`);
            setSelected(new Set());
            void load(true);
          },
        );
      },
    });
  };

  const confirmAction = (
    pkg: string,
    action: "clearData" | "uninstall",
    display: string,
  ) => {
    setConfirm({
      title: t(action === "uninstall" ? "Uninstall {pkg}?" : "Clear data {pkg}?", { pkg }),
      body:
        action === "uninstall" ? (
          <>
            <p>
              {t("This removes the app for the current user. It does not physically remove the system APK.")}
            </p>
            <p className="kv-note">
              {(() => {
                const [pre, post] = t(
                  "For system apps this is equivalent to {cmd} and the app can be reinstalled later.",
                  { cmd: "\u0000" },
                ).split("\u0000");
                return (
                  <>
                    {pre}
                    <span className="mono">pm uninstall --user 0</span>
                    {post}
                  </>
                );
              })()}
            </p>
          </>
        ) : (
          <p>{t("This permanently deletes the app's data (settings, accounts, cache). It cannot be undone.")}</p>
        ),
      label: display,
      danger: true,
      run: () => {
        setConfirm(null);
        void runAction(pkg, action);
      },
    });
  };

  const onDropFiles = (files: string[]) => {
    const apks = files.filter((f) => /\.(apk|aab)$/i.test(f));
    if (apks.length > 0) {
      void installApks(apks);
    } else if (files.length === 1) {
      setError({
        message: t("Not an APK"),
        detail: t("Drag-and-drop accepts .apk files. Use the File Manager for generic transfers."),
      });
    }
  };

  return (
    <div
      className="content"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        setDragOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        if (--dragDepth.current <= 0) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []).map((f) => (f as File & { path?: string }).path ?? f.name);
        if (files.length) onDropFiles(files);
      }}
    >
      {dragOver && (
        <div className="drop-overlay">
          <Upload size={28} />
          <div>{t("DROP APK TO INSTALL")}</div>
        </div>
      )}

      <div className="page-header">
        <div className="titles">
          <h1>{t("Installed Apps")}</h1>
          <div className="crumb">{t("PACKAGE MANAGER / {n} PACKAGES", { n: apps.length })}</div>
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
          <button className="btn" onClick={() => void load(true)} disabled={loading || !serial}>
            <RefreshCw size={13} className="icon" />
            {loading ? t("Loading") : t("Refresh")}
          </button>
          <button className="btn btn-primary" onClick={() => void pickApks()} disabled={!serial}>
            <Download size={13} className="icon" />
            {t("Install APK")}
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
          <span className="t">
            {t("PACKAGE")} <span className="accent">{t("REGISTRY")}</span>
          </span>
          <div className="actions" style={{ gap: 6 }}>
            {(["all", "system", "user", "disabled", "enabled", "quest", "large"] as Filter[]).map(
              (f) => (
                <button key={f} className={`chip ${filter === f ? "chip-on" : ""}`} onClick={() => setFilter(f)}>
                  {t(f.toUpperCase())}
                </button>
              ),
            )}
            <input
              className="search-input"
              placeholder={t("filter…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loading && apps.length === 0 ? (
            <div className="scan" style={{ padding: 24 }}>
              <span className="blink" /> {t("READING PACKAGE REGISTRY…")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              {apps.length === 0 ? t("NO DEVICE / NO PACKAGES") : t("NO MATCHES")}
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 26 }}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                  <th>{t("PACKAGE")}</th>
                  <th>{t("VERSION")}</th>
                  <th>{t("SIZE")}</th>
                  <th>{t("MIN/TARGET SDK")}</th>
                  <th>{t("STATUS")}</th>
                  <th>{t("ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.package} className={selected.has(a.package) ? "selected" : ""}>
                    <td>
                      <input type="checkbox" checked={selected.has(a.package)} onChange={() => toggle(a.package)} />
                    </td>
                    <td>
                      <div className="pkg-cell">
                        {a.package}
                        {a.isSystem && <span className="badge">{t("SYSTEM")}</span>}
                        {a.disabled && <span className="badge red">{t("DISABLED")}</span>}
                      </div>
                      <div className="faint pkg-sub">{a.codePath}</div>
                    </td>
                    <td>
                      {a.versionName}
                      <div className="faint">vc {a.versionCode ?? "?"}</div>
                    </td>
                    <td>{sizeHuman(a.sizeBytes)}</td>
                    <td className="faint">
                      {a.minSdk ?? "?"}/{a.targetSdk ?? "?"}
                    </td>
                    <td>
                      {a.disabled ? (
                        <button className="chip" onClick={() => void runAction(a.package, "enable")}>
                          {t("Enable")}
                        </button>
                      ) : (
                        <button className="chip" onClick={() => void runAction(a.package, "disable")}>
                          {t("Disable")}
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" title={t("Launch")} onClick={() => void runAction(a.package, "launch")}>
                          <Play size={12} />
                        </button>
                        <button className="icon-btn" title={t("Info")} onClick={() => void openDetail(a.package)}>
                          <Info size={12} />
                        </button>
                        <button className="icon-btn" title={t("Export APK")} onClick={() => void exportApk(a.package)}>
                          <Package size={12} />
                        </button>
                        <button className="icon-btn danger" title={t("Uninstall")} onClick={() => confirmAction(a.package, "uninstall", t("Uninstall"))}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="batch-bar">
          <span>
            {t("SELECTED {n}", { n: selected.size })}
          </span>
          <button className="btn btn-danger" onClick={batchUninstall}>
            <Trash2 size={12} className="icon" /> {t("Uninstall")}
          </button>
          <button className="btn" onClick={() => setSelected(new Set())}>
            <X size={12} className="icon" /> {t("Clear")}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="transfer-panel">
          {items.map((x) => (
            <div key={x.token} className={`transfer-item ${x.done ? (x.done.ok ? "ok" : "bad") : ""}`}>
              <div className="transfer-head">
                <span className="up">{x.label}</span>
                {x.done ? (
                  <span className={x.done.ok ? "ok" : "bad"}>{x.done.ok ? t("DONE") : t("FAILED")}</span>
                ) : (
                  <span className="dim">{x.pct != null ? `${x.pct}%` : t("RUNNING")}</span>
                )}
              </div>
              {x.pct != null && !x.done && (
                <div className="bar">
                  <div className="fill" style={{ width: `${x.pct}%` }} />
                </div>
              )}
              {x.done && x.done.detail && <div className="faint transfer-msg">{x.done.detail}</div>}
              {x.line && <div className="faint transfer-msg">{x.line}</div>}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        confirmLabel={confirm?.label ?? t("OK")}
        danger={confirm?.danger}
        onConfirm={confirm?.run ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />

      {detailPkg && (
        <AppDetailModal
          pkg={detailPkg}
          detail={detail}
          onClose={() => setDetailPkg(null)}
          onAction={(a) => {
            setDetailPkg(null);
            void runAction(detailPkg, a);
          }}
        />
      )}

      {analyzePath && (
        <ApkAnalyzeModal
          path={analyzePath}
          info={apkInfo}
          onClose={() => {
            setAnalyzePath(null);
            setApkInfo(null);
          }}
          onInstall={() => {
            const p = analyzePath;
            setAnalyzePath(null);
            setApkInfo(null);
            void installApks([p]);
          }}
        />
      )}
    </div>
  );
}

function AppDetailModal({
  pkg,
  detail,
  onClose,
  onAction,
}: {
  pkg: string;
  detail: PackageDetail | null;
  onClose: () => void;
  onAction: (a: "launch" | "stop" | "clearData" | "disable" | "enable") => void;
}) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{pkg}</span>
          <button className="icon-btn" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
        <div className="modal-body">
          {!detail ? (
            <div className="scan">
              <span className="blink" /> {t("FETCHING DETAILS…")}
            </div>
          ) : (
            <>
              <div className="kv" style={{ gridTemplateColumns: "180px 1fr" }}>
                <span className="k">{t("Version")}</span>
                <span className="v">{detail.versionName} <span className="faint">(vc {detail.versionCode ?? "?"})</span></span>
                <span className="k">{t("UID")}</span>
                <span className="v">{detail.uid ?? "—"}</span>
                <span className="k">{t("SDK")}</span>
                <span className="v">{t("min {a} / target {b}", { a: detail.minSdk ?? "?", b: detail.targetSdk ?? "?" })}</span>
                <span className="k">{t("Installed")}</span>
                <span className="v">{detail.firstInstallTime ?? "—"}</span>
                <span className="k">{t("Updated")}</span>
                <span className="v">{detail.lastUpdateTime ?? "—"}</span>
                <span className="k">{t("ABI")}</span>
                <span className="v">{detail.primaryCpuAbi || "—"}</span>
                <span className="k">{t("Code path")}</span>
                <span className="v">{detail.codePath}</span>
                <span className="k">{t("Data dir")}</span>
                <span className="v">{detail.dataDir}</span>
                <span className="k">{t("Status")}</span>
                <span className="v">
                  {detail.isSystem && <span className="badge" style={{ marginRight: 4 }}>{t("SYSTEM")}</span>}
                  {detail.disabled && <span className="badge red">{t("DISABLED")}</span>}
                </span>
              </div>

              <div className="divider" />
              <div className="up faint" style={{ marginBottom: 6 }}>
                {t("PERMISSIONS ({n})", { n: detail.permissions.length })}
              </div>
              <div className="perm-grid">
                {detail.permissions.map((p) => (
                  <div key={p.name} className={`perm-chip ${p.granted ? "granted" : ""}`}>
                    <span>{p.name.split(".").pop()}</span>
                    {p.granted ? <span className="ok">{t("GRANTED")}</span> : <span className="faint">{t("DENIED")}</span>}
                  </div>
                ))}
              </div>

              <div className="divider" />
              <div className="up faint">{t("COMPONENTS")}</div>
              <div className="comp-grid">
                <CompList title={t("Activities")} items={detail.activities} />
                <CompList title={t("Services")} items={detail.services} />
                <CompList title={t("Receivers")} items={detail.receivers} />
                <CompList title={t("Providers")} items={detail.providers} />
              </div>
            </>
          )}
        </div>
        {detail && (
          <div className="modal-actions">
            <button className="btn" onClick={() => onAction("launch")}>
              <Play size={12} className="icon" /> {t("Launch")}
            </button>
            <button className="btn" onClick={() => onAction("stop")}>
              <Square size={12} className="icon" /> {t("Force Stop")}
            </button>
            <button className="btn btn-danger" onClick={() => onAction("clearData")}>
              {t("Clear Data")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="up faint" style={{ fontSize: 10 }}>
        {title} ({items.length})
      </div>
      <div className="comp-list">
        {items.length === 0 ? (
          <div className="faint">—</div>
        ) : (
          items.slice(0, 8).map((c) => <div key={c}>{c}</div>)
        )}
      </div>
    </div>
  );
}

function ApkAnalyzeModal({
  path,
  info,
  onClose,
  onInstall,
}: {
  path: string;
  info: ApkInfo | null;
  onClose: () => void;
  onInstall: () => void;
}) {
  const { t } = useI18n();
  const archWarn = info && info.abis.length > 0 && !info.abis.some((a) => a.includes("arm64")) && !info.abis.some((a) => a.includes("arm"));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{t("APK ANALYZER")}</span>
          <button className="icon-btn" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
        <div className="modal-body">
          {!info ? (
            <div className="scan">
              <span className="blink" /> {t("ANALYZING {f}…", { f: path.split("/").pop() ?? "" })}
            </div>
          ) : (
            <>
              <div className="kv" style={{ gridTemplateColumns: "180px 1fr" }}>
                <span className="k">{t("File")}</span>
                <span className="v">{info.fileName}</span>
                <span className="k">{t("Size")}</span>
                <span className="v">{sizeHuman(info.fileSize)}</span>
                <span className="k">{t("Package")}</span>
                <span className="v hl">{info.package || "—"}</span>
                <span className="k">{t("Version")}</span>
                <span className="v">{info.versionName || "—"} <span className="faint">(vc {info.versionCode ?? "?"})</span></span>
                <span className="k">{t("SDK")}</span>
                <span className="v">{t("min {a} / target {b}", { a: info.minSdk ?? "?", b: info.targetSdk ?? "?" })}</span>
                <span className="k">{t("ABIs")}</span>
                <span className="v">
                  {info.abis.length === 0 ? t("universal / java-only") : info.abis.join(", ")}
                </span>
                <span className="k">{t("Signature")}</span>
                <span className="v">{info.signature}</span>
              </div>
              {archWarn && (
                <div className="error-box" style={{ marginTop: 10 }}>
                  <div className="msg">✕ {t("POSSIBLE ARCHITECTURE MISMATCH")}</div>
                  <div className="dim">
                    {t("This APK has no ARM64/ARM native libs. It may not run on this device.")}
                  </div>
                </div>
              )}
              <div className="divider" />
              <div className="up faint">{t("PERMISSIONS ({n})", { n: info.permissions.length })}</div>
              <div className="perm-grid" style={{ marginTop: 6 }}>
                {info.permissions.map((p) => (
                  <div key={p} className="perm-chip">
                    {p.split(".").pop()}
                  </div>
                ))}
              </div>
              {info.activities.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="up faint">
                    {t("ACTIVITIES ({n})", { n: info.activities.length })}
                  </div>
                  <div className="comp-list">
                    {info.activities.slice(0, 10).map((a) => (
                      <div key={a}>{a}</div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {info && (
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button className="btn btn-primary" onClick={onInstall} disabled={!info.package}>
              <Download size={12} className="icon" /> {t("Install")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
