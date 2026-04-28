import { load, type Store } from "@tauri-apps/plugin-store";
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  useAppStore,
} from "./appStore";
import type { AppSettings, Preset } from "../types";

const STORE_FILE = "settings.json";
const KEY_PRESETS = "presets";
const KEY_ACTIVE_PRESET = "activePresetId";
const KEY_SETTINGS = "settings";

let cached: Store | null = null;

async function getStore(): Promise<Store> {
  if (cached) return cached;
  cached = await load(STORE_FILE, { autoSave: true, defaults: {} });
  return cached;
}

function isPreset(value: unknown): value is Preset {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.args === "string" &&
    typeof v.createdAt === "number"
  );
}

function isSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.winwsPath === "string" &&
    typeof v.autostart === "boolean" &&
    typeof v.minimizeToTray === "boolean" &&
    typeof v.notifications === "boolean" &&
    (v.theme === "dark" || v.theme === "light") &&
    (v.language === "ru" || v.language === "en")
  );
}

export async function hydrateStore(): Promise<void> {
  let store: Store;
  try {
    store = await getStore();
  } catch (err) {
    console.warn("Tauri store unavailable, using defaults", err);
    useAppStore.setState({
      presets: DEFAULT_PRESETS,
      activePresetId: DEFAULT_PRESETS[0]?.id ?? null,
      settings: DEFAULT_SETTINGS,
      hydrated: true,
    });
    return;
  }

  const rawPresets = await store.get<unknown>(KEY_PRESETS);
  let presets: Preset[];
  if (Array.isArray(rawPresets) && rawPresets.every(isPreset)) {
    presets = rawPresets;
  } else {
    presets = DEFAULT_PRESETS;
    await store.set(KEY_PRESETS, presets);
  }

  const rawActive = await store.get<unknown>(KEY_ACTIVE_PRESET);
  const activePresetId =
    typeof rawActive === "string" && presets.some((p) => p.id === rawActive)
      ? rawActive
      : presets[0]?.id ?? null;

  const rawSettings = await store.get<unknown>(KEY_SETTINGS);
  const settings: AppSettings = isSettings(rawSettings)
    ? rawSettings
    : DEFAULT_SETTINGS;
  if (!isSettings(rawSettings)) {
    await store.set(KEY_SETTINGS, settings);
  }

  useAppStore.setState({
    presets,
    activePresetId,
    settings,
    hydrated: true,
  });
  await store.save();
}

export async function persistPresets(presets: Preset[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_PRESETS, presets);
  await store.save();
}

export async function persistActivePreset(id: string | null): Promise<void> {
  const store = await getStore();
  await store.set(KEY_ACTIVE_PRESET, id);
  await store.save();
}

export async function persistSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set(KEY_SETTINGS, settings);
  await store.save();
}
