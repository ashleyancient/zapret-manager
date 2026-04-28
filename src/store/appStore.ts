import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { AppSettings, LogLine, Preset, ZapretStatus } from "../types";

export const DEFAULT_PRESETS: Preset[] = [
  {
    id: uuid(),
    name: "YouTube + Discord",
    args: "--dpi-desync=split2 --dpi-desync-split-pos=2 --dpi-desync-ttl=5",
    icon: "🎬",
    createdAt: Date.now(),
  },
  {
    id: uuid(),
    name: "Только YouTube",
    args: '--hostlist=lists/youtube.txt --dpi-desync=split2',
    icon: "▶",
    createdAt: Date.now(),
  },
  {
    id: uuid(),
    name: "Telegram",
    args: "--dpi-desync=disorder2 --dpi-desync-ttl=3",
    icon: "✈",
    createdAt: Date.now(),
  },
  {
    id: uuid(),
    name: "Максимальный обход",
    args: "--dpi-desync=split,disorder,fake --dpi-desync-ttl=3 --dpi-desync-split-pos=2",
    icon: "⚡",
    createdAt: Date.now(),
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  winwsPath: "C:\\Tools\\zapret\\bin\\winws.exe",
  autostart: false,
  minimizeToTray: true,
  notifications: true,
  theme: "dark",
  language: "ru",
};

interface AppStoreState {
  presets: Preset[];
  activePresetId: string | null;
  status: ZapretStatus;
  logs: LogLine[];
  settings: AppSettings;
  hydrated: boolean;
  // actions
  setPresets: (presets: Preset[]) => void;
  upsertPreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
  setActivePresetId: (id: string | null) => void;
  setStatus: (status: ZapretStatus) => void;
  setLogs: (logs: LogLine[]) => void;
  appendLog: (line: LogLine) => void;
  clearLogs: () => void;
  setSettings: (settings: AppSettings) => void;
  patchSettings: (patch: Partial<AppSettings>) => void;
  setHydrated: (v: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  presets: [],
  activePresetId: null,
  status: {
    running: false,
    pid: null,
    active_preset_id: null,
    started_at: null,
    winws_path: null,
  },
  logs: [],
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  setPresets: (presets) => set({ presets }),
  upsertPreset: (preset) =>
    set((s) => {
      const idx = s.presets.findIndex((p) => p.id === preset.id);
      if (idx === -1) return { presets: [...s.presets, preset] };
      const next = s.presets.slice();
      next[idx] = preset;
      return { presets: next };
    }),
  deletePreset: (id) =>
    set((s) => ({
      presets: s.presets.filter((p) => p.id !== id),
      activePresetId: s.activePresetId === id ? null : s.activePresetId,
    })),
  setActivePresetId: (id) => set({ activePresetId: id }),
  setStatus: (status) => set({ status }),
  setLogs: (logs) => set({ logs }),
  appendLog: (line) =>
    set((s) => {
      const next = [...s.logs, line];
      const trimmed = next.length > 200 ? next.slice(next.length - 200) : next;
      return { logs: trimmed };
    }),
  clearLogs: () => set({ logs: [] }),
  setSettings: (settings) => set({ settings }),
  patchSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setHydrated: (v) => set({ hydrated: v }),
}));
