import { Minus, X, Hexagon } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import styles from "./TitleBar.module.css";

export function TitleBar() {
  const win = getCurrentWindow();
  return (
    <div className={styles.bar} data-tauri-drag-region>
      <div className={styles.brand} data-tauri-drag-region>
        <Hexagon size={14} className={styles.logo} />
        <span className={styles.name}>ZAPRET</span>
      </div>
      <div className={styles.controls}>
        <button
          aria-label="Свернуть"
          className={styles.btn}
          onClick={() => void win.minimize()}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Закрыть"
          className={`${styles.btn} ${styles.close}`}
          onClick={() => void win.close()}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
