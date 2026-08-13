import type { DeviceState } from "../api/types";
import { useI18n } from "../hooks/useI18n";

const STATE_META: Record<DeviceState, { label: string; color: string; led: string }> = {
  connected: { label: "CONNECTED", color: "ok", led: "led-green" },
  unauthorized: { label: "UNAUTHORIZED", color: "bad", led: "led-red" },
  offline: { label: "OFFLINE", color: "dim", led: "led-dim" },
  bootloader: { label: "BOOTLOADER", color: "bad", led: "led-yellow" },
  recovery: { label: "RECOVERY", color: "bad", led: "led-yellow" },
  disconnected: { label: "DISCONNECTED", color: "dim", led: "led-dim" },
  unknown: { label: "UNKNOWN", color: "dim", led: "led-dim" },
};

export function Indicator({ state }: { state: DeviceState }) {
  const { t } = useI18n();
  const m = STATE_META[state] ?? STATE_META.unknown;
  return (
    <span className={`ind ${m.color}`}>
      <span className={`led ${m.led}`} />
      {t(m.label)}
    </span>
  );
}

export function TransportTag({ transport }: { transport: string }) {
  const cls =
    transport === "usb"
      ? "badge green"
      : transport === "wifi"
        ? "badge purple"
        : transport === "fastboot"
          ? "badge yellow"
          : "badge";
  return <span className={cls}>{transport.toUpperCase()}</span>;
}
