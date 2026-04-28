import { useState } from "react";
import type { Language, Preset } from "../../types";
import { t } from "../../i18n";
import styles from "./PresetEditor.module.css";

interface Props {
  initial?: Preset;
  language: Language;
  onSave: (data: { name: string; args: string }) => Promise<void> | void;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
}

export function PresetEditor({ initial, language, onSave, onCancel, onDelete }: Props) {
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [args, setArgs] = useState<string>(initial?.args ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && args.trim().length > 0 && !saving;

  return (
    <div className={styles.editor}>
      <input
        type="text"
        className={styles.input}
        placeholder={t(language, "preset.name")}
        maxLength={32}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className={styles.textarea}
        rows={3}
        placeholder={t(language, "preset.args")}
        value={args}
        onChange={(e) => setArgs(e.target.value)}
      />
      <div className={styles.actions}>
        {onDelete && (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDelete}`}
            onClick={() => void onDelete()}
            disabled={saving}
          >
            {t(language, "btn.delete")}
          </button>
        )}
        <div className={styles.spacer} />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={onCancel}
          disabled={saving}
        >
          {t(language, "btn.cancel")}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={!canSave}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({ name: name.trim(), args: args.trim() });
            } finally {
              setSaving(false);
            }
          }}
        >
          {t(language, "btn.save")}
        </button>
      </div>
    </div>
  );
}
