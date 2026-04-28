import { useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Language } from "../../types";
import { t } from "../../i18n";
import styles from "./UpdateButton.module.css";

const RELEASES_URL = "https://github.com/bol-van/zapret/releases/latest";

interface Props {
  language: Language;
}

export function UpdateButton({ language }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
      >
        <RefreshCw size={14} />
        <span>{t(language, "btn.update")}</span>
      </button>
      {open && (
        <div className={styles.popover} role="dialog">
          <div className={styles.popText}>
            {t(language, "update.question")}
            <span className={styles.url}>{t(language, "update.url")}</span>
          </div>
          <div className={styles.popActions}>
            <button
              type="button"
              className={`${styles.popBtn} ${styles.btnGhost}`}
              onClick={() => setOpen(false)}
            >
              {t(language, "btn.cancel")}
            </button>
            <button
              type="button"
              className={`${styles.popBtn} ${styles.btnPrimary}`}
              onClick={async () => {
                try {
                  await openUrl(RELEASES_URL);
                } catch (e) {
                  console.error(e);
                }
                setOpen(false);
              }}
            >
              <ExternalLink size={12} />
              <span>{t(language, "btn.openGithub")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
