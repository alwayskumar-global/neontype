/**
 * Host for the generated Export Flow (Requirement 8, 19). Owns what the screen cannot: the capability
 * check, the export state machine, the exporter call with progress and Cancel (AbortSignal), the font
 * readiness check, the download, the wizard step, and the modal behaviour (focus into the dialog, Tab kept
 * inside, Escape closes, focus back to the control that opened it). The adapter turns state into the
 * screen's data.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  detectCapabilities,
  exportGif,
  exportMp4,
  exportPngSequence,
  exportWebp,
  type ExportResult,
  type FontSource,
} from "@studio/exporters";
import type { Project } from "@studio/engine";
import { ExportFlow } from "../../generated/export-flow/ExportFlow.js";
import { INITIAL, reduce, type ExportFormatId } from "../../export/machine.js";
import { prepareExportFonts } from "../../export/prepare.js";
import { downloadBlob } from "../../io/download.js";
import type { Store } from "../../shell/store.js";
import { useStoreState } from "../../shell/useStore.js";
import { adaptExportFlow, FORMAT_CARDS, outputSizes, type ExportFlowDispatchers, type ExportFlowView } from "../export-flow.js";
import "./export-flow-host.css";
/** The MP4 bitrate (the screen has no control for it). */
const VIDEO_BITRATE = 8_000_000;
function runExport(
  format: ExportFormatId,
  project: Project,
  opts: { videoBitrate?: number; backgroundFallback?: string; output?: { width: number; height: number } },
  fonts: FontSource[],
  onProgress: (f: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  // Fonts go to the exporter as bytes so the Worker path measures with the real faces.
  const base = { onProgress: (p: { fraction: number }) => onProgress(p.fraction), signal, fonts, output: opts.output };
  if (format === "mp4") return exportMp4(project, { ...base, videoBitrate: opts.videoBitrate, backgroundFallback: opts.backgroundFallback });
  if (format === "png-sequence") return exportPngSequence(project, base);
  if (format === "webp") return exportWebp(project, base);
  return exportGif(project, base);
}
export function ExportFlowHost({ store, onClose }: { store: Store; onClose: () => void }) {
  const project = useStoreState(store, (s) => s.project);
  const [run, dispatch] = useReducer(reduce, INITIAL);
  const [view, setView] = useState<ExportFlowView>({ step: 1, format: "mp4", resolution: null });
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(run);
  runRef.current = run;
  // Open: detect capabilities once.
  useEffect(() => {
    let active = true;
    void detectCapabilities().then((caps) => {
      if (active) dispatch({ type: "open", capabilities: caps });
    });
    return () => {
      active = false;
    };
  }, []);
  // Cancel any running export when the dialog closes or unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);
  // Escape closes; Tab / Shift+Tab cycle inside the dialog; focus moves into the dialog on open and returns to the
  // element that opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = (): HTMLElement | null => rootRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
    const first = dialog();
    if (first) {
      first.tabIndex = -1;
      first.focus();
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialog();
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const head = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (e.shiftKey && (active === head || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        head.focus();
      } else if (!root.contains(active)) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  const start = async (format: ExportFormatId, size: string | null): Promise<void> => {
    dispatch({ type: "select-format", format });
    // "fail" is only honoured while running, so enter running before the font checks; otherwise a font failure would
    // be dropped and the dialog would sit unchanged.
    dispatch({ type: "start" });
    // Create the controller BEFORE the font awaits so Cancel works while fonts load.
    const controller = new AbortController();
    abortRef.current = controller;
    // Font readiness before export (Req 6.4).
    const prepared = await prepareExportFonts(controller.signal);
    if (prepared.kind === "cancelled") {
      dispatch({ type: "cancelled" });
      return;
    }
    if (prepared.kind === "fail") {
      dispatch({ type: "fail", error: { code: prepared.code, message: prepared.message } });
      return;
    }
    const sizes = outputSizes(project);
    const chosen = sizes.find((x) => x.size === size) ?? sizes.find((x) => x.scale === 1);
    const output = chosen && chosen.scale !== 1 ? { width: Number(chosen.size.split(" × ")[0]), height: Number(chosen.size.split(" × ")[1]) } : undefined;
    const result = await runExport(
      format,
      project,
      { videoBitrate: format === "mp4" ? VIDEO_BITRATE : undefined, backgroundFallback: project.background === "transparent" ? "#000000" : undefined, output },
      prepared.fonts,
      (f) => dispatch({ type: "progress", fraction: f }),
      controller.signal,
    );
    if (result.ok) {
      if (import.meta.env.DEV) {
        const head = new Uint8Array(await result.file.slice(0, 32).arrayBuffer());
        (window as unknown as { __lastExport?: { fileName: string; size: number; head: number[] } }).__lastExport = {
          fileName: result.fileName,
          size: result.summary.byteSize,
          head: Array.from(head),
        };
      }
      dispatch({ type: "success", result });
    } else if (result.error.code === "cancelled") {
      dispatch({ type: "cancelled" });
    } else {
      dispatch({ type: "fail", error: result.error });
    }
  };
  /** Leaves a finished export (done, failed, cancelled) for the configuring state; other states are left alone. */
  const settle = (): void => dispatch({ type: "reset" });
  const dispatchers: ExportFlowDispatchers = {
    toOptions: () => {
      settle();
      setView((v) => ({ ...v, step: 2 }));
    },
    toDest: () => {
      settle();
      setView((v) => ({ ...v, step: 1 }));
    },
    pickFormat: (format) => {
      dispatch({ type: "select-format", format });
      const card = FORMAT_CARDS.find((c) => c.format === format);
      if (card) setView((v) => ({ ...v, format: card.id }));
    },
    setResolution: (size) => setView((v) => ({ ...v, resolution: size })),
    startExport: () => {
      const current = runRef.current;
      if (current.status === "idle" || current.status === "running") return;
      const card = FORMAT_CARDS.find((c) => c.id === view.format);
      const format = card?.format ?? ("format" in current ? current.format : "mp4");
      settle();
      void start(format, view.resolution);
    },
    cancelExport: () => abortRef.current?.abort(),
    close: onClose,
    download: () => {
      const current = runRef.current;
      if (current.status === "done") downloadBlob(current.result.file, current.result.fileName);
    },
  };
  const { data } = adaptExportFlow({ project, run, view }, dispatchers);
  return createPortal(
    <div className="exp-host" ref={rootRef}>
      <ExportFlow data={data} />
    </div>,
    document.body,
  );
}
