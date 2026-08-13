import { useSyncExternalStore } from "react";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

let logs: LogEntry[] = [];
const subscribers = new Set<() => void>();
let nextId = 0;

function emit() {
  subscribers.forEach((s) => s());
}

export function log(level: LogLevel, text: string) {
  logs = [
    { id: ++nextId, time: new Date().toLocaleTimeString(), level, text },
    ...logs,
  ].slice(0, 300);
  emit();
}

export function clearLogs() {
  logs = [];
  emit();
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function getSnapshot() {
  return logs;
}

export function useAppLog() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
