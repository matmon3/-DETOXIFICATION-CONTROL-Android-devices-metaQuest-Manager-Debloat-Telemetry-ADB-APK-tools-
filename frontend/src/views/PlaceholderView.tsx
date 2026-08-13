import { Box } from "lucide-react";

interface Props {
  title: string;
  phase: string;
  note?: string;
}

export function PlaceholderView({ title, phase, note }: Props) {
  return (
    <div className="content">
      <div className="page-header">
        <div className="titles">
          <h1>{title}</h1>
          <div className="crumb">MODULE NOT IMPLEMENTED</div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-body" style={{ textAlign: "center", padding: 40 }}>
          <Box size={22} style={{ color: "var(--purple)", margin: "0 auto 12px", display: "block" }} />
          <div className="up" style={{ fontSize: 12, letterSpacing: 2 }}>
            {title} — {phase}
          </div>
          <div className="dim" style={{ marginTop: 8, fontSize: 11.5 }}>
            {note ??
              "This module is scheduled for a later phase. The backend core (ADB engine) is ready and this view will be wired to it when implemented."}
          </div>
        </div>
      </div>
    </div>
  );
}
