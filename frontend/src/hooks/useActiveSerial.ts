import { useEffect } from "react";
import type { Device } from "../api/types";
import { useActiveDevice } from "./useActiveDevice";

/**
 * Sincroniza o estado `serial` local de uma view com o device global ativo.
 * Retorna um `onChange` pronto para usar no `<select>` da view, que também
 * atualiza o device ativo global ao trocar.
 */
export function useActiveSerial(
  serial: string,
  setSerial: (s: string) => void,
  connected: Device[],
) {
  const { activeSerial, setActive } = useActiveDevice();

  useEffect(() => {
    if (!serial) {
      const pick =
        activeSerial && connected.some((d) => d.serial === activeSerial)
          ? activeSerial
          : connected.length > 0
            ? connected[0].serial
            : "";
      if (pick) setSerial(pick);
    }
  }, [serial, setSerial, connected, activeSerial]);

  const onSelect = (value: string) => {
    setSerial(value);
    setActive(value);
  };

  return { onSelect };
}
