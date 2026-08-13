import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eraser, RefreshCw, ScrollText, Search } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import type { AqmError, LogEntry } from "../api/types";
import { api, onLogEntry, toError } from "../api/bridge";
import { log } from "../appLog";
import { useI18n } from "../hooks/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";

const RESULTS = ["ALL", "SUCCESS", "ERROR"];

export function ActivityLogView() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const timer = useRef<number | null>(null);

  const load = async (filter?: string) => {
    setBusy("load");
    setError(null);
    try {
      const l = await api.logList(filter || undefined);
      setEntries(l);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `activity log load failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void load();
    const un = onLogEntry((e) => {
      setEntries((prev) => [e, ...prev].slice(0, 500));
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  // Debounced backend filter
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(query.trim() || undefined), 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  const filtered = useMemo(() => {
    let l = entries;
    if (result !== "ALL") l = l.filter((e) => e.result === result);
    return l;
  }, [entries, result]);

  const doClear = async () => {
    setConfirmClear(false);
    setBusy("clear");
    setError(null);
    try {
      await api.logClear();
      setEntries([]);
      log("INFO", "activity log cleared");
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `activity log clear failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setBusy("export");
    setError(null);
    try {
      const data = await api.logExport();
      const dest = await save({
        defaultPath: `detoxification-control-log-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (dest) {
        await api.saveTextFile(dest, data);
        log("INFO", `activity log exported: ${dest}`);
      }
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `activity log export failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Activity Log")}>{t("Activity Log")}</h1>
          <div className="crumb">{t("EVERYTHING THE APP DID ON YOUR DEVICES")}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => void load()} disabled={busy !== null}>
            <RefreshCw size={13} className="icon" /> {t("Refresh")}
          </button>
          <button className="btn" onClick={() => void doExport()} disabled={busy !== null}>
            <Download size={13} className="icon" /> {t("Export Log")}
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmClear(true)} disabled={busy !== null || entries.length === 0}>
            <Eraser size={13} className="icon" /> {t("Clear History")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">✕ {error.message}</div>
          {error.detail && <details><summary>{t("View technical details")}</summary><pre>{error.detail}</pre></details>}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="t"><ScrollText size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("HISTORY")}</div>
          <span className="sub">{filtered.length} {t("ENTRIES")}</span>
        </div>
        <div className="panel-body" style={{ padding: 10 }}>
          <div className="debloat-filters" style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <Search size={12} style={{ color: "var(--text-faint)" }} />
              <input className="search-input" style={{ width: 240 }} placeholder={t("filter command / device / kind…")}
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <span style={{ flex: 1 }} />
            {RESULTS.map((r) => (
              <button key={r} className={`filter-chip ${result === r ? "active" : ""}`} onClick={() => setResult(r)}>{r}</button>
            ))}
          </div>

          <div style={{ maxHeight: "62vh", overflowY: "auto" }}>
            <table className="log-table">
              <thead>
                <tr>
                  <th>{t("Time")}</th>
                  <th>{t("Device")}</th>
                  <th>{t("Kind")}</th>
                  <th>{t("Operation")}</th>
                  <th>{t("Command")}</th>
                  <th>{t("Result")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-faint)" }}>{e.time}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-dim)" }}>{e.device || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`st-badge ${e.kind.replace(/\s+/g, "_")}`}>{e.kind}</span>
                    </td>
                    <td style={{ maxWidth: 220, whiteSpace: "normal" }}>{e.operation}</td>
                    <td style={{ maxWidth: 340 }}>
                      <span className="cmd">adb {e.command}</span>
                      {e.error && <div style={{ color: "var(--red)", fontSize: 10.5, marginTop: 2 }}>{e.error}</div>}
                      {e.exit_code !== null && <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>exit: {e.exit_code}</div>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`res ${e.result}`}>{e.result}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6}><div className="empty">{t("NO LOG ENTRIES — RUN COMMANDS TO SEE ACTIVITY")}</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {busy === "load" && <div className="scan"><span className="blink" /> {t("LOADING…")}</div>}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t("CLEAR ACTIVITY HISTORY")}
        danger
        confirmLabel={t("Clear")}
        body={<div>{t("This permanently removes {n} log entries from the local history.", { n: entries.length })}</div>}
        onConfirm={() => void doClear()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
