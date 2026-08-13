import { useEffect, useRef, useState } from "react";
import { onTransferDone, onTransferProgress, api } from "../api/bridge";
import type { TransferDone, TransferProgress } from "../api/types";
import { log } from "../appLog";

export interface ActiveTransfer {
  token: string;
  label: string;
  pct: number | null;
  line: string | null;
  done: TransferDone | null;
}

/**
 * Assina eventos `transfer:*` e mantém uma lista de transferências ativas
 * (instalação de APK, upload/download de arquivos) com progresso.
 */
export function useTransfers() {
  const [items, setItems] = useState<ActiveTransfer[]>([]);
  const byToken = useRef<Map<string, ActiveTransfer>>(new Map());

  useEffect(() => {
    const unProgress = onTransferProgress((p: TransferProgress) => {
      const prev = byToken.current.get(p.token);
      if (prev) {
        prev.pct = p.pct ?? prev.pct;
        prev.line = p.line ?? prev.line;
        setItems(Array.from(byToken.current.values()));
      }
    });
    const unDone = onTransferDone((d: TransferDone) => {
      const prev = byToken.current.get(d.token);
      if (prev) {
        prev.done = d;
        setItems(Array.from(byToken.current.values()));
        log(d.ok ? "INFO" : "ERROR", `transfer ${d.token}: ${d.message}`);
        window.setTimeout(() => {
          byToken.current.delete(d.token);
          setItems(Array.from(byToken.current.values()));
        }, 8000);
      }
    });
    return () => {
      unProgress.then((f) => f());
      unDone.then((f) => f());
    };
  }, []);

  const track = (token: string, label: string) => {
    const entry: ActiveTransfer = {
      token,
      label,
      pct: null,
      line: null,
      done: null,
    };
    byToken.current.set(token, entry);
    setItems(Array.from(byToken.current.values()));
  };

  const cancel = (token: string) => {
    api.transferCancel(token);
    log("INFO", `cancel requested: ${token}`);
  };

  return { items, track, cancel };
}
