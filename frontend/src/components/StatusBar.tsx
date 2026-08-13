import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { api } from "../api/bridge";
import { useI18n } from "../hooks/useI18n";

export function StatusBar({ connectedCount }: { connectedCount: number }) {
  const { t } = useI18n();
  const [adbVer, setAdbVer] = useState("ADB ...");
  const [adbPath, setAdbPath] = useState("");

  useEffect(() => {
    api
      .adbVersion()
      .then(setAdbVer)
      .catch(() => setAdbVer(t("ADB NOT FOUND")));
    api.adbPath().then(setAdbPath).catch(() => setAdbPath(""));
  }, [t]);

  return (
    <div className="statusbar">
      <div className="item">
        <Cpu size={11} style={{ color: "var(--purple)" }} />
        <span>{adbVer}</span>
      </div>
      {adbPath && (
        <div className="item">
          <span className="faint">{t("BIN")}</span>
          <span>{adbPath}</span>
        </div>
      )}
      <div className="item" style={{ marginLeft: "auto" }}>
        <span className="faint">{t("LINK")}</span>
        <span className="ok">{t("ACTIVE")}</span>
      </div>
      <div className="item">
        <span className="faint">{t("DEVICES")}</span>
        <span>{connectedCount}</span>
      </div>
      <div className="item">
        <span className="faint">DETOXIFICATION CONTROL v0.1.0</span>
      </div>
    </div>
  );
}
