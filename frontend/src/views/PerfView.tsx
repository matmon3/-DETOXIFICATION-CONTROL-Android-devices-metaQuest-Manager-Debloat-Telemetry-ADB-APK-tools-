import { useEffect, useMemo, useState } from "react";
import { Cpu, Gauge, Microchip, RotateCcw, ScanEye, SlidersHorizontal, Zap } from "lucide-react";
import type { AqmError, Device, PerfState } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";
import { DeviceSelect } from "../components/DeviceSelect";

interface Props {
  devices: Device[];
}

const FFR_LABELS: Record<number, string> = { 0: "OFF", 1: "LOW", 2: "MED", 3: "HIGH", 4: "TOP" };

function LevelPicker({
  min,
  max,
  value,
  onChange,
  labels,
  disabled,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  labels?: Record<number, string>;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="vol-row" style={{ gap: 4 }}>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            className="btn btn-sm"
            disabled={disabled}
            style={{
              flex: 1,
              padding: "4px 0",
              ...(active
                ? { background: "var(--purple)", color: "#050505", borderColor: "var(--purple)", boxShadow: "0 0 8px rgba(139,92,246,.5)" }
                : {}),
            }}
            onClick={() => onChange(n)}
            title={labels?.[n] ? t(labels[n]) : t("level {n}", { n })}
          >
            {labels?.[n] ? t(labels[n]) : n}
          </button>
        );
      })}
    </div>
  );
}

function ModeToggle({
  dynamic,
  onChange,
  disabled,
}: {
  dynamic: boolean;
  onChange: (d: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const base = { flex: 1, padding: "4px 0", fontSize: 10, letterSpacing: 1 };
  return (
    <div className="vol-row" style={{ gap: 4 }}>
      <button
        className="btn btn-sm"
        disabled={disabled}
        style={{ ...base, ...(!dynamic ? { background: "var(--purple)", color: "#050505", borderColor: "var(--purple)" } : {}) }}
        onClick={() => onChange(false)}
      >
        {t("STATIC")}
      </button>
      <button
        className="btn btn-sm"
        disabled={disabled}
        style={{ ...base, ...(dynamic ? { background: "var(--purple)", color: "#050505", borderColor: "var(--purple)" } : {}) }}
        onClick={() => onChange(true)}
      >
        {t("DYNAMIC")}
      </button>
    </div>
  );
}

export function PerfView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(() => devices.filter((d) => d.state === "connected"), [devices]);
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);

  const [state, setState] = useState<PerfState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [cpuLevel, setCpuLevel] = useState(3);
  const [cpuDynamic, setCpuDynamic] = useState(false);
  const [gpuLevel, setGpuLevel] = useState(3);
  const [gpuDynamic, setGpuDynamic] = useState(false);
  const [ffrLevel, setFfrLevel] = useState(0);
  const [ffrDynamic, setFfrDynamic] = useState(false);
  const [resHeight, setResHeight] = useState(1584);

  const panelH = state?.panelHeight ?? null;
  const panelW = state?.panelWidth ?? null;
  const resWidth = Math.round(resHeight * 1.1);

  const refresh = async () => {
    if (!serial) return;
    setBusy("state");
    setError(null);
    try {
      const s = await api.perfState(serial);
      setState(s);
      setCpuLevel(s.cpuLevel ?? 3);
      setCpuDynamic(s.cpuDynamic);
      setGpuLevel(s.gpuLevel ?? 3);
      setGpuDynamic(s.gpuDynamic);
      setFfrLevel(s.ffrLevel ?? 0);
      setFfrDynamic(s.ffrDynamic);
      setResHeight(s.textureHeight ?? s.panelHeight ?? 1584);
      log("INFO", `perf state read on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `perf state failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, [serial]);

  const apply = async (key: string, fn: () => Promise<void>) => {
    if (!serial) return;
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
      await refresh();
      log("INFO", `${key} applied on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `${key} failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const applyResolution = async (w: number, h: number) => {
    await apply("res", () => api.perfSetResolution(serial, w, h));
  };

  const preset = (m: number) => {
    const base = panelH ?? 1584;
    const h = Math.round((base * m) / 16) * 16;
    return { h, w: Math.round(h * 1.1) };
  };

  const currentRes = (): string => {
    if (!state) return "—";
    if (state.textureWidth && state.textureHeight) return `${state.textureWidth}×${state.textureHeight}`;
    return t("DEFAULT");
  };

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Quest Performance")}>{t("Quest Performance")}</h1>
          <div className="crumb">{t("CPU · GPU · FFR · RESOLUTION")}</div>
        </div>
        <div className="actions">
          <DeviceSelect devices={devices} serial={serial} onChange={onSelect} />
          <button className="btn" onClick={() => void refresh()} disabled={busy !== null || !serial}>
            <RotateCcw size={13} className="icon" /> {t("Refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">✕ {error.message}</div>
          {error.detail && <details><summary>{t("View technical details")}</summary><pre>{error.detail}</pre></details>}
        </div>
      )}
      {note && <div className="note-box">▸ {note}</div>}
      {!serial && <div className="empty">{t("CONNECT A QUEST HEADSET TO TUNE ITS PERFORMANCE")}</div>}

      {serial && (
        <>
          <div className="metric-row" style={{ marginBottom: 10 }}>
            <span>{t("PANEL {v}", { v: panelW && panelH ? `${panelW}×${panelH}` : "?" })}</span>
            <span>{t("RENDER {v}", { v: currentRes() })}</span>
            <span>{t("CPU {v}", { v: state ? (state.cpuDynamic ? t("dynamic") : `L${state.cpuLevel ?? "?"}`) : "—" })}</span>
            <span>{t("GPU {v}", { v: state ? (state.gpuDynamic ? t("dynamic") : `L${state.gpuLevel ?? "?"}`) : "—" })}</span>
            <span>{t("FFR {v}", { v: state ? `${state.ffrLevel ?? 0}${state.ffrDynamic ? "D" : ""}` : "—" })}</span>
          </div>

          <div className="grid-2">
            {/* ---- CPU ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><Cpu size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("CPU LEVEL")}</div>
                <span className="sub">{t("0 SLOWEST · 5 FASTEST")}</span>
              </div>
              <div className="panel-body">
                <ModeToggle dynamic={cpuDynamic} onChange={setCpuDynamic} disabled={busy !== null} />
                <div className="kv-note" style={{ margin: "8px 0" }}>
                  {t("STATIC forces the clock level. DYNAMIC restores the app/OS default clocking (level ignored).")}
                </div>
                <LevelPicker min={0} max={5} value={cpuLevel} onChange={setCpuLevel} disabled={busy !== null || cpuDynamic} />
                <div className="metric-row" style={{ marginTop: 10 }}>
                  <span className="sub">{t("CURRENT: {v}", { v: state ? (state.cpuDynamic ? t("DYNAMIC") : t("LEVEL {n}", { n: state.cpuLevel ?? "?" })) : "—" })}</span>
                  <button
                    className="btn btn-sm btn-neon"
                    style={{ marginLeft: "auto" }}
                    disabled={busy !== null}
                    onClick={() => void apply("cpu", () => api.perfSetCpu(serial, cpuLevel, cpuDynamic))}
                  >
                    {busy === "cpu" ? t("APPLYING…") : t("APPLY CPU")}
                  </button>
                </div>
              </div>
            </div>

            {/* ---- GPU ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><Microchip size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("GPU LEVEL")}</div>
                <span className="sub">{t("0 SLOWEST · 5 FASTEST")}</span>
              </div>
              <div className="panel-body">
                <ModeToggle dynamic={gpuDynamic} onChange={setGpuDynamic} disabled={busy !== null} />
                <div className="kv-note" style={{ margin: "8px 0" }}>
                  {t("STATIC forces the GPU clock. DYNAMIC restores the app/OS default clocking (level ignored).")}
                </div>
                <LevelPicker min={0} max={5} value={gpuLevel} onChange={setGpuLevel} disabled={busy !== null || gpuDynamic} />
                <div className="metric-row" style={{ marginTop: 10 }}>
                  <span className="sub">{t("CURRENT: {v}", { v: state ? (state.gpuDynamic ? t("DYNAMIC") : t("LEVEL {n}", { n: state.gpuLevel ?? "?" })) : "—" })}</span>
                  <button
                    className="btn btn-sm btn-neon"
                    style={{ marginLeft: "auto" }}
                    disabled={busy !== null}
                    onClick={() => void apply("gpu", () => api.perfSetGpu(serial, gpuLevel, gpuDynamic))}
                  >
                    {busy === "gpu" ? t("APPLYING…") : t("APPLY GPU")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 10 }}>
            {/* ---- FFR ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><ScanEye size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("FIXED FOVEATED RENDERING")}</div>
                <span className="sub">{t("0 OFF · 4 HIGH TOP")}</span>
              </div>
              <div className="panel-body">
                <ModeToggle dynamic={ffrDynamic} onChange={setFfrDynamic} disabled={busy !== null} />
                <div className="kv-note" style={{ margin: "8px 0" }}>
                  {t("STATIC forces the level always on. DYNAMIC lets the system raise it up to the selected level only when needed.")}
                </div>
                <LevelPicker min={0} max={4} value={ffrLevel} onChange={setFfrLevel} labels={FFR_LABELS} disabled={busy !== null} />
                <div className="metric-row" style={{ marginTop: 10 }}>
                  <span className="sub">{t("CURRENT: {v}", { v: state ? `${state.ffrLevel ?? 0}${state.ffrDynamic ? " " + t("DYNAMIC") : ""}` : "—" })}</span>
                  <button
                    className="btn btn-sm btn-neon"
                    style={{ marginLeft: "auto" }}
                    disabled={busy !== null}
                    onClick={() => void apply("ffr", () => api.perfSetFfr(serial, ffrLevel, ffrDynamic))}
                  >
                    {busy === "ffr" ? t("APPLYING…") : t("APPLY FFR")}
                  </button>
                </div>
              </div>
            </div>

            {/* ---- Resolution ---- */}
            <div className="panel">
              <div className="panel-head">
                <div className="t"><SlidersHorizontal size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("RENDER RESOLUTION")}</div>
                <span className="sub">{t("EYE BUFFER · AR 1.1")}</span>
              </div>
              <div className="panel-body">
                <div className="vol-row">
                  <span className="k" style={{ width: 72 }}>{t("Height")}</span>
                  <input
                    type="range"
                    min={512}
                    max={2208}
                    step={16}
                    value={resHeight}
                    disabled={busy !== null}
                    onChange={(e) => setResHeight(Number(e.target.value))}
                  />
                  <span className="v">{resHeight}</span>
                </div>
                <div className="vol-row">
                  <span className="k" style={{ width: 72 }}>{t("Width")}</span>
                  <span className="v" style={{ flex: 1, textAlign: "left", fontWeight: 700, color: "var(--text)" }}>
                    {resWidth} <span className="sub">{t("(auto ×1.1)")}</span>
                  </span>
                </div>
                <div className="metric-row" style={{ margin: "8px 0" }}>
                  <span>{t("OUTPUT {v}", { v: `${resWidth}×${resHeight}` })}</span>
                  {panelH && <span>{t("PANEL {v}", { v: `${panelW}×${panelH}` })}</span>}
                </div>
                <div className="vol-row" style={{ gap: 4 }}>
                  {[0.6, 0.75, 0.9, 1.0].map((m) => {
                    const p = preset(m);
                    return (
                      <button key={m} className="btn btn-sm" disabled={busy !== null}
                        onClick={() => setResHeight(p.h)} title={`${p.w}×${p.h}`}>
                        {m}x
                      </button>
                    );
                  })}
                  <span style={{ marginLeft: "auto" }} className="sub">{t("presets vs panel")}</span>
                </div>
                <div className="metric-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" disabled={busy !== null}
                    onClick={() => void apply("res-reset", () => api.perfResetResolution(serial))}>
                    {t("RESET TO DEFAULT")}
                  </button>
                  <button className="btn btn-sm btn-neon" style={{ marginLeft: "auto" }} disabled={busy !== null}
                    onClick={() => void applyResolution(resWidth, resHeight)}>
                    {busy === "res" ? t("SETTING…") : t("SET RESOLUTION")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 10, borderColor: "var(--red)" }}>
            <div className="panel-head">
              <div className="t"><Zap size={12} className="icon" style={{ color: "var(--red)" }} /> {t("DANGER ZONE")}</div>
              <span className="sub">{t("RESTORE ALL FACTORY PERFORMANCE DEFAULTS")}</span>
            </div>
            <div className="panel-body">
              <div className="kv-note">
                {t("Removes all overrides (CPU / GPU / FFR / resolution). Higher clock levels and FFR reduce battery life and can increase heat. Settings apply immediately and are reset when the headset reboots.")}
              </div>
              <div className="metric-row" style={{ marginTop: 10 }}>
                <button className="btn btn-sm btn-danger" disabled={busy !== null}
                  onClick={() => void apply("reset-all", () => api.perfResetAll(serial))}>
                  <Gauge size={11} /> {t("RESET ALL PERFORMANCE SETTINGS")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {busy === "state" && serial && <div className="scan"><span className="blink" /> {t("READING DEVICE STATE…")}</div>}
    </div>
  );
}
