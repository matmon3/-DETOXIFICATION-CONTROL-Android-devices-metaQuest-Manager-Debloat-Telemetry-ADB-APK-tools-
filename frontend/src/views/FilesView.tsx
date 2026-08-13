import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronRight,
  File,
  Folder,
  FolderPlus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import type { AqmError, Device, FsEntry } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { log } from "../appLog";
import { useTransfers } from "../hooks/useTransfers";
import { useI18n } from "../hooks/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Props {
  devices: Device[];
}

type Err = AqmError;

const ROOTS = [
  { label: "Internal storage", path: "/sdcard" },
  { label: "Download", path: "/sdcard/Download" },
  { label: "DCIM", path: "/sdcard/DCIM" },
  { label: "Pictures", path: "/sdcard/Pictures" },
  { label: "Movies", path: "/sdcard/Movies" },
  { label: "Android/data", path: "/sdcard/Android/data" },
  { label: "Root", path: "/" },
];

const sizeHuman = (n: number) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
};

const fmtMtime = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
};

function normalize(p: string): string {
  const segs = p.split("/").filter((s) => s && s !== ".");
  const out: string[] = [];
  for (const s of segs) {
    if (s === "..") out.pop();
    else out.push(s);
  }
  return "/" + out.join("/");
}

export function FilesView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const [path, setPath] = useState<string>("/sdcard");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Err | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    title: string;
    body: React.ReactNode;
    label: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<FsEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const { items, track } = useTransfers();

  useEffect(() => {
    if (!serial && connected.length > 0) {
      setSerial(connected[0].serial);
    }
  }, [connected, serial]);

  const load = useCallback(
    async (target?: string) => {
      const p = target ?? path;
      if (!serial) return;
      setLoading(true);
      setError(null);
      try {
        const list = await api.fsList(serial, p);
        setEntries(list);
        setSelected(new Set());
        setPath(p);
        log("INFO", `fs list ${p}: ${list.length} entries`);
      } catch (e) {
        const err = toError(e);
        setError(err);
        log("ERROR", `fs list ${p} failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [serial, path],
  );

  useEffect(() => {
    if (serial) void load();
  }, [serial, load]);

  const openEntry = (e: FsEntry) => {
    if (e.isDir) void load(e.path);
  };

  const doUpload = async (files: string[], target?: string) => {
    const dest = target ?? path;
    if (!serial) return;
    setError(null);
    try {
      for (const f of files) {
        const token = await api.fsUpload(serial, f, dest);
        track(token, `↑ ${f.split("/").pop()} → ${dest}`);
      }
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `upload failed: ${err.message}`);
    }
  };

  const pickUpload = async () => {
    try {
      const picked = await open({ multiple: true, title: t("Upload files") });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      if (paths.length) await doUpload(paths);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `upload picker: ${err.message}`);
    }
  };

  const download = async (e: FsEntry) => {
    try {
      const dest = await save({
        title: t("Download {name}", { name: e.name }),
        defaultPath: e.name,
      });
      if (!dest) return;
      const token = await api.fsDownload(serial, e.path, dest);
      track(token, `↓ ${e.name}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `download failed: ${err.message}`);
    }
  };

  const downloadSelected = async () => {
    const items = entries.filter((e) => selected.has(e.name) && !e.isDir);
    for (const e of items) await download(e);
  };

  const mkdir = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.fsMkdir(serial, `${path.replace(/\/$/, "")}/${name}`);
      setNewName("");
      log("INFO", `mkdir ${path}/${name}`);
      void load();
    } catch (e) {
      const err = toError(e);
      setError(err);
    }
  };

  const touch = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.fsTouch(serial, `${path.replace(/\/$/, "")}/${name}`);
      setNewName("");
      void load();
    } catch (e) {
      const err = toError(e);
      setError(err);
    }
  };

  const doDelete = (targets: FsEntry[]) => {
    const names = targets.map((t) => t.name);
    setConfirm({
      title: t("Delete {n} item{s}?", { n: targets.length, s: targets.length > 1 ? "s" : "" }),
      body: (
        <>
          <div className="modal-code">
            {names.slice(0, 5).map((n) => (
              <div key={n}>{n}</div>
            ))}
            {names.length > 5 && <div className="dim">{t("… and {n} more", { n: names.length - 5 })}</div>}
          </div>
          <p className="kv-note">{t("Deletion is recursive and permanent.")}</p>
        </>
      ),
      label: t("Delete"),
      danger: true,
      run: () => {
        setConfirm(null);
        void Promise.all(
          targets.map((t) => api.fsDelete(serial, t.path)),
        ).then(() => {
          log("INFO", `deleted ${targets.length} item(s)`);
          void load();
        });
      },
    });
  };

  const doRename = () => {
    if (!renameTarget) return;
    const to = `${renameTarget.parent.replace(/\/$/, "")}/${renameValue.trim()}`;
    if (renameValue.trim() && to !== renameTarget.path) {
      void api
        .fsRename(serial, renameTarget.path, to)
        .then(() => {
          log("INFO", `renamed ${renameTarget.name} → ${renameValue.trim()}`);
          void load();
        })
        .catch((e) => setError(toError(e)));
    }
    setRenameTarget(null);
  };

  const breadcrumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    const crumbs = [{ label: "/", path: "/" }];
    let acc = "";
    for (const p of parts) {
      acc += "/" + p;
      crumbs.push({ label: p, path: acc });
    }
    return crumbs;
  }, [path]);

  const onDropFiles = (files: string[]) => {
    if (files.length) void doUpload(files);
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
          <div>{t("DROP TO UPLOAD TO {path}", { path })}</div>
        </div>
      )}

      <div className="page-header">
        <div className="titles">
          <h1>{t("File Manager")}</h1>
          <div className="crumb">{t("DEVICE FILESYSTEM / {path}", { path })}</div>
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
          <button className="btn" onClick={() => void load()} disabled={loading || !serial}>
            <RefreshCw size={13} className="icon" />
            {t("Refresh")}
          </button>
          <button className="btn btn-primary" onClick={() => void pickUpload()} disabled={!serial}>
            <ArrowUpToLine size={13} className="icon" />
            {t("Upload")}
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
        <div className="panel-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="crumbs">
            {breadcrumbs.map((c, i) => (
              <span key={c.path} className="crumb-item">
                {i > 0 && <ChevronRight size={10} className="faint" />}
                <button className="crumb-btn" onClick={() => void load(c.path)}>
                  {c.label}
                </button>
              </span>
            ))}
          </div>
          <div className="actions" style={{ gap: 6 }}>
            {ROOTS.map((r) => (
              <button
                key={r.path}
                className={`chip ${path === r.path ? "chip-on" : ""}`}
                onClick={() => void load(r.path)}
              >
                {r.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-head" style={{ flexWrap: "wrap", gap: 8, borderTop: "1px solid var(--border)" }}>
          <span className="up faint" style={{ fontSize: 10 }}>
            {t("NEW ITEM")}
          </span>
          <input
            className="search-input"
            style={{ width: 200 }}
            placeholder={t("name…")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void mkdir();
            }}
          />
          <button className="btn" onClick={() => void mkdir()} disabled={!newName.trim()}>
            <FolderPlus size={12} className="icon" /> {t("Folder")}
          </button>
          <button className="btn" onClick={() => void touch()} disabled={!newName.trim()}>
            <File size={12} className="icon" /> {t("File")}
          </button>
          {selected.size > 0 && (
            <>
              <button className="btn" onClick={() => void downloadSelected()}>
                <ArrowDownToLine size={12} className="icon" /> {t("Download {n}", { n: selected.size })}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => doDelete(entries.filter((e) => selected.has(e.name)))}
              >
                <Trash2 size={12} className="icon" /> {t("Delete")}
              </button>
            </>
          )}
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="scan" style={{ padding: 24 }}>
              <span className="blink" /> {t("LISTING {path}…", { path })}
            </div>
          ) : entries.length === 0 ? (
            <div className="empty">{t("EMPTY DIRECTORY")}</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 26 }} />
                  <th>{t("NAME")}</th>
                  <th>{t("SIZE")}</th>
                  <th>{t("PERMS")}</th>
                  <th>{t("MODIFIED")}</th>
                  <th>{t("ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.path}
                    className={`clickable ${selected.has(e.name) ? "selected" : ""}`}
                    onDoubleClick={() => openEntry(e)}
                    onClick={(ev) => {
                      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(e.name)) next.delete(e.name);
                          else next.add(e.name);
                          return next;
                        });
                      }
                    }}
                  >
                    <td>
                      {e.isDir ? (
                        <Folder size={13} className="icon faint" />
                      ) : (
                        <File size={13} className="icon faint" />
                      )}
                    </td>
                    <td>
                      <div className="pkg-cell">
                        {e.name}
                        {e.isSymlink && <span className="badge yellow">{t("LINK")}</span>}
                      </div>
                    </td>
                    <td>{e.isDir ? "—" : sizeHuman(e.size)}</td>
                    <td className="faint">{e.perms}</td>
                    <td className="faint">{fmtMtime(e.mtime)}</td>
                    <td>
                      <div className="row-actions">
                        {!e.isDir && (
                          <button className="icon-btn" title={t("Download")} onClick={() => void download(e)}>
                            <ArrowDownToLine size={12} />
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          title={t("Rename")}
                          onClick={() => {
                            setRenameTarget(e);
                            setRenameValue(e.name);
                          }}
                        >
                          <span className="edit-glyph">⤢</span>
                        </button>
                        <button className="icon-btn danger" title={t("Delete")} onClick={() => doDelete([e])}>
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
              {x.done && !x.done.ok && x.done.detail && (
                <div className="faint transfer-msg">{x.done.detail}</div>
              )}
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

      {renameTarget && (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t("RENAME")}</span>
            </div>
            <div className="modal-body">
              <input
                className="search-input"
                style={{ width: "100%" }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doRename();
                }}
                autoFocus
              />
              <div className="faint" style={{ marginTop: 6, fontSize: 11 }}>
                {normalize(renameTarget.path)}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setRenameTarget(null)}>
                {t("Cancel")}
              </button>
              <button className="btn btn-primary" onClick={doRename} disabled={!renameValue.trim()}>
                {t("Rename")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
