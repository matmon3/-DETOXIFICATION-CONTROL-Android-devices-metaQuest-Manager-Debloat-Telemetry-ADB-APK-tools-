import { useEffect, useState } from "react";
import { api } from "../api/bridge";
import { LANGS } from "../i18n/dicts";
import { useI18n } from "../hooks/useI18n";

export function SettingsView() {
  const { t, lang, setLang } = useI18n();
  const [adbPath, setAdbPath] = useState("");
  const [adbVer, setAdbVer] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .adbPath()
      .then(setAdbPath)
      .catch((e) => setErr(String(e)));
    api.adbVersion().then(setAdbVer).catch(() => setAdbVer("not found"));
  }, []);

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Settings")}</h1>
          <div className="crumb">{t("CONFIGURATION / SYSTEM")}</div>
        </div>
      </div>

      {err && <div className="error-box"><div className="msg">{err}</div></div>}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="t">ADB</span>
          </div>
          <div className="panel-body">
            <div className="kv">
              <span className="k">{t("Binary")}</span>
              <span className="v">{adbPath || "—"}</span>
              <span className="k">{t("Version")}</span>
              <span className="v">{adbVer}</span>
              <span className="k">{t("Override")}</span>
              <span className="v dim">
                {t("set env {env} (or {env2}) or edit {file}", {
                  env: "DETOXIFICATION_CONTROL_ADB",
                  env2: "AQM_ADB",
                  file: "~/.config/detoxification-control/settings.json",
                })}
              </span>
            </div>
            <div className="kv-note">
              &gt; {t("adb path resolution: settings.json > DETOXIFICATION_CONTROL_ADB env > PATH")}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("LANGUAGE / UI")}</span>
          </div>
          <div className="panel-body">
            <div className="kv">
              <span className="k">{t("Interface language")}</span>
              <span className="v">
                <select
                  className="select-sm"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as typeof lang)}
                >
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.native})
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="kv-note">
              &gt; {t("Appearance and layout options are saved automatically.")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("APPEARANCE")}</span>
          </div>
          <div className="panel-body">
            <div className="kv">
              <span className="k">{t("Theme")}</span>
              <span className="v hl">{t("FULLY CUSTOMIZABLE")}</span>
              <span className="k">{t("Presets")}</span>
              <span className="v">{t("VOID · NEON PURPLE · CYBER BLUE · LAIN · MATRIX · NIGHT CITY · TERMINAL")}</span>
              <span className="k">{t("Font")}</span>
              <span className="v">JetBrains Mono (editable)</span>
              <span className="k">{t("Editor")}</span>
              <span className="v hl">{t("THEME EDITOR SECTION")}</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="t">{t("ABOUT")}</span>
          </div>
          <div className="panel-body">
            <div className="kv">
              <span className="k">{t("Name")}</span>
              <span className="v">DETOXIFICATION CONTROL — Meta Quest / Android Control Center</span>
              <span className="k">{t("Version")}</span>
              <span className="v">0.1.0 (Phase 7 — complete)</span>
              <span className="k">{t("Stack")}</span>
              <span className="v">Rust + Tauri v2 + React/TS</span>
              <span className="k">{t("Status")}</span>
              <span className="v ok">{t("ALL MODULES ACTIVE: DEVICES · TOOLKIT · OPTIMIZER · DEBLOAT · SCREEN · CMDLIB · LOG")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
