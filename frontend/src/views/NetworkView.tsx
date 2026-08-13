import { useEffect, useMemo, useState } from "react";
import { Cable, Link2, Link2Off, Plug, QrCode, RefreshCw, Wifi } from "lucide-react";
import type { AqmError, Device } from "../api/types";
import { api, toError } from "../api/bridge";
import { useI18n } from "../hooks/useI18n";
import { log } from "../appLog";

interface Props {
  devices: Device[];
}

const PORTS = ["5555", "4444", "5554"];

export function NetworkView({ devices }: Props) {
  const { t } = useI18n();
  const connected = useMemo(
    () => devices.filter((d) => d.state === "connected"),
    [devices],
  );
  const usbDevices = useMemo(
    () => connected.filter((d) => d.transport === "usb"),
    [connected],
  );
  const wifiDevices = useMemo(
    () => connected.filter((d) => d.transport === "wifi"),
    [connected],
  );

  const [usbSerial, setUsbSerial] = useState<string>("");
  const [autoIp, setAutoIp] = useState<string | null>(null);
  const [tcpipPort, setTcpipPort] = useState("5555");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5555");
  const [pairHost, setPairHost] = useState("");
  const [pairPort, setPairPort] = useState("37000");
  const [pairCode, setPairCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AqmError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!usbSerial && usbDevices.length > 0) {
      setUsbSerial(usbDevices[0].serial);
    }
  }, [usbDevices, usbSerial]);

  const detectIp = async (serial: string) => {
    if (!serial) return;
    setBusy("ip");
    setError(null);
    setNote(null);
    try {
      const ip = await api.wifiDeviceIp(serial);
      setAutoIp(ip);
      setHost(ip);
      setNote(t("Detected device IP: {ip}", { ip }));
      log("INFO", `wifi ip detected: ${serial} -> ${ip}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      setAutoIp(null);
      log("ERROR", `wifi ip detect failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const enableTcpip = async (serial: string) => {
    if (!serial) return;
    setBusy("tcpip");
    setError(null);
    setNote(null);
    try {
      const p = parseInt(tcpipPort, 10) || 5555;
      await api.wifiEnableTcpip(serial, p);
      setNote(t("ADB over network enabled on port {p}. Now disconnect the USB cable.", { p }));
      log("INFO", `tcpip ${serial} port ${p}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `tcpip failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const connect = async (h?: string, p?: string) => {
    const targetHost = (h ?? host).trim();
    const targetPort = p ? parseInt(p, 10) : parseInt(port, 10) || undefined;
    if (!targetHost) {
      setError({ message: t("Enter an IP address to connect.") });
      return;
    }
    setBusy("connect");
    setError(null);
    setNote(null);
    try {
      const serial = await api.wifiConnect(targetHost, targetPort);
      setNote(t("Connected: {s}", { s: serial }));
      setHost("");
      log("INFO", `wifi connect ${targetHost}:${targetPort ?? 5555} -> ${serial}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `wifi connect failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (serial?: string) => {
    setBusy("disconnect");
    setError(null);
    setNote(null);
    try {
      await api.wifiDisconnect(serial);
      setNote(serial ? t("Disconnected: {s}", { s: serial }) : t("All network connections closed."));
      log("INFO", `wifi disconnect ${serial ?? "(all)"}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `wifi disconnect failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const pair = async () => {
    const h = pairHost.trim();
    const p = parseInt(pairPort, 10) || 37000;
    if (!h) {
      setError({ message: t("Enter the pairing IP.") });
      return;
    }
    if (!pairCode.trim()) {
      setError({ message: t("Enter the 6-digit pairing code.") });
      return;
    }
    setBusy("pair");
    setError(null);
    setNote(null);
    try {
      await api.wifiPair(h, p, pairCode.trim());
      setNote(t("Paired with {h}:{p}. Now connect with the same address on port 5555.", { h, p }));
      setPairCode("");
      log("INFO", `wifi pair ${h}:${p}`);
    } catch (e) {
      const err = toError(e);
      setError(err);
      log("ERROR", `wifi pair failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const btn = (id: string, label: string) => (
    <span>{busy === id ? t("WORKING") : t(label)}</span>
  );

  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{t("Network")}</h1>
          <div className="crumb">{t("ADB OVER TCP/IP / WIRELESS DEBUGGING")}</div>
        </div>
        <div className="actions">
          <button
            className="btn btn-ghost"
            onClick={() => void disconnect()}
            disabled={busy !== null}
          >
            <Link2Off size={13} className="icon" />
            {t("Disconnect All")}
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
      {note && <div className="note-box">▸ {note}</div>}

      <div className="grid-2">
        {/* ---- USB -> Wi-Fi ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t">
              <Cable size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("USB → WI-FI")}
            </div>
            <span className="sub">{t("ENABLE TCP/IP ON DEVICE")}</span>
          </div>
          <div className="panel-body">
            <div className="form-row">
              <label>{t("Device (USB)")}</label>
              <select
                className="select-sm"
                value={usbSerial}
                onChange={(e) => {
                  setUsbSerial(e.target.value);
                  setAutoIp(null);
                }}
              >
                {usbDevices.map((d) => (
                  <option key={d.serial} value={d.serial}>
                    {d.model ? d.model.replace(/_/g, " ") : d.serial}
                  </option>
                ))}
                {usbDevices.length === 0 && <option value="">{t("— no USB device —")}</option>}
              </select>
            </div>
            <div className="form-row">
              <label>{t("TCP/IP Port")}</label>
              <div className="inline-group">
                <select
                  className="select-sm"
                  value={tcpipPort}
                  onChange={(e) => setTcpipPort(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {PORTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={busy !== null || !usbSerial}
                  onClick={() => void enableTcpip(usbSerial)}
                >
                  <Plug size={13} className="icon" />
                  {btn("tcpip", "Enable TCP/IP")}
                </button>
              </div>
            </div>
            <div className="form-row">
              <label>{t("Device IP / Port")}</label>
              <div className="inline-group">
                <input
                  value={host}
                  placeholder={autoIp ?? "192.168.1.42"}
                  onChange={(e) => setHost(e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  style={{ width: 70 }}
                  title={t("ADB port")}
                />
                <button
                  className="btn btn-ghost"
                  disabled={busy !== null || !usbSerial}
                  onClick={() => void detectIp(usbSerial)}
                >
                  <RefreshCw size={13} className="icon" />
                  {btn("ip", "Detect")}
                </button>
                <button
                  className="btn"
                  disabled={busy !== null || !host.trim()}
                  onClick={() => void connect(host, port)}
                >
                  <Link2 size={13} className="icon" />
                  {btn("connect", "Connect")}
                </button>
              </div>
            </div>
            {autoIp && (
              <div className="hint">
                {t("Auto-detected: {ip} (unplug USB after connect)", { ip: autoIp })}
              </div>
            )}
          </div>
        </div>

        {/* ---- Pair (Android 11+) ---- */}
        <div className="panel">
          <div className="panel-head">
            <div className="t">
              <QrCode size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("PAIR (ANDROID 11+)")}
            </div>
            <span className="sub">{t("WIRELESS DEBUGGING CODE")}</span>
          </div>
          <div className="panel-body">
            <p className="hint">
              {t("On the headset: Settings → Developer → Wireless debugging → Pair device with pairing code. Enter the IP and the 6-digit code below.")}
            </p>
            <div className="form-row">
              <label>{t("IP")}</label>
              <input
                value={pairHost}
                placeholder="192.168.1.42"
                onChange={(e) => setPairHost(e.target.value)}
              />
            </div>
            <div className="grid-2">
              <div className="form-row">
                <label>{t("Port")}</label>
                <input
                  value={pairPort}
                  onChange={(e) => setPairPort(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label>{t("Pairing Code")}</label>
                <input
                  value={pairCode}
                  placeholder="123456"
                  onChange={(e) => setPairCode(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <button
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void pair()}
              >
                <QrCode size={13} className="icon" />
                {btn("pair", "Pair Device")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Wi-Fi devices ---- */}
      <div className="panel">
        <div className="panel-head">
          <div className="t">
            <Wifi size={12} className="icon" style={{ color: "var(--purple)" }} /> {t("NETWORK DEVICES")}
          </div>
          <span className="sub">
            {wifiDevices.length} {t(wifiDevices.length === 1 ? "LINK" : "LINKS")}
          </span>
        </div>
        <div className="panel-body">
          {wifiDevices.length === 0 && (
            <div className="empty">{t("No devices connected over the network.")}</div>
          )}
          {wifiDevices.map((d) => (
            <div className="dev-row" key={d.serial}>
              <div className="row-icon">
                <Wifi size={14} style={{ color: "var(--green)" }} />
              </div>
              <div className="row-main">
                <div className="row-title">{d.serial}</div>
                <div className="row-sub">
                  {d.model ? d.model.replace(/_/g, " ") : t("ADB device")} · state: connected
                </div>
              </div>
              <button
                className="btn btn-ghost"
                disabled={busy !== null}
                onClick={() => void disconnect(d.serial)}
              >
                <Link2Off size={13} className="icon" />
                {t("Disconnect")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
