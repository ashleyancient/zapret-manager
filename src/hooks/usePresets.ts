import { useCallback } from "react";
import { v4 as uuid } from "uuid";
import { useAppStore } from "../store/appStore";
import { persistActivePreset, persistPresets } from "../store/persistence";
import type { Preset } from "../types";

export function usePresets() {
  const presets = useAppStore((s) => s.presets);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const setPresets = useAppStore((s) => s.setPresets);
  const upsertPreset = useAppStore((s) => s.upsertPreset);
  const deletePreset = useAppStore((s) => s.deletePreset);
  const setActivePresetId = useAppStore((s) => s.setActivePresetId);

  const create = useCallback(
    async (data: Omit<Preset, "id" | "createdAt">) => {
      const preset: Preset = {
        ...data,
        id: uuid(),
        createdAt: Date.now(),
      };
      const next = [...useAppStore.getState().presets, preset];
      setPresets(next);
      await persistPresets(next);
      return preset;
    },
    [setPresets]
  );

  const update = useCallback(
    async (preset: Preset) => {
      upsertPreset(preset);
      await persistPresets(useAppStore.getState().presets);
    },
    [upsertPreset]
  );

  const remove = useCallback(
    async (id: string) => {
      deletePreset(id);
      const state = useAppStore.getState();
      await persistPresets(state.presets);
      await persistActivePreset(state.activePresetId);
    },
    [deletePreset]
  );

  const setActive = useCallback(
    async (id: string | null) => {
      setActivePresetId(id);
      await persistActivePreset(id);
    },
    [setActivePresetId]
  );

  return {
    presets,
    activePresetId,
    create,
    update,
    remove,
    setActive,
  };
}
