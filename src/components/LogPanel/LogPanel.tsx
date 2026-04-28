import { useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";
import type { Language, LogLine } from "../../types";
import { t } from "../../i18n";
import styles from "./LogPanel.module.css";

interface Props {
  open: boolean;
  logs: LogLine[];
  language: Language;
  onClose: () => void;
  onClear: () => void;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function LogPanel({ open, logs, language, onClose, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, logs.length]);

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <span className={styles.title}>{t(language, "log.title")}</span>
          <div className={styles.actions}>
            <button className={styles.btn} onClick={onClear} type="button">
              <Trash2 size={12} />
              <span>{t(language, "btn.clear")}</span>
            </button>
            <button className={styles.btn} onClick={onClose} type="button">
              <X size={14} />
            </button>
          </div>
        </header>
        <div className={styles.body} ref={scrollRef}>
          {logs.length === 0 ? (
            <div className={styles.empty}>{t(language, "log.empty")}</div>
          ) : (
            logs.map((line, i) => (
              <div
                key={`${line.ts}-${i}`}
                className={`${styles.line} ${
                  line.level === "error"
                    ? styles.lineError
                    : line.level === "warn"
                      ? styles.lineWarn
                      : ""
                }`}
              >
                <span className={styles.ts}>{formatTs(line.ts)}</span>
                <span className={styles.text}>{line.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
