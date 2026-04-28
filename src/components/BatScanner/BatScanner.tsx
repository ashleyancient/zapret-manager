import { ChevronLeft, FolderSearch, Play, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Language, Preset } from "../../types";
import styles from "./BatScanner.module.css";

interface BatPreset {
  file_path: string;
  file_name: string;
  display_name: string;
  args: string;
}

interface TestResult {
  file_path: string;
  display_name: string;
  ok: boolean;
  exit_code: number | null;
  reason: string | null;
  output_excerpt: string | null;
}

interface AutotestProgress {
  index: number;
  total: number;
  display_name: string;
  phase: "running" | "done";
  result: TestResult | null;
}

type RowStatus = "idle" | "running" | "ok" | "fail";

interface RowState {
  status: RowStatus;
  reason?: string;
}

interface Props {
  initialPath: string;
  winwsPath: string;
  language: Language;
  onClose: () => void;
  onImport: (preset: Omit<Preset, "id" | "createdAt">) => Promise<void> | void;
}

const L = {
  ru: {
    title: "Поиск .bat пресетов zapret",
    back: "Назад",
    folder: "Папка с zapret",
    browse: "Обзор",
    scan: "Сканировать",
    autoTest: "Авто-проверка",
    importSel: "Импортировать выбранные",
    selectAll: "Выбрать все",
    selectOk: "Выбрать рабочие",
    deselect: "Снять",
    empty: "Не найдено .bat файлов с вызовом winws.exe.",
    hint:
      "Сканер найдёт все *.bat / *.cmd рядом с winws.exe и извлечёт аргументы. " +
      "«Авто-проверка» поочерёдно запустит каждый на ~4 сек и оценит, не падает ли он сразу. " +
      "Зелёный = процесс держится без ошибок, красный = ошибка/упал.",
    statusOk: "✓ работает",
    statusFail: "✗ не работает",
    statusRun: "тест…",
    statusIdle: "не проверен",
    needWinws: "Сначала укажи путь к winws.exe в Настройках.",
  },
  en: {
    title: "Find zapret .bat presets",
    back: "Back",
    folder: "Zapret folder",
    browse: "Browse",
    scan: "Scan",
    autoTest: "Auto-check",
    importSel: "Import selected",
    selectAll: "Select all",
    selectOk: "Select working",
    deselect: "Clear",
    empty: "No .bat files invoking winws.exe were found.",
    hint:
      "The scanner finds all *.bat / *.cmd next to winws.exe and extracts arguments. " +
      "«Auto-check» runs each one for ~4 seconds and detects if it crashes. " +
      "Green = process stays alive, red = error / immediate exit.",
    statusOk: "✓ works",
    statusFail: "✗ broken",
    statusRun: "testing…",
    statusIdle: "not tested",
    needWinws: "Set the winws.exe path in Settings first.",
  },
} as const;

function deriveZapretRoot(winwsPath: string): string {
  if (!winwsPath) return "";
  const sep = winwsPath.includes("\\") ? "\\" : "/";
  const parts = winwsPath.split(sep);
  if (parts.length === 0) return "";
  // strip filename
  parts.pop();
  // if last segment is `bin`, strip it too
  if (parts[parts.length - 1]?.toLowerCase() === "bin") parts.pop();
  return parts.join(sep);
}

function statusBadgeClass(status: RowStatus): string {
  switch (status) {
    case "ok":
      return `${styles.statusBadge} ${styles.statusBadgeOk}`;
    case "fail":
      return `${styles.statusBadge} ${styles.statusBadgeFail}`;
    case "running":
      return `${styles.statusBadge} ${styles.statusBadgeRun}`;
    default:
      return styles.statusBadge;
  }
}

export function BatScanner({
  initialPath,
  winwsPath,
  language,
  onClose,
  onImport,
}: Props) {
  const dict = L[language];
  const [folder, setFolder] = useState(
    initialPath || deriveZapretRoot(winwsPath)
  );
  const [items, setItems] = useState<BatPreset[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RowState>>({});
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const un = await listen<AutotestProgress>("bats://progress", (e) => {
          if (!active) return;
          const p = e.payload;
          // find item by display_name (unique enough within a single zapret install)
          setResults((prev) => {
            // We can't reliably map by name alone; use the running result if provided.
            const next = { ...prev };
            if (p.phase === "running") {
              // mark by display_name
              const target = items.find(
                (it) => it.display_name === p.display_name
              );
              if (target) next[target.file_path] = { status: "running" };
            } else if (p.phase === "done" && p.result) {
              next[p.result.file_path] = {
                status: p.result.ok ? "ok" : "fail",
                reason: p.result.reason ?? undefined,
              };
            }
            return next;
          });
        });
        unlistenRef.current = un;
      } catch {
        // running outside Tauri, no-op
      }
    })();
    return () => {
      active = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [items]);

  async function handleBrowse() {
    try {
      const result = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: folder || undefined,
        title: dict.folder,
      });
      if (typeof result === "string") setFolder(result);
    } catch (err) {
      console.warn(err);
    }
  }

  async function handleScan() {
    setError(null);
    setScanning(true);
    setResults({});
    try {
      const list = await invoke<BatPreset[]>("scan_zapret_bats", {
        root: folder,
      });
      setItems(list);
      const sel: Record<string, boolean> = {};
      for (const it of list) sel[it.file_path] = false;
      setSelected(sel);
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
      setItems([]);
    } finally {
      setScanning(false);
    }
  }

  async function handleAutoTest() {
    if (!winwsPath) {
      setError(dict.needWinws);
      return;
    }
    if (items.length === 0) return;
    setError(null);
    setTesting(true);
    const initial: Record<string, RowState> = {};
    for (const it of items) initial[it.file_path] = { status: "idle" };
    setResults(initial);
    try {
      const res = await invoke<TestResult[]>("autotest_bat_presets", {
        presets: items,
        winwsPath,
        perTestMs: 4000,
      });
      const next: Record<string, RowState> = { ...initial };
      for (const r of res) {
        next[r.file_path] = {
          status: r.ok ? "ok" : "fail",
          reason: r.reason ?? undefined,
        };
      }
      setResults(next);
      // auto-select all working
      setSelected((prev) => {
        const out = { ...prev };
        for (const r of res) if (r.ok) out[r.file_path] = true;
        return out;
      });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setTesting(false);
    }
  }

  function toggle(filePath: string) {
    setSelected((s) => ({ ...s, [filePath]: !s[filePath] }));
  }

  function selectAll() {
    const next: Record<string, boolean> = {};
    for (const it of items) next[it.file_path] = true;
    setSelected(next);
  }

  function selectOk() {
    const next: Record<string, boolean> = {};
    for (const it of items)
      next[it.file_path] = results[it.file_path]?.status === "ok";
    setSelected(next);
  }

  function deselect() {
    const next: Record<string, boolean> = {};
    for (const it of items) next[it.file_path] = false;
    setSelected(next);
  }

  async function handleImport() {
    const chosen = items.filter((it) => selected[it.file_path]);
    for (const it of chosen) {
      const namePrefix = "BAT";
      const status = results[it.file_path]?.status;
      const tag = status === "ok" ? "✓" : status === "fail" ? "✗" : "•";
      await onImport({
        name: `[${namePrefix}] ${it.display_name}`,
        args: it.args,
        icon: tag,
      });
    }
    onClose();
  }

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  );
  const okCount = useMemo(
    () =>
      Object.values(results).filter((r) => r.status === "ok").length,
    [results]
  );
  const failCount = useMemo(
    () =>
      Object.values(results).filter((r) => r.status === "fail").length,
    [results]
  );

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onClose}>
          <ChevronLeft size={14} />
          <span>{dict.back}</span>
        </button>
        <h2 className={styles.title}>{dict.title}</h2>
      </header>

      <div className={styles.body}>
        <div className={styles.path}>
          <input
            className={styles.input}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="C:\Tools\zapret"
          />
          <button
            type="button"
            className={styles.btn}
            onClick={handleBrowse}
            disabled={scanning || testing}
          >
            {dict.browse}
          </button>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleScan}
            disabled={scanning || testing || !folder}
          >
            <FolderSearch size={14} />
            <span>{dict.scan}</span>
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleAutoTest}
            disabled={testing || scanning || items.length === 0}
          >
            <Play size={14} />
            <span>
              {dict.autoTest}
              {testing ? " …" : ""}
              {!testing && (okCount + failCount > 0)
                ? ` (${okCount}/${items.length})`
                : ""}
            </span>
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={selectAll}
            disabled={items.length === 0}
          >
            {dict.selectAll}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={selectOk}
            disabled={okCount === 0}
          >
            {dict.selectOk}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={deselect}
            disabled={selectedCount === 0}
          >
            {dict.deselect}
          </button>
        </div>

        <p className={styles.hint}>{dict.hint}</p>

        {error && <div className={styles.error}>{error}</div>}

        {items.length === 0 && !scanning && !error && (
          <div className={styles.empty}>{dict.empty}</div>
        )}

        <ul className={styles.list}>
          {items.map((it) => {
            const row = results[it.file_path] ?? { status: "idle" as RowStatus };
            const label =
              row.status === "ok"
                ? dict.statusOk
                : row.status === "fail"
                ? dict.statusFail
                : row.status === "running"
                ? dict.statusRun
                : dict.statusIdle;
            return (
              <li
                key={it.file_path}
                className={`${styles.item} ${
                  selected[it.file_path] ? styles.itemActive : ""
                }`}
              >
                <div className={styles.itemHead}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={!!selected[it.file_path]}
                    onChange={() => toggle(it.file_path)}
                  />
                  <span className={styles.itemName}>{it.file_name}</span>
                  <span className={statusBadgeClass(row.status)}>{label}</span>
                </div>
                <div className={styles.itemArgs} title={it.args}>
                  {it.args}
                </div>
                {row.reason && (
                  <div className={styles.itemReason}>{row.reason}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGood}`}
          onClick={handleImport}
          disabled={selectedCount === 0}
        >
          <Download size={14} />
          <span>
            {dict.importSel} ({selectedCount})
          </span>
        </button>
      </footer>
    </div>
  );
}
