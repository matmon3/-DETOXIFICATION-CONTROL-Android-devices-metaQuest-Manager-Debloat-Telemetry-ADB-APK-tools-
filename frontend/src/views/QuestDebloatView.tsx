import { useMemo, useState } from "react";
import { Eye, Headset, Info, Package, RefreshCw, ShieldAlert, SlidersHorizontal, Trash2 } from "lucide-react";
import type { AqmError, DebloatPackage, DebloatReport, Device, PackageDetail } from "../api/types";
import { api, toError } from "../api/bridge";
import { useActiveSerial } from "../hooks/useActiveSerial";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";
import { DeviceSelect } from "../components/DeviceSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Props {
  devices: Device[];
}

const CATEGORIES = ["ALL", "TELEMETRY", "QUEST", "STORE", "SOCIAL", "SERVICES", "SYSTEM", "META", "USER APPS", "UNKNOWN"];
const RISKS = ["ALL", "LOW", "MEDIUM", "HIGH"];

export function QuestDebloatView({ devices }: Props) {
  const connected = useMemo(() => devices.filter((d) => d.state === "connected"), [devices]);
  const [serial, setSerial] = useState<string>("");
  const { onSelect } = useActiveSerial(serial, setSerial, connected);
  const { t } = useI18n();

  const [report, setReport] = useState<DebloatReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("ALL");
  const [risk, setRisk] = useState<string>("ALL");
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [query, setQuery] = useState("");

  const [confirm, setConfirm] = useState<{ pkg: DebloatPackage; disable: boolean } | null>(null);
  const [info, setInfo] = useState<PackageDetail | null>(null);

  const analyze = async () => {
    if (!serial) return;
    setBusy("analyze");
    setError(null);
    setNote(null);
    try {
      const r = await api.debloatAnalyze(serial);
      setReport(r);
      log("INFO", `debloat analyze: ${r.total} packages on ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `debloat analyze failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const togglePkg = async (p: DebloatPackage, disable: boolean) => {
    if (!serial) return;
    if (disable && (p.risk === "HIGH" || p.critical)) {
      setConfirm({ pkg: p, disable: true });
      return;
    }
    await doToggle(p, disable);
  };

  const doToggle = async (p: DebloatPackage, disable: boolean) => {
    if (!serial) return;
    setBusy(`t-${p.package}`);
    setError(null);
    setNote(null);
    setConfirm(null);
    try {
      await api.debloatToggle(serial, p.package, disable);
      setNote(t(disable ? "Disabled {p}" : "Enabled {p}", { p: p.package }));
      log("INFO", `debloat ${disable ? "disable" : "enable"} ${p.package}`);
      await analyze();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `debloat toggle failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const applyRecommended = async (disable: boolean) => {
    if (!serial || !report) return;
    const targets = report.packages.filter((p) => p.recommended && !p.disabled && p.risk === "LOW");
    if (targets.length === 0) {
      setNote(t("No recommended low-risk packages to process."));
      return;
    }
    setConfirm({
      pkg: {
        package: `${targets.length} recommended packages`,
        category: "TELEMETRY",
        risk: "LOW",
        disabled: false,
        system: false,
        critical: false,
        recommended: true,
        description: t("Batch action on recommended safe-to-disable packages."),
      },
      disable,
    });
  };

  const doBatch = async (pkgNames: string[], disable: boolean) => {
    if (!serial) return;
    setBusy("batch");
    setError(null);
    setNote(null);
    setConfirm(null);
    try {
      const results = await api.debloatApply(serial, pkgNames, disable);
      const ok = results.filter((r) => r.ok).length;
      const bad = results.filter((r) => !r.ok).length;
      setNote(t("Batch complete: {ok} ok, {bad} failed.", { ok, bad }));
      log("INFO", `debloat batch: ${ok} ok ${bad} failed`);
      await analyze();
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `debloat batch failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const openInfo = async (pkg: string) => {
    if (!serial) return;
    setBusy(`i-${pkg}`);
    setError(null);
    try {
      const d = await api.debloatInfo(serial, pkg);
      setInfo(d);
      log("INFO", `debloat info ${pkg}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `debloat info failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    if (!report) return [];
    let list = report.packages;
    if (cat !== "ALL") list = list.filter((p) => p.category === cat);
    if (risk !== "ALL") list = list.filter((p) => p.risk === risk);
    if (onlyEnabled) list = list.filter((p) => !p.disabled);
    if (query.trim()) list = list.filter((p) => p.package.toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [report, cat, risk, onlyEnabled, query]);

  const recommended = report?.packages.filter((p) => p.recommended && !p.disabled && p.risk === "LOW").length ?? 0;

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1 className="glitch" data-text={t("Quest Debloat")}>{t("Quest Debloat")}</h1>
          <div className="crumb">{t("PACKAGE ANALYSIS — CATEGORIES · RISK · CONTROL")}</div>
        </div>
        <div className="actions">
          <DeviceSelect devices={devices} serial={serial} onChange={onSelect} />
          <button className="btn btn-neon" onClick={() => void analyze()} disabled={busy !== null || !serial}>
            <RefreshCw size={13} className="icon" /> {t("Analyze")}
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
      {!serial && <div className="empty">{t("CONNECT A DEVICE TO ANALYZE")}</div>}

      {serial && report && (
        <>
          <div className="debloat-head">
            <div className="status-cell" style={{ minWidth: 170 }}>
              <div className="k"><Headset size={11} style={{ display: "inline", marginRight: 4 }} /> {t("DEVICE")}</div>
              <div className="v">{report.headset ?? report.model ?? report.serial}</div>
            </div>
            <div className="status-cell" style={{ minWidth: 130 }}>
              <div className="k">{t("Quest OS")}</div>
              <div className="v">{report.osVersion ?? "—"}</div>
            </div>
            <div className="status-cell" style={{ minWidth: 100 }}>
              <div className="k">{t("Total")}</div>
              <div className="v">{report.total}</div>
            </div>
            <div className="status-cell" style={{ minWidth: 100 }}>
              <div className="k">{t("Disabled")}</div>
              <div className="v" style={{ color: "var(--yellow)" }}>{report.disabled}</div>
            </div>
            <div className="status-cell" style={{ minWidth: 160 }}>
              <div className="k">{t("Safe to disable")}</div>
              <div className="v" style={{ color: "var(--green)" }}>{recommended}</div>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn" disabled={busy !== null || recommended === 0}
              onClick={() => void applyRecommended(false)}>
              <Trash2 size={12} /> {t("Disable Safe")}
            </button>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="t"><Package size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("PACKAGES")}</div>
              <span className="sub">{filtered.length} / {report.total}</span>
            </div>
            <div className="panel-body" style={{ padding: 10 }}>
              <div className="debloat-filters">
                {CATEGORIES.map((c) => (
                  <button key={c} className={`filter-chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>
                ))}
                <span style={{ flex: 1 }} />
                {RISKS.map((r) => (
                  <button key={r} className={`filter-chip ${risk === r ? "active" : ""}`} onClick={() => setRisk(r)}>{r}</button>
                ))}
                <label className="filter-chip" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyEnabled} onChange={(e) => setOnlyEnabled(e.target.checked)} style={{ accentColor: "var(--purple)", marginRight: 4 }} />
                  {t("enabled only")}
                </label>
                <input className="search-input" placeholder={t("filter package…")} value={query}
                  onChange={(e) => setQuery(e.target.value)} style={{ width: 180 }} />
              </div>
              <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t("Package")}</th>
                      <th>{t("Type")}</th>
                      <th>{t("Risk")}</th>
                      <th>{t("Status")}</th>
                      <th style={{ textAlign: "right" }}>{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.package}>
                        <td style={{ whiteSpace: "normal", wordBreak: "break-all", maxWidth: 300 }}>
                          {p.package}
                          {p.critical && <span className="badge red" style={{ marginLeft: 6 }}>{t("CRIT")}</span>}
                          {p.recommended && !p.disabled && <span className="badge green" style={{ marginLeft: 6 }}>{t("SAFE")}</span>}
                          <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>{p.description}</div>
                        </td>
                        <td><span className={`cat-badge ${p.category.replace(/\s+/g, "_")}`}>{p.category}</span></td>
                        <td><span className={`risk-badge ${p.risk}`}>{p.risk}</span></td>
                        <td>
                          <span className={`st ${p.disabled ? "DISABLED" : "ACTIVE"}`} style={{ fontSize: 9, letterSpacing: 1 }}>
                            {p.disabled ? t("DISABLED") : t("ENABLED")}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            {!p.disabled ? (
                              <button className="btn btn-sm" disabled={busy !== null}
                                onClick={() => void togglePkg(p, true)}>{t("Disable")}</button>
                            ) : (
                              <button className="btn btn-sm" disabled={busy !== null}
                                onClick={() => void togglePkg(p, false)}>{t("Enable")}</button>
                            )}
                            <button className="icon-btn" title={t("Info")} disabled={busy !== null}
                              onClick={() => void openInfo(p.package)}>
                              <Info size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && <div className="empty">{t("NO PACKAGES MATCH FILTERS")}</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {serial && !report && busy !== "analyze" && (
        <div className="empty"><SlidersHorizontal size={18} style={{ display: "inline", marginRight: 8, color: "var(--purple)" }} />{t("PRESS ANALYZE TO SCAN PACKAGES")}</div>
      )}
      {busy === "analyze" && serial && <div className="scan"><span className="blink" /> {t("ANALYZING PACKAGES…")}</div>}

      <ConfirmDialog
        open={confirm !== null}
        title={t("WARNING — RISK CONFIRMATION")}
        danger
        confirmLabel={confirm?.disable ? t("Disable") : t("Apply")}
        body={
          <div>
            <p style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, color: "var(--red)" }}>
              <ShieldAlert size={14} />
              {confirm?.pkg.package.includes("recommended packages")
                ? t("{n} recommended packages", { n: Number(confirm?.pkg.package.split(" ")[0] ?? "0") })
                : confirm?.pkg.package}
            </p>
            <p className="hint" style={{ marginBottom: 4 }}>
              {confirm?.pkg.description}
              {confirm && (confirm.pkg.critical || confirm.pkg.risk === "HIGH") && (
                <span style={{ color: "var(--yellow)" }}>
                  {" "}{t("This package may be required by the operating system.")}
                </span>
              )}
            </p>
            <p className="hint">{t("Risk")}: <b className="risk-badge" style={{ color: "var(--red)", borderColor: "#5b1c2a" }}>{confirm?.pkg.risk}</b></p>
          </div>
        }
        onConfirm={() => {
          if (confirm?.pkg.package.includes("recommended packages")) {
            const names = report?.packages.filter((p) => p.recommended && !p.disabled && p.risk === "LOW").map((p) => p.package) ?? [];
            void doBatch(names, confirm.disable);
          } else if (confirm) {
            void doToggle(confirm.pkg, confirm.disable);
          }
        }}
        onCancel={() => setConfirm(null)}
      />

      {/* Info modal */}
      {info && (
        <div className="modal-backdrop" onClick={() => setInfo(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><Eye size={14} className="icon" /><span>{t("PACKAGE DETAIL — {p}", { p: info.package })}</span></div>
            <div className="modal-body">
              <div className="kv" style={{ gridTemplateColumns: "140px 1fr" }}>
                <div className="k">{t("Version")}</div><div className="v">{info.versionName} ({info.versionCode})</div>
                <div className="k">{t("UID")}</div><div className="v">{info.uid ?? "—"}</div>
                <div className="k">{t("System")}</div><div className="v">{info.isSystem ? t("YES") : t("no")}</div>
                <div className="k">{t("Disabled")}</div><div className="v">{info.disabled ? t("YES") : t("no")}</div>
                <div className="k">{t("Min/Target SDK")}</div><div className="v">{info.minSdk ?? "?"} / {info.targetSdk ?? "?"}</div>
                <div className="k">{t("Installed")}</div><div className="v">{info.firstInstallTime ?? "—"}</div>
                <div className="k">{t("Code path")}</div><div className="v">{info.codePath}</div>
                <div className="k">{t("Data dir")}</div><div className="v">{info.dataDir}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setInfo(null)}>{t("Close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
