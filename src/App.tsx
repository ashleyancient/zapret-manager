import { useEffect, useMemo, useState } from "react";
import { Settings as SettingsIcon, ScrollText } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { TitleBar } from "./components/TitleBar/TitleBar";
import { StatusCard } from "./components/StatusCard/StatusCard";
import { PresetList } from "./components/PresetList/PresetList";
import { LogPanel } from "./components/LogPanel/LogPanel";
import { Settings } from "./components/Settings/Settings";
import { UpdateButton } from "./components/UpdateButton/UpdateButton";
import { useAppStore } from "./store/appStore";
import { hydrateStore, persistSettings } from "./store/persistence";
import { usePresets } from "./hooks/usePresets";
import { useZapret } from "./hooks/useZapret";
import type { AppSettings, Preset } from "./types";
import styles from "./App.module.css";

export default function App() {
  const hydrated = useAppStore((s) => s.hydrated);
  const settings = useAppStore((s) => s.settings);
  const patchSettings = useAppStore((s) => s.patchSettings);
  const logs = useAppStore((s) => s.logs);

  const { presets, activePresetId, create, update, remove, setActive } =
    usePresets();
  const { status, phase, error, start, stop, clearLogs } = useZapret();

  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");

  useEffect(() => {
    void hydrateStore();
    void getVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "theme-light",
      settings.theme === "light"
    );
  }, [settings.theme]);

  useEffect(() => {
    let un: UnlistenFn | null = null;
    (async () => {
      un = await listen<void>("tray://toggle", async () => {
        if (status.running) await stop();
        else if (activePresetId) {
          const p = presets.find((x) => x.id === activePresetId);
          if (p) await start(p);
        }
      });
    })();
    return () => {
      if (un) un();
    };
  }, [status.running, activePresetId, presets, start, stop]);

  const activePreset = useMemo<Preset | null>(() => {
    if (status.running && status.active_preset_id) {
      return presets.find((p) => p.id === status.active_preset_id) ?? null;
    }
    return presets.find((p) => p.id === activePresetId) ?? null;
  }, [presets, activePresetId, status]);

  const runningPresetId = status.running ? status.active_preset_id : null;

  async function handleStart() {
    if (!activePreset) return;
    await start(activePreset);
  }

  async function handleStop() {
    await stop();
  }

  async function handleSelect(preset: Preset) {
    if (status.running) {
      await stop();
      await new Promise((r) => setTimeout(r, 250));
      await setActive(preset.id);
      await start(preset);
    } else {
      await setActive(preset.id);
    }
  }

  async function changeSettings(patch: Partial<AppSettings>) {
    patchSettings(patch);
    await persistSettings({ ...settings, ...patch });
  }

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (logOpen) setLogOpen(false);
        else if (status.running && settings.minimizeToTray) {
          try {
            await getCurrentWindow().hide();
          } catch (err) {
            console.warn("hide window failed", err);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, logOpen, status.running, settings.minimizeToTray]);

  if (!hydrated) {
    return (
      <div className={styles.app}>
        <TitleBar />
        <div className={styles.loading}>Загрузка…</div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <TitleBar />
      <main className={styles.main}>
        <StatusCard
          status={status}
          phase={phase}
          activePreset={activePreset}
          onStart={handleStart}
          onStop={handleStop}
          language={settings.language}
        />
        {error && <div className={styles.error}>{error}</div>}
        <PresetList
          presets={presets}
          activePresetId={activePresetId}
          runningPresetId={runningPresetId}
          onSelect={handleSelect}
          onCreate={async (data) => {
            const p = await create(data);
            if (!activePresetId) await setActive(p.id);
          }}
          onUpdate={update}
          onDelete={remove}
          language={settings.language}
        />
      </main>
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon size={14} />
          <span>{settings.language === "ru" ? "Настройки" : "Settings"}</span>
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => setLogOpen(true)}
        >
          <ScrollText size={14} />
          <span>{settings.language === "ru" ? "Лог" : "Log"}</span>
        </button>
        <UpdateButton language={settings.language} />
      </footer>
      <LogPanel
        open={logOpen}
        logs={logs}
        language={settings.language}
        onClose={() => setLogOpen(false)}
        onClear={() => void clearLogs()}
      />
      {settingsOpen && (
        <Settings
          settings={settings}
          appVersion={appVersion}
          language={settings.language}
          onChange={changeSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
