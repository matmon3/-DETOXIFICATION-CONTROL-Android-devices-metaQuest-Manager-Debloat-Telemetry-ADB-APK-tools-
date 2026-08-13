import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Device } from "../api/types";
import { api } from "../api/bridge";
import { log } from "../appLog";

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .devicesList()
      .then((d) => {
        if (mounted) {
          setDevices(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (mounted) setLoading(false);
        log("ERROR", `device list failed: ${e}`);
      });

    const un = listen<Device[]>("devices:updated", (e) => {
      if (mounted) setDevices(e.payload);
    });
    const onConn = listen<Device>("device:connected", (e) => {
      const d = e.payload;
      log("INFO", `device connected: ${d.model ?? d.serial} [${d.transport.toUpperCase()}]`);
    });
    const onDisc = listen<string>("device:disconnected", (e) => {
      log("WARN", `device disconnected: ${e.payload}`);
    });

    return () => {
      mounted = false;
      un.then((f) => f());
      onConn.then((f) => f());
      onDisc.then((f) => f());
    };
  }, []);

  const connected = devices.filter((d) => d.state === "connected");
  return { devices, connected, loading };
}
