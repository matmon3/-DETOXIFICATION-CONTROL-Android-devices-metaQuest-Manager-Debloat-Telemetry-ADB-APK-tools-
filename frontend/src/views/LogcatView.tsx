import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, Eraser, Pause, Play, ScrollText, Trash2 } from "lucide-react";
import type { AqmError, Device } from "../api/types";
import { api, toError, onLogcatLine, onLogcatStopped } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

type Level = "V" | "D" | "I" | "W" | "E" | "F";

const LEVELS: Level[] = ["V", "D", "I", "W", "E", "F"];

function parseLevel(line: string): Level {
  // threadtime: "08-12 15:00:00.000  1234  5678 I Tag: msg"
  const m = line.match(/\s([VDIWEF])\s+[\w.:/]+\s*:/);
  if (m) return m[1] as Level;
  return "V";
}

export function LogcatView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [levels, setLevels] = useState<Set<Level>>(new Set(["V", "D", "I", "W", "E", "F"]));
  const [search, setSearch] = useState("");
  const [error, setError] = useState<AqmError | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const pendingRef = useRef<string[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!serial && connected.length > 0) setSerial(connected[0].serial);
  }, [connected, serial]);

  // Acumula linhas recebidas em lote (evita re-render a cada evento).
  useEffect(() => {
    const unLine = onLogcatLine((l) => {
      if (!streaming) return;
      pendingRef.current.push(l.line);
      if (pendingRef.current.length >= 20) {
        flushPending();
      }
    });
    const unStop = onLogcatStopped(() => {
      setStreaming(false);
      log("WARN", "logcat stream ended");
    });
    return () => {
      unLine.then((f) => f());
      unStop.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const flushPending = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    setLines((prev) => {
      const next = [...prev, ...pendingRef.current];
      pendingRef.current = [];
      return next.length > 3000 ? next.slice(next.length - 3000) : next;
    });
  }, []);

  // Drena pendentes a cada 300ms.
  useEffect(() => {
    const t = setInterval(flushPending, 300);
    return () => clearInterval(t);
  }, [flushPending]);

  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  useEffect(() => {
    return () => {
      if (streaming) void api.logcatStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!serial) return;
    try {
      const snap = await api.logcatSnapshot();
      pendingRef.current = [];
      setLines(snap);
      await api.logcatStart(serial);
      setStreaming(true);
      setPaused(false);
      log("INFO", "logcat streaming started");
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `logcat start failed: ${err.message}`);
    }
  };

  const stop = async () => {
    try {
      await api.logcatStop();
      setStreaming(false);
      log("INFO", "logcat stopped");
    } catch (e) {
      const err = toError(e);
      setError(err);
    }
  };

  const clearDevice = async () => {
    if (!serial) return;
    try {
      await api.logcatClear(serial);
      setLines([]);
      log("INFO", "device logcat cleared");
    } catch (e) {
      const err = toError(e);
      setError(err);
    }
  };

  const clearLocal = () => {
    setLines([]);
    pendingRef.current = [];
  };

  const exportLog = async () => {
    try {
      const dest = await save({
        title: t("Export logcat"),
        defaultPath: "detoxification-control-logcat.log",
        filters: [
          { name: "Log", extensions: ["log"] },
          { name: "Text", extensions: ["txt"] },
        ],
      });
      if (!dest) return;
      await api.saveTextFile(dest, filtered.join("\n"));
      log("INFO", `logcat exported: ${dest}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `logcat export failed: ${err.message}`);
    }
  };

  const toggleLevel = (lv: Level) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lv)) next.delete(lv);
      else next.add(lv);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let out = lines;
    if (levels.size < 6) {
      out = out.filter((l) => levels.has(parseLevel(l)));
    }
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((l) => l.toLowerCase().includes(q));
    return out;
  }, [lines, levels, search]);

  return (
    <div className="content" style={{ maxWidth: "none" }}>
      <div className="page-header">
        <div className="titles">
          <h1>{t("Logcat")}</h1>
          <div className="crumb">{t("LIVE SYSTEM LOG / {n} LINES BUFFERED", { n: lines.length })}</div>
        </div>
        <div className="actions">
          <select className="select-sm" value={serial} onChange={(e) => onSelect(e.target.value)}>
            {connected.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model ? d.model.replace(/_/g, " ") : d.serial}
              </option>
            ))}
            {connected.length === 0 && <option value="">{t("— no device —")}</option>}
          </select>
          {streaming ? (
            <button className="btn" onClick={() => void stop()}>
              <Pause size={13} className="icon" /> {t("Stop")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void start()} disabled={!serial}>
              <Play size={13} className="icon" /> {t("Start")}
            </button>
          )}
          <button className="btn" onClick={clearDevice} disabled={!serial}>
            <Eraser size={13} className="icon" /> {t("Clear device")}
          </button>
          <button className="btn" onClick={clearLocal}>
            <Trash2 size={13} className="icon" /> {t("Clear view")}
          </button>
          <button className="btn" onClick={() => void exportLog()} disabled={filtered.length === 0}>
            <Download size={13} className="icon" /> {t("Export")}
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
          <div className="actions" style={{ gap: 4 }}>
            <ScrollText size={13} className="faint" />
            {LEVELS.map((lv) => (
              <button
                key={lv}
                className={`chip ${levels.has(lv) ? "chip-on" : ""}`}
                onClick={() => toggleLevel(lv)}
              >
                {lv}
              </button>
            ))}
          </div>
          <div className="actions" style={{ gap: 8 }}>
            <input
              className="search-input"
              style={{ width: 220 }}
              placeholder={t("search…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="autoscroll">
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
              {t("autoscroll")}
            </label>
            {streaming && (
              <span className="scan">
                <span className="blink" /> {t("STREAMING")}
              </span>
            )}
            {paused && <span className="badge yellow">{t("PAUSED")}</span>}
          </div>
        </div>
        <div className="logcat-body" ref={bodyRef} onClick={() => setPaused(true)}>
          {filtered.length === 0 ? (
            <div className="empty">
              {streaming ? t("WAITING FOR LOG LINES…") : t("PRESS START TO STREAM LOGCAT")}
            </div>
          ) : (
            filtered.map((l, i) => {
              const lv = parseLevel(l);
              const cls =
                lv === "E" || lv === "F"
                  ? "lv-error"
                  : lv === "W"
                    ? "lv-warn"
                    : lv === "D"
                      ? "lv-debug"
                      : "";
              return (
                <div key={`${i}-${l}`} className={`logcat-line ${cls}`}>
                  {l}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
