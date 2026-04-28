import { Play, Plus } from "lucide-react";
import { useState } from "react";
import type { Language, Preset } from "../../types";
import { t } from "../../i18n";
import { PresetEditor } from "../PresetEditor/PresetEditor";
import styles from "./PresetList.module.css";

interface Props {
  presets: Preset[];
  activePresetId: string | null;
  runningPresetId: string | null;
  onSelect: (preset: Preset) => void;
  onCreate: (data: { name: string; args: string }) => Promise<void>;
  onUpdate: (preset: Preset) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  language: Language;
}

export function PresetList({
  presets,
  activePresetId,
  runningPresetId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  language,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <span>{t(language, "presets.title")}</span>
      </header>
      <ul className={styles.list}>
        {presets.length === 0 && !creating && (
          <li className={styles.empty}>{t(language, "presets.empty")}</li>
        )}
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const isRunning = preset.id === runningPresetId;
          const isEditing = editingId === preset.id;
          return (
            <li
              key={preset.id}
              className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
            >
              {!isEditing ? (
                <div className={styles.itemRow}>
                  <button
                    type="button"
                    className={styles.itemMain}
                    onClick={() => onSelect(preset)}
                  >
                    <span className={styles.itemIcon}>
                      {isRunning ? (
                        <Play size={12} className={styles.runningIcon} />
                      ) : (
                        preset.icon ?? "•"
                      )}
                    </span>
                    <span className={styles.itemContent}>
                      <span className={styles.itemName}>{preset.name}</span>
                      <span className={styles.itemArgs}>{preset.args}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => setEditingId(preset.id)}
                  >
                    {t(language, "btn.edit")}
                  </button>
                </div>
              ) : (
                <PresetEditor
                  initial={preset}
                  language={language}
                  onCancel={() => setEditingId(null)}
                  onSave={async (data) => {
                    await onUpdate({ ...preset, ...data });
                    setEditingId(null);
                  }}
                  onDelete={async () => {
                    if (window.confirm(t(language, "preset.confirmDelete"))) {
                      await onDelete(preset.id);
                      setEditingId(null);
                    }
                  }}
                />
              )}
            </li>
          );
        })}
        {creating && (
          <li className={`${styles.item}`}>
            <PresetEditor
              language={language}
              onCancel={() => setCreating(false)}
              onSave={async (data) => {
                await onCreate(data);
                setCreating(false);
              }}
            />
          </li>
        )}
      </ul>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setCreating(true)}
          disabled={creating}
        >
          <Plus size={14} />
          <span>{t(language, "btn.add")}</span>
        </button>
      </div>
    </section>
  );
}
