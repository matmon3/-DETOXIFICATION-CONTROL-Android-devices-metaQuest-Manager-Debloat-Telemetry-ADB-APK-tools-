import { useState } from "react";
import { Check, Copy, Download, Moon, Upload, Palette } from "lucide-react";
import type { Theme } from "../api/types";
import { api, toError } from "../api/bridge";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

const FONTS = ["JetBrains Mono", "Fira Code", "IBM Plex Mono", "DejaVu Sans Mono", "Ubuntu Mono"];

const COLORS: { key: keyof Theme; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "text", label: "Text" },
  { key: "background", label: "Background" },
  { key: "panel", label: "Panel" },
];

const SLIDERS: { key: keyof Theme; label: string; max: number; unit?: string }[] = [
  { key: "glow", label: "Glow", max: 100 },
  { key: "scanlines", label: "Scanlines", max: 100 },
  { key: "glitch", label: "Glitch", max: 100 },
  { key: "animations", label: "Animations", max: 100 },
  { key: "transparency", label: "Transparency", max: 100 },
  { key: "border_width", label: "Border width", max: 4, unit: "px" },
  { key: "radius", label: "Radius", max: 16, unit: "px" },
  { key: "font_size", label: "Font size", max: 20, unit: "px" },
  { key: "density", label: "Density", max: 100 },
];

export function ThemeEditorView() {
  const { t } = useI18n();
  const { theme, presets, applyPreset, save, reduceMotion, setReduceMotion, error } = useTheme();
  const [draft, setDraft] = useState<Theme | null>(theme);
  const [saved, setSaved] = useState(false);
  const [json, setJson] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const d = draft ?? theme;

  const patch = (p: Partial<Theme>) => {
    setDraft({ ...d, ...p });
    setSaved(false);
  };

  const doSave = async () => {
    try {
      await save(d);
      setSaved(true);
      log("INFO", `theme saved: ${d.name}`);
    } catch (e) {
      const err = toError(e);
      log("ERROR", `theme save failed: ${err.message}`);
    }
  };

  const doPreset = async (name: string) => {
    try {
      await applyPreset(name);
      setDraft(null);
      setSaved(true);
      log("INFO", `theme preset applied: ${name}`);
    } catch (e) {
      const err = toError(e);
      log("ERROR", `theme preset failed: ${err.message}`);
    }
  };

  const doExport = async () => {
    try {
      setJson(await api.themeExport());
      log("INFO", "theme exported");
    } catch (e) {
      const err = toError(e);
      log("ERROR", `theme export failed: ${err.message}`);
    }
  };

  const doImport = async () => {
    try {
      const t = await api.themeImport(json);
      setDraft(t);
      setSaved(false);
      setJson("");
      log("INFO", `theme imported: ${t.name}`);
    } catch (e) {
      const err = toError(e);
      log("ERROR", `theme import failed: ${err.message}`);
    }
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const pv = { ...d, panel: d.panel, background: d.background, text: d.text, primary: d.primary, secondary: d.secondary, accent: d.accent };
  const pvStyle = {
    "--pv-primary": pv.primary,
    "--pv-secondary": pv.secondary,
    "--pv-accent": pv.accent,
    "--pv-text": pv.text,
    "--pv-bg": pv.background,
    "--pv-panel": pv.panel,
    "--pv-border": pv.border_width,
    "--pv-radius": pv.radius,
    borderRadius: pv.radius,
  } as React.CSSProperties;

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Theme Editor")}>{t("Theme Editor")}</h1>
          <div className="crumb">{t("VOID · NEON PURPLE · CYBER BLUE · LAIN · MATRIX · NIGHT CITY · TERMINAL")}</div>
        </div>
        <div className="actions">
          <button className="btn btn-neon" onClick={() => void doSave()} disabled={!draft}>
            <Check size={13} className="icon" /> {saved ? t("Saved") : t("Save Theme")}
          </button>
          <button className="btn" onClick={() => void doExport()}>
            <Download size={13} className="icon" /> {t("Export")}
          </button>
          <button className="btn" onClick={() => setJson(prev => (prev ? "" : "{}"))}>
            <Upload size={13} className="icon" /> {t("Import")}
          </button>
        </div>
      </div>

      {error && <div className="error-box"><div className="msg">✕ {error}</div></div>}

      <div className="theme-editor-grid">
        {/* ---- Controls ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t"><Palette size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("THEME PARAMETERS")}</div>
            <span className="sub">{t("LIVE DRAFT")}</span>
          </div>
          <div className="panel-body">
            <div className="theme-preset-row">
              {presets.map((p) => (
                <button
                  key={p.name}
                  className={`theme-preset ${!draft && p.name === d.name ? "active" : ""}`}
                  onClick={() => void doPreset(p.name)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="theme-field">
              <span className="k">{t("Name")}</span>
              <input className="v" style={{ padding: "4px 8px", width: "100%" }} value={d.name}
                onChange={(e) => patch({ name: e.target.value })} />
              <span className="num" />
            </div>

            {COLORS.map(({ key, label }) => (
              <div key={key} className="theme-field">
                <span className="k">{t(label)}</span>
                <span className="v">
                  <input type="color" value={d[key] as string}
                    onChange={(e) => patch({ [key]: e.target.value } as Partial<Theme>)} />
                </span>
                <span className="num">{d[key] as string}</span>
              </div>
            ))}

            {SLIDERS.map(({ key, label, max, unit }) => (
              <div key={key} className="theme-field">
                <span className="k">{t(label)}</span>
                <input type="range" min={0} max={max} value={d[key] as number}
                  onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<Theme>)} />
                <span className="num">{d[key] as number}{unit ?? ""}</span>
              </div>
            ))}

            <div className="theme-field">
              <span className="k">{t("Font")}</span>
              <select className="v" style={{ width: "100%" }} value={d.font}
                onChange={(e) => patch({ font: e.target.value })}>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <span className="num" />
            </div>

            <div className="theme-field" style={{ gridTemplateColumns: "120px 1fr 46px" }}>
              <span className="k">{t("Reduce Motion")}</span>
              <label className="filter-chip" style={{ cursor: "pointer", justifySelf: "start" }}>
                <input type="checkbox" checked={reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                  style={{ accentColor: "var(--purple)", marginRight: 4 }} />
                {t("OFF ANIMATIONS")}
              </label>
              <span className="num" />
            </div>
          </div>
        </div>

        {/* ---- Preview + JSON ---- */}
        <div>
          <div className="panel">
            <div className="panel-head">
              <div className="t"><Moon size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("PREVIEW")}</div>
              <span className="sub">{d.name}</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <div className="theme-preview" style={pvStyle}>
                <div className="pv-bar" style={{ borderBottom: `${pv.border_width}px solid var(--pv-primary)` }}>
                  <span style={{ color: "var(--pv-primary)" }}>◆</span> DETOXIFICATION CONTROL
                  <span style={{ marginLeft: "auto", color: "var(--pv-accent)" }}>● {t("LIVE")}</span>
                </div>
                <div className="pv-body" style={{ background: "var(--pv-panel)" }}>
                  <div className="pv-box" style={{ border: `${pv.border_width}px solid var(--pv-border)`, borderRadius: pv.radius, background: "var(--pv-bg)" }}>
                    <div className="pv-line">
                      <span className="pv-k">{t("DEVICE")}</span>
                      <span style={{ color: "var(--pv-text)" }}>Meta Quest 3S</span>
                    </div>
                    <div className="pv-line">
                      <span className="pv-k">{t("ANDROID")}</span>
                      <span style={{ color: "var(--pv-secondary)" }}>12</span>
                    </div>
                    <div className="pv-line">
                      <span className="pv-k">{t("STATUS")}</span>
                      <span style={{ color: "var(--pv-accent)" }}>● {t("ONLINE")}</span>
                    </div>
                    <div style={{ height: 6 }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className="pv-box" style={{ padding: "4px 8px", fontSize: 9, border: `${pv.border_width}px solid var(--pv-primary)`, color: "var(--pv-primary)", borderRadius: pv.radius }}>{t("PRIMARY")}</span>
                      <span className="pv-box" style={{ padding: "4px 8px", fontSize: 9, border: `${pv.border_width}px solid var(--pv-secondary)`, color: "var(--pv-secondary)", borderRadius: pv.radius }}>{t("SECONDARY")}</span>
                      <span className="pv-box" style={{ padding: "4px 8px", fontSize: 9, border: `${pv.border_width}px solid var(--pv-accent)`, color: "var(--pv-accent)", borderRadius: pv.radius }}>{t("ACCENT")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {json !== "" && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-head">
                <div className="t"><Copy size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("THEME JSON")}</div>
                <span className="sub">{t("EXPORT / IMPORT")}</span>
              </div>
              <div className="panel-body">
                {json === "{}" ? (
                  <textarea
                    style={{ width: "100%", minHeight: 180, padding: 8, fontSize: 11 }}
                    placeholder='{"name":"MY THEME",...}'
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                  />
                ) : (
                  <textarea
                    style={{ width: "100%", minHeight: 180, padding: 8, fontSize: 11 }}
                    readOnly
                    value={json}
                  />
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => void doCopy()} disabled={json === "{}"}>
                    <Copy size={12} className="icon" /> {copied ? t("Copied") : t("Copy")}
                  </button>
                  {json === "{}" ? (
                    <button className="btn btn-neon" onClick={() => void doImport()}>
                      <Upload size={12} className="icon" /> {t("Import")}
                    </button>
                  ) : (
                    <button className="btn" onClick={() => setJson("")}>{t("Close")}</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
