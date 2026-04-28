import { Minus, X, Hexagon } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import styles from "./TitleBar.module.css";

async function safeWindowAction(action: "minimize" | "close"): Promise<void> {
  try {
    const win = getCurrentWindow();
    if (action === "minimize") await win.minimize();
    else await win.close();
  } catch (err) {
    console.warn("window action unavailable", err);
  }
}

export function TitleBar() {
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
          onClick={() => void safeWindowAction("minimize")}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Закрыть"
          className={`${styles.btn} ${styles.close}`}
          onClick={() => void safeWindowAction("close")}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
