import type { Device } from "../api/types";
import { useI18n } from "../hooks/useI18n";

interface Props {
  devices: Device[];
  serial: string;
  onChange: (serial: string) => void;
  disabled?: boolean;
}

export function DeviceSelect({ devices, serial, onChange, disabled }: Props) {
  const { t } = useI18n();
  const connected = devices.filter((d) => d.state === "connected");
  return (
    <select
      className="select-sm"
      value={serial}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={t("Device")}
    >
      {connected.map((d) => (
        <option key={d.serial} value={d.serial}>
          {d.model ? d.model.replace(/_/g, " ") : d.serial}
        </option>
      ))}
      {connected.length === 0 && <option value="">{t("— no device —")}</option>}
    </select>
  );
}
