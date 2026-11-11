/**
 * Export dialog (Requirement 8). Offers MP4 / PNG sequence / GIF only; gates by
 * detectCapabilities; shows per-format options, progress, cancel (AbortSignal),
 * the mp4-no-transparency note, and ErrorCode-mapped messages. Downloads the
 * result via a Blob URL revoked after use. Checks font readiness before export.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import {
  detectCapabilities,
  exportMp4,
  exportPngSequence,
  exportGif,
  type CapabilityReport,
  type ExportResult,
  type FontSource,
} from "@studio/exporters";
import type { Project } from "@studio/engine";

import { reduce, INITIAL, type ExportFormatId } from "./machine.js";
import { messageFor } from "./errors.js";
import { whenFontsReady, loadBundledFontBytes } from "../fonts/fonts.js";
import type { Store } from "../shell/store.js";
import { useStoreState } from "../shell/useStore.js";

const CAP_KEY: Record<ExportFormatId, keyof CapabilityReport> = {
  mp4: "mp4",
  "png-sequence": "pngSequence",
  gif: "gif",
};

function runExport(
  format: ExportFormatId,
  project: Project,
  opts: { videoBitrate?: number; backgroundFallback?: string },
  fonts: FontSource[],
  onProgress: (f: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  // Fonts go to the exporter as bytes so the Worker path measures with the real faces.
  const base = { onProgress: (p: { fraction: number }) => onProgress(p.fraction), signal, fonts };
  if (format === "mp4") return exportMp4(project, { ...base, videoBitrate: opts.videoBitrate, backgroundFallback: opts.backgroundFallback });
  if (format === "png-sequence") return exportPngSequence(project, base);
  return exportGif(project, base);
}

function download(file: Blob, fileName: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const project = useStoreState(store, (s) => s.project);
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const [bitrate, setBitrate] = useState(8_000_000);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  // Escape closes; focus the dialog on open (focus trap handled by the overlay).
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const start = async (format: ExportFormatId): Promise<void> => {
    dispatch({ type: "select-format", format });
    // "fail" is only honoured while running, so enter running before the font checks;
    // otherwise a font failure would be dropped and the dialog would sit unchanged.
    dispatch({ type: "start" });
    // Font readiness before export (Req 6.4).
    const fonts = await whenFontsReady();
    if (!fonts.ok) {
      dispatch({ type: "fail", error: { code: fonts.code, message: fonts.message } });
      return;
    }
    const fontBytes = await loadBundledFontBytes();
    if (!fontBytes.ok) {
      dispatch({ type: "fail", error: { code: fontBytes.code, message: fontBytes.message } });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const bg = project.background === "transparent" ? "#000000" : undefined;
    const result = await runExport(
      format,
      project,
      { videoBitrate: format === "mp4" ? bitrate : undefined, backgroundFallback: bg },
      fontBytes.fonts,
      (f) => dispatch({ type: "progress", fraction: f }),
      controller.signal,
    );
    if (result.ok) {
      if (import.meta.env.DEV) {
        const head = new Uint8Array(await result.file.slice(0, 8).arrayBuffer());
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

  const cancel = (): void => abortRef.current?.abort();

  return (
    <div className="dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>Export</h2>
          <button type="button" onClick={onClose} aria-label="Close export">x</button>
        </div>

        {state.status === "idle" && <p>Detecting capabilities...</p>}

        {state.status === "configuring" && (
          <div className="export-config">
            {project.background === "transparent" && (
              <p className="note">MP4 has no transparency; a solid background will be used (mp4-no-transparency).</p>
            )}
            <div className="field">
              <span>MP4 bitrate</span>
              <input type="number" value={bitrate} min={100000} step={100000}
                onChange={(e) => setBitrate(Number(e.target.value))} />
            </div>
            <div className="format-buttons">
              {(["mp4", "png-sequence", "gif"] as ExportFormatId[]).map((f) => {
                const cap = state.capabilities[CAP_KEY[f]];
                const disabled = cap.status === "unsupported";
                return (
                  <button key={f} type="button" disabled={disabled}
                    title={disabled ? cap.reason : undefined}
                    onClick={() => void start(f)}>
                    Export {f}{disabled ? " (unsupported)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {state.status === "running" && (
          <div className="export-running">
            <progress value={state.fraction} max={1} aria-label="Export progress" />
            <span>{Math.round(state.fraction * 100)}%</span>
            <button type="button" onClick={cancel}>Cancel</button>
          </div>
        )}

        {state.status === "done" && (
          <div className="export-done">
            <p>Done: {state.result.fileName} ({state.result.summary.byteSize} bytes)</p>
            {state.result.summary.notes.includes("mp4-no-transparency") && (
              <p className="note">Exported without transparency (mp4-no-transparency).</p>
            )}
            <button type="button" onClick={() => download(state.result.file, state.result.fileName)}>Download</button>
            <button type="button" onClick={() => dispatch({ type: "reset" })}>Export again</button>
          </div>
        )}

        {state.status === "failed" && (
          <div className="export-failed">
            <p role="alert">{messageFor(state.error.code)}</p>
            <button type="button" onClick={() => dispatch({ type: "reset" })}>Back</button>
          </div>
        )}

        {state.status === "cancelled" && (
          <div className="export-cancelled">
            <p>Export cancelled.</p>
            <button type="button" onClick={() => dispatch({ type: "reset" })}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
