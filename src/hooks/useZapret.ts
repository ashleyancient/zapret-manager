import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useAppStore } from "../store/appStore";
import type { LogLine, Preset, StartArgs, ZapretStatus } from "../types";

type Phase = "idle" | "starting" | "stopping";

export function useZapret() {
  const status = useAppStore((s) => s.status);
  const setStatus = useAppStore((s) => s.setStatus);
  const setLogs = useAppStore((s) => s.setLogs);
  const appendLog = useAppStore((s) => s.appendLog);
  const settings = useAppStore((s) => s.settings);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const initial = await invoke<ZapretStatus>("get_status");
        if (mounted) setStatus(initial);
        const initialLogs = await invoke<LogLine[]>("get_logs");
        if (mounted) setLogs(initialLogs);
      } catch (e) {
        console.error("Failed to load initial zapret state", e);
      }
    })();

    (async () => {
      const u1 = await listen<ZapretStatus>("zapret://status", (e) => {
        setStatus(e.payload);
      });
      const u2 = await listen<LogLine | null>("zapret://log", (e) => {
        if (e.payload) appendLog(e.payload);
      });
      const u3 = await listen<void>("zapret://exited", async () => {
        if (settings.notifications) {
          try {
            let granted = await isPermissionGranted();
            if (!granted) {
              const r = await requestPermission();
              granted = r === "granted";
            }
            if (granted) {
              sendNotification({
                title: "Zapret",
                body: "Процесс winws.exe завершился неожиданно",
              });
            }
          } catch (err) {
            console.warn("notification failed", err);
          }
        }
      });
      unlistenRefs.current = [u1, u2, u3];
    })();

    return () => {
      mounted = false;
      for (const u of unlistenRefs.current) {
        try {
          u();
        } catch {
          /* noop */
        }
      }
      unlistenRefs.current = [];
    };
  }, [setStatus, setLogs, appendLog, settings.notifications]);

  const start = useCallback(
    async (preset: Preset) => {
      setError(null);
      setPhase("starting");
      try {
        const args: StartArgs = {
          preset_id: preset.id,
          preset_name: preset.name,
          args: preset.args,
          winws_path: settings.winwsPath,
        };
        await invoke("start_zapret", { args });
      } catch (e) {
        setError(typeof e === "string" ? e : (e as Error).message);
      } finally {
        setTimeout(() => setPhase("idle"), 300);
      }
    },
    [settings.winwsPath]
  );

  const stop = useCallback(async () => {
    setError(null);
    setPhase("stopping");
    try {
      await invoke("stop_zapret");
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message);
    } finally {
      setTimeout(() => setPhase("idle"), 300);
    }
  }, []);

  const clearLogs = useCallback(async () => {
    try {
      await invoke("clear_logs");
      useAppStore.getState().clearLogs();
    } catch (e) {
      console.error(e);
    }
  }, []);

  return { status, phase, error, start, stop, clearLogs };
}
