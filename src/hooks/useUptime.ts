import { useSyncExternalStore } from "react";

function formatHHMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const subscribe = (notify: () => void): (() => void) => {
  const id = window.setInterval(notify, 1000);
  return () => window.clearInterval(id);
};

const getSnapshot = (): number => Date.now();
const getServerSnapshot = (): number => 0;

export function useUptime(startedAt: number | null): string {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (startedAt === null) return "00:00:00";
  return formatHHMMSS(now - startedAt);
}
