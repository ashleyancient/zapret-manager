import { Loader2, Play, Square } from "lucide-react";
import type { Preset, ZapretStatus, Language } from "../../types";
import { useUptime } from "../../hooks/useUptime";
import { t } from "../../i18n";
import styles from "./StatusCard.module.css";

interface Props {
  status: ZapretStatus;
  phase: "idle" | "starting" | "stopping";
  activePreset: Preset | null;
  onStart: () => void;
  onStop: () => void;
  language: Language;
}

export function StatusCard({
  status,
  phase,
  activePreset,
  onStart,
  onStop,
  language,
}: Props) {
  const uptime = useUptime(status.running ? status.started_at : null);
  const running = status.running;
  const busy = phase !== "idle";

  const label = busy
    ? t(language, phase === "starting" ? "status.starting" : "status.stopping")
    : t(language, running ? "status.active" : "status.stopped");

  return (
    <section className={styles.card} data-state={running ? "active" : "idle"}>
      <div className={styles.row}>
        <div className={styles.statusGroup}>
          <span
            className={`${styles.dot} ${running ? styles.dotActive : styles.dotIdle}`}
            aria-hidden
          />
          <span className={styles.label}>{label}</span>
        </div>
        <button
          type="button"
          className={`${styles.actionBtn} ${
            running ? styles.actionStop : styles.actionStart
          }`}
          disabled={busy || (!running && !activePreset)}
          onClick={running ? onStop : onStart}
        >
          {busy ? (
            <Loader2 size={14} className={styles.spin} />
          ) : running ? (
            <Square size={14} />
          ) : (
            <Play size={14} />
          )}
          <span>{t(language, running ? "btn.stop" : "btn.start")}</span>
        </button>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaRow}>
          <span className={styles.metaKey}>{t(language, "status.preset")}</span>
          <span className={styles.metaVal}>
            {activePreset?.name ?? "—"}
          </span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaKey}>{t(language, "status.uptime")}</span>
          <span className={styles.metaVal}>{uptime}</span>
        </div>
      </div>
    </section>
  );
}
