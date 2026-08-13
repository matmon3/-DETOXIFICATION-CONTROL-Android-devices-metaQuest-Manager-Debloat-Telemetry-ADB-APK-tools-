import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import type { AqmError, CmdOut, Device, SavedCommand } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { log } from "../appLog";
import { useI18n } from "../hooks/useI18n";
import { DeviceSelect } from "../components/DeviceSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Props {
  devices: Device[];
}

const DEVICES = ["any", "quest", "android"];
const CATEGORIES = ["General", "Optimization", "Debloat", "App", "File", "Network", "Quest", "Shell", "Debug"];
const RISKS = ["LOW", "MEDIUM", "HIGH"];

const empty = (): SavedCommand => ({
  id: "",
  name: "New Command",
  command: "shell getprop",
  device: "any",
  category: "General",
  risk: "LOW",
  favorite: false,
  created: "",
  updated: "",
});

export function CommandLibraryView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(() => devices.filter((d) => d.state === "connected"), [devices]);
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);

  const [list, setList] = useState<SavedCommand[]>([]);
  const [selected, setSelected] = useState<SavedCommand | null>(null);
  const [form, setForm] = useState<SavedCommand | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("ALL");
  const [onlyFav, setOnlyFav] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [output, setOutput] = useState<CmdOut | null>(null);
  const [confirmDel, setConfirmDel] = useState<SavedCommand | null>(null);
  const [json, setJson] = useState("");

  const reload = async () => {
    try {
      const l = await api.cmdlibList();
      setList(l);
      setSelected((s) => (s ? l.find((c) => c.id === s.id) ?? null : null));
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `cmdlib list failed: ${err.message}`);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const patch = (p: Partial<SavedCommand>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async () => {
    if (!form) return;
    setBusy("save");
    setError(null);
    try {
      const saved = await api.cmdlibSave(form);
      setForm(null);
      setEditing(false);
      await reload();
      setSelected(saved);
      log("INFO", `command saved: ${saved.name}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `command save failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleFav = async (c: SavedCommand) => {
    try {
      const updated = await api.cmdlibToggleFavorite(c.id);
      setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
      log("INFO", `favorite ${updated.favorite ? "on" : "off"}: ${updated.name}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `favorite toggle failed: ${err.message}`);
    }
  };

  const duplicate = async (c: SavedCommand) => {
    try {
      const copy = { ...empty(), ...c, id: "", name: `${c.name} (copy)`, favorite: false };
      const saved = await api.cmdlibSave(copy);
      await reload();
      setSelected(saved);
      log("INFO", `command duplicated: ${saved.name}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `command duplicate failed: ${err.message}`);
    }
  };

  const remove = async (c: SavedCommand) => {
    setConfirmDel(null);
    setBusy("del");
    try {
      await api.cmdlibDelete(c.id);
      await reload();
      setSelected(null);
      log("INFO", `command deleted: ${c.name}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `command delete failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const execute = async () => {
    if (!serial || !selected) return;
    setBusy("exec");
    setError(null);
    setOutput(null);
    try {
      const out = await api.cmdlibExecute(serial, selected.id);
      setOutput(out);
      log("INFO", `command executed: ${selected.name} on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      setOutput(null);
      log("ERROR", `command execute failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    try {
      setJson(await api.cmdlibExport());
      log("INFO", "command library exported");
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `export failed: ${err.message}`);
    }
  };

  const doImport = async () => {
    try {
      const n = await api.cmdlibImport(json);
      setJson("");
      await reload();
      log("INFO", `imported ${n} commands`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `import failed: ${err.message}`);
    }
  };

  const filtered = useMemo(() => {
    let l = list;
    if (cat !== "ALL") l = l.filter((c) => c.category === cat);
    if (onlyFav) l = l.filter((c) => c.favorite);
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter((c) => c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q));
    }
    return l;
  }, [list, cat, onlyFav, query]);

  const cats = useMemo(() => {
    const s = new Set<string>();
    list.forEach((c) => s.add(c.category));
    return ["ALL", ...Array.from(s), "Other"];
  }, [list]);

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Command Library")}>{t("Command Library")}</h1>
          <div className="crumb">{t("SAVED ADB COMMANDS — FAVORITES · EXECUTE · SHARE")}</div>
        </div>
        <div className="actions">
          <DeviceSelect devices={devices} serial={serial} onChange={onSelect} />
          <button className="btn btn-neon" onClick={() => { setForm(empty()); setEditing(false); }}>
            <Plus size={13} className="icon" /> {t("New")}
          </button>
          <button className="btn" onClick={() => void doExport()}><Download size={13} className="icon" /> {t("Export")}</button>
          <button className="btn" onClick={() => setJson("[]")}><Upload size={13} className="icon" /> {t("Import")}</button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">✕ {error.message}</div>
          {error.detail && <details><summary>{t("View technical details")}</summary><pre>{error.detail}</pre></details>}
        </div>
      )}

      <div className="cmdlib-grid">
        {/* ---- List ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t"><FolderOpen size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("COMMANDS")}</div>
            <span className="sub">{filtered.length} / {list.length}</span>
          </div>
          <div className="panel-body" style={{ padding: 8 }}>
            <div className="debloat-filters" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", width: "100%", gap: 4 }}>
                <Search size={12} style={{ marginTop: 5, color: "var(--text-faint)" }} />
                <input className="search-input" style={{ flex: 1 }} placeholder={t("search…")} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="search-input" value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: 1 }}>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="filter-chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} style={{ accentColor: "var(--purple)", marginRight: 4 }} />
                <Star size={10} style={{ display: "inline", marginBottom: -1 }} />
              </label>
            </div>
            <div style={{ maxHeight: "58vh", overflowY: "auto" }}>
              {filtered.map((c) => (
                <div key={c.id} className={`cmd-row ${selected?.id === c.id ? "selected" : ""}`} onClick={() => setSelected(c)}>
                  <span className={`fav-star ${c.favorite ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleFav(c); }}>
                    <Star size={13} fill={c.favorite ? "currentColor" : "none"} />
                  </span>
                  <span className="name">{c.name}</span>
                  <span className="cat">{c.category.toUpperCase()}</span>
                </div>
              ))}
              {filtered.length === 0 && <div className="empty">{t("NO COMMANDS FOUND")}</div>}
            </div>
          </div>
        </div>

        {/* ---- Detail / edit ---- */}
        <div>
          {form ? (
            <div className="panel">
              <div className="panel-head">
                <div className="t"><Plus size={12} className="icon" style={{ color: "var(--purple)" }} /> {editing ? t("EDIT COMMAND") : t("NEW COMMAND")}</div>
                <span className="sub">{t("SHLEX PARSED — NEVER RUN VIA SHELL")}</span>
              </div>
              <div className="panel-body">
                <div className="theme-field">
                  <span className="k">{t("Name")}</span>
                  <input style={{ padding: "4px 8px", width: "100%" }} value={form.name} onChange={(e) => patch({ name: e.target.value })} />
                  <span className="num" />
                </div>
                <div className="theme-field">
                  <span className="k">{t("Command")}</span>
                  <textarea style={{ width: "100%", minHeight: 90, padding: 6, fontSize: 11.5 }} value={form.command}
                    onChange={(e) => patch({ command: e.target.value })}
                    placeholder={t("shell pm disable-user --user 0 com.example")} />
                  <span className="num" />
                </div>
                <div className="theme-field">
                  <span className="k">{t("Device")}</span>
                  <select style={{ flex: 1, padding: "4px 8px" }} value={form.device} onChange={(e) => patch({ device: e.target.value })}>
                    {DEVICES.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                  </select>
                  <span className="num" />
                </div>
                <div className="theme-field">
                  <span className="k">{t("Category")}</span>
                  <select style={{ flex: 1, padding: "4px 8px" }} value={form.category} onChange={(e) => patch({ category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="num" />
                </div>
                <div className="theme-field">
                  <span className="k">{t("Risk")}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {RISKS.map((r) => (
                      <button key={r} className={`filter-chip ${form.risk === r ? "active" : ""}`} onClick={() => patch({ risk: r })}>{r}</button>
                    ))}
                  </div>
                  <span className="num" />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                  <button className="btn" onClick={() => { setForm(null); setEditing(false); }}>{t("Cancel")}</button>
                  <button className="btn btn-neon" disabled={busy !== null || !form.name.trim() || !form.command.trim()} onClick={() => void save()}>
                    {editing ? t("Save Changes") : t("Save Command")}
                  </button>
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="panel">
              <div className="panel-head">
                <div className="t"><ExternalLink size={12} className="icon" style={{ color: "var(--purple)" }} /> {selected.name.toUpperCase()}</div>
                <span className="sub"><span className={`risk-badge ${selected.risk}`}>{selected.risk}</span></span>
              </div>
              <div className="panel-body">
                <div className="kv" style={{ gridTemplateColumns: "90px 1fr" }}>
                  <div className="k">{t("Device")}</div><div className="v">{selected.device.toUpperCase()}</div>
                  <div className="k">{t("Category")}</div><div className="v">{selected.category}</div>
                  <div className="k">{t("Created")}</div><div className="v">{selected.created}</div>
                  <div className="k">{t("Updated")}</div><div className="v">{selected.updated}</div>
                </div>
                <div className="term-out" style={{ marginTop: 10 }}>adb {selected.command}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button className="btn btn-neon" disabled={busy !== null || !serial} onClick={() => void execute()}>
                    <Loader size={12} className="icon" /> {busy === "exec" ? t("Running…") : t("Execute")}
                  </button>
                  <button className="btn" disabled={busy !== null} onClick={() => { setForm({ ...selected }); setEditing(true); }}>{t("Edit")}</button>
                  <button className="btn" disabled={busy !== null} onClick={() => void duplicate(selected)}>{t("Duplicate")}</button>
                  <button className="btn btn-danger" disabled={busy !== null} onClick={() => setConfirmDel(selected)}>
                    <Trash2 size={12} className="icon" /> {t("Delete")}
                  </button>
                </div>
                {output && (
                  <div className="term-out">
                    {output.stdout && <div className="ok">{output.stdout}</div>}
                    {output.stderr && <div className="err">{output.stderr}</div>}
                    <div className="faint" style={{ fontSize: 10, marginTop: 6 }}>
                      exit: {output.exit_code ?? "—"} {output.timed_out ? "· " + t("TIMED OUT") : ""}
                    </div>
                  </div>
                )}
                {busy === "exec" && <div className="scan"><span className="blink" /> {t("EXECUTING…")}</div>}
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-body"><div className="empty">{t("SELECT A COMMAND OR CREATE ONE")}</div></div>
            </div>
          )}

          {json !== "" && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-head">
                <div className="t"><Copy size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("COMMAND LIBRARY JSON")}</div>
                <span className="sub">{t("EXPORT / IMPORT")}</span>
              </div>
              <div className="panel-body">
                <textarea style={{ width: "100%", minHeight: 180, padding: 8, fontSize: 11 }}
                  readOnly={json !== "[]"} value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder='[{"name":"…","command":"…","device":"any","category":"…","risk":"LOW"}]' />
                <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setJson("")}>{t("Close")}</button>
                  {json === "[]" && <button className="btn btn-neon" onClick={() => void doImport()}>{t("Import")}</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel !== null}
        title={t("DELETE COMMAND")}
        danger
        confirmLabel={t("Delete")}
        body={<div>{t("Delete {name} from the command library? This cannot be undone.", { name: confirmDel?.name ?? "" })}</div>}
        onConfirm={() => confirmDel && void remove(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
