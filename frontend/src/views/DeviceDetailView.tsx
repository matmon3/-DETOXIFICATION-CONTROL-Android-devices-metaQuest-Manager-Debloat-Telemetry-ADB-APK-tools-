import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Terminal, ArrowLeft } from "lucide-react";
import type { DeviceInfo } from "../api/types";
import { api, toError } from "../api/bridge";
import { log } from "../appLog";
import { useI18n } from "../hooks/useI18n";

interface Props {
  serial: string;
  back: () => void;
  openTerminal: (serial: string) => void;
}

function fmtBytes(n: number | undefined | null): string {
  if (n === null || n === undefined) return "—";
  const gb = n / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function Row({ k, v, hl }: { k: string; v: React.ReactNode; hl?: "hl" | "ok" | "bad" }) {
  return (
    <>
      <span className="k">{k}</span>
      <span className={`v ${hl ?? ""}`}>{v}</span>
    </>
  );
}

export function DeviceDetailView({ serial, back, openTerminal }: Props) {
  const { t } = useI18n();
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; detail?: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const i = await api.deviceInfo(serial);
      setInfo(i);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `info for ${serial}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>
            <span className="hl">{info?.headset ?? t("DEVICE")}</span> / {serial}
          </h1>
          <div className="crumb">
            {t("DEVICE INFORMATION / {m} / {a}", {
              m: info?.manufacturer ?? t("UNKNOWN"),
              a: info?.android_version ?? "?",
            })}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={back}>
            <ArrowLeft size={13} className="icon" />
            {t("Back")}
          </button>
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className="icon" />
            {t("Refresh")}
          </button>
          <button className="btn btn-primary" onClick={() => openTerminal(serial)}>
            <Terminal size={13} className="icon" />
            {t("Terminal")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <div className="msg">{error.message}</div>
          {error.detail && (
            <details>
              <summary>{t("View technical details")}</summary>
              <pre>{error.detail}</pre>
            </details>
          )}
        </div>
      )}

      {loading && (
        <div className="panel">
          <div className="panel-body">
            <span className="scan">
              <span className="blink" /> {t("READING DEVICE STATE")}
            </span>
          </div>
        </div>
      )}

      {info && (
        <>
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("IDENTITY")}</span>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <Row k={t("Model")} v={info.model ?? "—"} hl="hl" />
                  <Row k={t("Headset")} v={info.headset ?? "—"} />
                  <Row k={t("Manufacturer")} v={info.manufacturer ?? "—"} />
                  <Row k={t("Brand")} v={info.brand ?? "—"} />
                  <Row k={t("Codename")} v={info.codename ?? "—"} />
                  <Row k={t("Hardware")} v={info.hardware ?? "—"} />
                  <Row k={t("Serial")} v={serial} />
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("SYSTEM")}</span>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <Row k={t("Android")} v={info.android_version ?? "—"} />
                  <Row k={t("SDK")} v={info.sdk ?? "—"} />
                  <Row k={t("Security patch")} v={info.security_patch ?? "—"} />
                  <Row k={t("Build")} v={info.build ?? "—"} />
                  <Row k={t("Firmware")} v={info.firmware ?? "—"} />
                  <Row k={t("Bootloader")} v={info.bootloader ?? "—"} />
                  <Row k={t("ABI")} v={info.abi ?? "—"} />
                  <Row
                    k={t("Root")}
                    v={
                      info.root ? (
                        <span className="ok">{t("DETECTED")}</span>
                      ) : (
                        <span className="dim">{t("not detected")}</span>
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("POWER")}</span>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <Row
                    k={t("Battery")}
                    v={
                      info.battery_level !== null ? (
                        <>
                          {info.battery_level}%
                          {info.battery_status ? ` · ${info.battery_status}` : ""}
                        </>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Row
                    k={t("Temperature")}
                    v={info.battery_temperature_c !== null ? `${info.battery_temperature_c.toFixed(1)}°C` : "—"}
                  />
                  <Row k={t("RAM")} v={info.ram_total_mb ? `${(info.ram_total_mb / 1024).toFixed(1)} GB` : "—"} />
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("STORAGE")}</span>
              </div>
              <div className="panel-body">
                {info.storage ? (
                  <>
                    <div className="kv">
                      <Row k={t("Mount")} v={info.storage.mount} />
                      <Row k={t("Used")} v={fmtBytes(info.storage.used)} />
                      <Row k={t("Free")} v={<span className="ok">{fmtBytes(info.storage.free)}</span>} />
                      <Row k={t("Total")} v={fmtBytes(info.storage.total)} />
                    </div>
                    <div className="bar">
                      <div
                        className={`fill ${
                          info.storage.free / info.storage.total < 0.1
                            ? "crit"
                            : info.storage.free / info.storage.total < 0.25
                              ? "warn"
                              : "green"
                        }`}
                        style={{ width: `${(info.storage.used / info.storage.total) * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <span className="dim">{t("storage not available")}</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("DISPLAY")}</span>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <Row
                    k={t("Resolution")}
                    v={info.screen ? `${info.screen.width} x ${info.screen.height}` : "—"}
                  />
                  <Row k={t("Density")} v={info.screen?.density ? `${info.screen.density} dpi` : "—"} />
                  <Row
                    k={t("Refresh")}
                    v={info.screen?.refresh_rate ? `${info.screen.refresh_rate} Hz` : "—"}
                  />
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <span className="t">{t("LINK")}</span>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <Row k={t("IP")} v={info.ip ?? "—"} />
                  <Row
                    k={t("Developer mode")}
                    v={
                      info.developer_mode ? (
                        <span className="ok">{t("ENABLED")}</span>
                      ) : (
                        <span className="bad">{t("DISABLED")}</span>
                      )
                    }
                  />
                  <Row
                    k={t("Quest")}
                    v={
                      info.quest ? (
                        <span className="hl">{t("META QUEST DETECTED")}</span>
                      ) : (
                        <span className="dim">{t("no")}</span>
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="t">{t("FINGERPRINT")}</span>
            </div>
            <div className="panel-body">
              <div className="kv">
                <Row k="ro.build.fingerprint" v={info.fingerprint ?? "—"} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
