export interface Preset {
  id: string;
  name: string;
  args: string;
  hostlistPath?: string;
  icon?: string;
  createdAt: number;
}

export interface ZapretStatus {
  running: boolean;
  pid: number | null;
  active_preset_id: string | null;
  started_at: number | null;
  winws_path: string | null;
}

export interface LogLine {
  ts: number;
  level: "info" | "warn" | "error" | string;
  text: string;
}

export type Theme = "dark" | "light";
export type Language = "ru" | "en";

export interface AppSettings {
  winwsPath: string;
  autostart: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  theme: Theme;
  language: Language;
}

export interface StartArgs {
  preset_id: string;
  preset_name: string;
  args: string;
  winws_path: string;
}
