import { useRef, useState } from "react";
import { Trash2, Copy, Check } from "lucide-react";
import type { Device } from "../api/types";
import { api, toError } from "../api/bridge";
import { log } from "../appLog";
import { useI18n } from "../hooks/useI18n";

interface Line {
  id: number;
  kind: "prompt" | "cmd" | "out" | "err" | "muted" | "info";
  text: string;
}

interface Props {
  devices: Device[];
}

const QUICK: { label: string; cmd: string }[] = [
  { label: "PACKAGES", cmd: "shell pm list packages -3" },
  { label: "BATTERY", cmd: "shell dumpsys battery" },
  { label: "STORAGE", cmd: "shell df -h /sdcard" },
  { label: "ANDROID VER", cmd: "shell getprop ro.build.version.release" },
  { label: "MODEL", cmd: "shell getprop ro.product.model" },
  { label: "IP", cmd: "shell ip route get 1" },
  { label: "GETPROP", cmd: "shell getprop" },
  { label: "DEVMODE", cmd: "shell settings get global development_settings_enabled" },
  { label: "REBOOT", cmd: "reboot" },
  { label: "RESTART ADB", cmd: "kill-server" },
];

export function TerminalView({ devices }: Props) {
  const { t } = useI18n();
  const connected = devices.filter((d) => d.state === "connected");
  const [serial, setSerial] = useState<string>(connected[0]?.serial ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  const add = (kind: Line["kind"], text: string) => {
    setLines((prev) => [...prev, { id: ++idRef.current, kind, text }]);
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
    });
  };

  const selectedDevice = connected.find((d) => d.serial === serial);

  const run = async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd || busy) return;
    if (!serial && !cmd.startsWith("kill-server") && !cmd.startsWith("start-server")) {
      add("err", t("No device selected. Choose a target in the device selector."));
      return;
    }
    setBusy(true);
    add("prompt", `[ADB] ${serial ? serial : "HOST"}`);
    add("cmd", `$ ${cmd}`);
    setHistory((h) => [cmd, ...h.filter((x) => x !== cmd)].slice(0, 50));
    setHistIdx(null);
    setInput("");
    try {
      const out = await api.terminalExecute(cmd, serial || undefined);
      if (out.stdout) add("out", out.stdout.replace(/\n$/, ""));
      if (out.stderr) add("err", out.stderr.replace(/\n$/, ""));
      if (out.timed_out) add("muted", t("[TIMED OUT] command did not finish in time"));
      else if (out.exit_code !== 0) add("muted", `[exit ${out.exit_code}]`);
      log("INFO", `terminal: ${cmd}`);
    } catch (e) {
      const err = toError(e);
      add("err", err.message);
      if (err.detail) add("muted", err.detail);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = histIdx === null ? 0 : Math.min(histIdx + 1, history.length - 1);
      if (history[idx]) {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = histIdx === null ? null : histIdx - 1;
      setHistIdx(idx);
      setInput(idx === null ? "" : history[idx] ?? "");
    }
  };

  const copyOutput = () => {
    const text = lines.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="content" style={{ maxWidth: "none", padding: "12px 16px" }}>
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div className="titles">
          <h1>{t("ADB")} <span className="hl">{t("Terminal")}</span></h1>
          <div className="crumb">
            {selectedDevice
              ? t("TARGET / {model}", { model: selectedDevice.model ?? selectedDevice.serial })
              : t("NO TARGET SELECTED")}
          </div>
        </div>
        <div className="actions">
          <select className="select-sm" value={serial} onChange={(e) => setSerial(e.target.value)}>
            {connected.length === 0 && <option value="">{t("no devices")}</option>}
            {connected.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model ? d.model.replace(/_/g, " ") : d.serial}
              </option>
            ))}
          </select>
          <button className="btn" onClick={copyOutput} title={t("Copy output")}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button className="btn" onClick={() => setLines([])} title={t("Clear terminal")}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="term">
        <div className="term-head">
          <span className="ind">
            <span className={`led ${connected.length > 0 ? "led-green" : "led-dim"}`} />
            {connected.length > 0 ? t("ADB ONLINE") : t("ADB STANDBY")}
          </span>
          <span className="faint">// {t("COMMANDS ARE PARSED AND PASSED AS STRUCTURED ARGS")}</span>
        </div>
        <div className="term-body" ref={bodyRef}>
          {lines.length === 0 && (
            <span className="muted">
              {t("DETOXIFICATION CONTROL ADB TERMINAL")}
              {"\n"}
              {t("TYPE `adb shell <cmd>` OR `shell <cmd>`. PREFIX IS OPTIONAL.")}
              {"\n"}
              {t("USE ↑ / ↓ FOR HISTORY. SERIAL IS INJECTED AUTOMATICALLY.")}
            </span>
          )}
          {lines.map((l) => {
            const cls =
              l.kind === "prompt"
                ? "prompt"
                : l.kind === "cmd"
                  ? "cmd"
                  : l.kind === "err"
                    ? "err"
                    : l.kind === "muted"
                      ? "muted"
                      : "out";
            return (
              <div key={l.id} className={cls}>
                {l.kind === "prompt" ? `[${l.text.replace("] ", "]")}]` : l.text}
              </div>
            );
          })}
          {busy && <div className="muted">{t("… running")}</div>}
        </div>
        <div className="term-input-row">
          <span className="prompt" style={{ fontWeight: 700 }}>
            {serial ? `[ADB:${serial.slice(0, 8)}]` : "[ADB]"}
          </span>
          <input
            className="term-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="$ adb shell <command>"
            autoFocus
            spellCheck={false}
          />
        </div>
        <div className="term-quick">
          <span className="faint" style={{ fontSize: 10, letterSpacing: 1 }}>
            {t("QUICK")}:
          </span>
          {QUICK.map((q) => (
            <button key={q.label} className="chip" onClick={() => run(q.cmd)} disabled={busy}>
              {t(q.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
