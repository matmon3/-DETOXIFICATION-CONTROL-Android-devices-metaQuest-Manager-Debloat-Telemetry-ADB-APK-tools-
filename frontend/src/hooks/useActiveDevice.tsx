import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Device } from "../api/types";

interface ActiveDeviceCtx {
  activeSerial: string;
  setActive: (serial: string) => void;
  device: Device | null;
  /** Sincroniza o estado local de uma view com o device ativo. */
  sync: (serial: string, setSerial: (s: string) => void, connected: Device[]) => void;
}

const Ctx = createContext<ActiveDeviceCtx>({
  activeSerial: "",
  setActive: () => {},
  device: null,
  sync: () => {},
});

export function ActiveDeviceProvider({ devices, children }: { devices: Device[]; children: ReactNode }) {
  const [activeSerial, setActiveSerial] = useState<string>("");

  // Se o device ativo sumir, limpa a seleção.
  useEffect(() => {
    if (activeSerial && !devices.some((d) => d.serial === activeSerial)) {
      setActiveSerial("");
    }
    if (!activeSerial && devices.length > 0) {
      const connected = devices.filter((d) => d.state === "connected");
      const first = connected.length > 0 ? connected[0].serial : devices[0].serial;
      setActiveSerial(first);
    }
  }, [devices, activeSerial]);

  const device = devices.find((d) => d.serial === activeSerial) ?? null;

  const sync = (serial: string, setSerial: (s: string) => void, connected: Device[]) => {
    if (!serial && activeSerial) {
      setSerial(activeSerial);
    } else if (!serial && !activeSerial && connected.length > 0) {
      setSerial(connected[0].serial);
    }
  };

  return (
    <Ctx.Provider
      value={{
        activeSerial,
        setActive: setActiveSerial,
        device,
        sync,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useActiveDevice() {
  return useContext(Ctx);
}
