import { ArrowLeft, FolderSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { AppSettings, Language } from "../../types";
import { t } from "../../i18n";
import styles from "./Settings.module.css";

interface Props {
  settings: AppSettings;
  appVersion: string;
  language: Language;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
  onClose: () => void;
}

export function Settings({ settings, appVersion, language, onChange, onClose }: Props) {
  const [autostartReady, setAutostartReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const enabled = await isEnabled();
        if (mounted && enabled !== settings.autostart) {
          await onChange({ autostart: enabled });
        }
      } catch (e) {
        console.warn("autostart check failed", e);
      } finally {
        if (mounted) setAutostartReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleAutostart(next: boolean) {
    try {
      if (next) await enable();
      else await disable();
      await onChange({ autostart: next });
    } catch (e) {
      console.error("autostart toggle failed", e);
    }
  }

  async function pickFile() {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Executable", extensions: ["exe"] }],
      });
      if (typeof selected === "string") {
        await onChange({ winwsPath: selected });
      }
    } catch (e) {
      console.error("file pick failed", e);
    }
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <button className={styles.back} onClick={onClose} type="button">
          <ArrowLeft size={16} />
          <span>{t(language, "btn.close")}</span>
        </button>
        <h2 className={styles.title}>{t(language, "settings.title")}</h2>
      </header>

      <div className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label}>{t(language, "settings.path")}</label>
          <div className={styles.row}>
            <input
              type="text"
              className={styles.input}
              value={settings.winwsPath}
              onChange={(e) => void onChange({ winwsPath: e.target.value })}
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => void pickFile()}
            >
              <FolderSearch size={14} />
              <span>{t(language, "btn.browse")}</span>
            </button>
          </div>
        </div>

        <Toggle
          label={t(language, "settings.autostart")}
          value={settings.autostart}
          disabled={!autostartReady}
          onChange={(v) => void toggleAutostart(v)}
          language={language}
        />

        <Toggle
          label={t(language, "settings.tray")}
          value={settings.minimizeToTray}
          onChange={(v) => void onChange({ minimizeToTray: v })}
          language={language}
        />

        <Toggle
          label={t(language, "settings.notifications")}
          value={settings.notifications}
          onChange={(v) => void onChange({ notifications: v })}
          language={language}
        />

        <div className={styles.field}>
          <label className={styles.label}>{t(language, "settings.theme")}</label>
          <div className={styles.radioGroup}>
            <label className={styles.radio}>
              <input
                type="radio"
                checked={settings.theme === "dark"}
                onChange={() => void onChange({ theme: "dark" })}
              />
              <span>{t(language, "settings.theme.dark")}</span>
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                checked={settings.theme === "light"}
                onChange={() => void onChange({ theme: "light" })}
              />
              <span>{t(language, "settings.theme.light")}</span>
            </label>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t(language, "settings.language")}</label>
          <select
            className={styles.select}
            value={settings.language}
            onChange={(e) =>
              void onChange({ language: e.target.value as Language })
            }
          >
            <option value="ru">{t(language, "settings.lang.ru")}</option>
            <option value="en">{t(language, "settings.lang.en")}</option>
          </select>
        </div>

        <div className={styles.version}>
          {t(language, "settings.version")} {appVersion}
        </div>
      </div>
    </section>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  language: Language;
}

function Toggle({ label, value, disabled, onChange, language }: ToggleProps) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        type="button"
        className={`${styles.toggle} ${value ? styles.toggleOn : ""}`}
        disabled={disabled}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className={styles.toggleKnob} />
        <span className={styles.toggleText}>
          {value ? t(language, "settings.on") : t(language, "settings.off")}
        </span>
      </button>
    </div>
  );
}
