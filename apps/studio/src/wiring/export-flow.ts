/**
 * Adapter for the generated Export Flow screen (Requirement 19.2). Pure: store snapshot, the export
 * machine state, and the host's wizard state in; the screen's `data` out. Matches the REVISED design (37
 * bindings): the first step picks a FORMAT (MP4, PNG sequence, GIF, WebP, WebM with alpha), the size is a
 * scale of the project (`0.5×`, `1×`, `2×`), and Frame rate and Duration are plain text read from the
 * project. Every binding is backed (39). `onClose` serves the Close button, step 1's Cancel and Done;
 * `onDownload` serves the Download button.
 */
import type { ErrorCode } from "@studio/exporters";
import type { Project } from "@studio/engine";
import type { DcProps, DcValue } from "../ds/dc-runtime.js";
import { frameCountFor } from "../model/selectors.js";
import { messageFor } from "../export/errors.js";
import type { ExportFormatId, ExportState } from "../export/machine.js";
import { timecode } from "./format.js";
import type { Data } from "./types.js";
/** A format card on step 1. `id` is the design's id (`png` is the machine's `png-sequence`). */
export interface FormatCard {
  readonly id: string;
  readonly name: string;
  readonly nameLower: string;
  readonly icon: string;
  readonly meta: string;
  readonly use: string;
  /** The machine's format; null for a format this release cannot export (WebM with alpha). */
  readonly format: ExportFormatId | null;
  readonly title: string;
}
export const FORMAT_CARDS: readonly FormatCard[] = [
  { id: "mp4", name: "MP4 video", nameLower: "MP4 video", icon: "play", meta: "H.264 · solid background", use: "Plays everywhere: social posts, slides and messages.", format: "mp4", title: "Your MP4 video is ready" },
  { id: "png", name: "PNG sequence", nameLower: "PNG sequence", icon: "layers", meta: "ZIP of frames · transparency", use: "Lossless frames for video editors and compositing.", format: "png-sequence", title: "Your PNG sequence is ready" },
  { id: "gif", name: "Animated GIF", nameLower: "animated GIF", icon: "grid", meta: "256 colours · loops", use: "Loops in chats, docs and email.", format: "gif", title: "Your animated GIF is ready" },
  { id: "webp", name: "Animated WebP", nameLower: "animated WebP", icon: "image", meta: "Full colour · transparency · loops", use: "Smaller than GIF, for websites and apps.", format: "webp", title: "Your animated WebP is ready" },
  { id: "webm", name: "WebM with alpha", nameLower: "WebM with alpha", icon: "play", meta: "VP9 · transparency", use: "One small see-through video file.", format: null, title: "Your WebM with alpha is ready" },
];
const WEBM_REASON = "Not available in this version. Use PNG sequence or WebP for transparency.";
/** The capability key for each machine format. */
const CAP_KEY = { mp4: "mp4", "png-sequence": "pngSequence", gif: "gif", webp: "webp" } as const;
/** A scale of the project and the output size it gives ("W × H"), smallest first. Sizes keep the project's aspect. */
export interface OutputSize {
  readonly scale: number;
  readonly size: string;
  readonly label: string;
}
export function outputSizes(project: Project): OutputSize[] {
  const { width: w, height: h } = project.canvas;
  const out: OutputSize[] = [];
  for (const k of [0.5, 1, 2]) {
    const ow = Math.round(w * k);
    const oh = Math.round(h * k);
    if (ow >= 1 && oh >= 1 && Math.abs(ow / oh - w / h) * oh <= 1) out.push({ scale: k, size: `${ow} × ${oh}`, label: `${k}× · ${ow} × ${oh}` });
  }
  return out;
}
/** Wizard state held by the host. */
export interface ExportFlowView {
  step: 1 | 2;
  /** The selected format card id. */
  format: string;
  /** The chosen output size ("W × H"), or null for the project's own. */
  resolution: string | null;
}
export interface ExportFlowState {
  project: Project;
  run: ExportState;
  view: ExportFlowView;
}
export interface ExportFlowDispatchers {
  toOptions(): void;
  toDest(): void;
  /** `format` is the machine format of the picked card (never WebM, which cannot be picked). */
  pickFormat(format: ExportFormatId): void;
  /** `size` is "W × H", one of `outputSizes(project)`. */
  setResolution(size: string): void;
  startExport(): void;
  cancelExport(): void;
  /** Closes the dialog (Close, Cancel on the first step, Done). */
  close(): void;
  /** Downloads the finished file; does nothing when no export is done. */
  download(): void;
}
/** Binding keys without backing behaviour in v1: none. */
export const INERT_BINDINGS: readonly string[] = [];
/** What to try next, per error code (new copy; exhaustive over the exporters' ErrorCode union). */
export const TRY_NEXT: Record<ErrorCode, readonly { title: string; text: string }[]> = {
  "browser-unsupported": [{ title: "Try a PNG sequence", text: "It needs the fewest browser features." }, { title: "Update your browser", text: "Newer versions support more export formats." }],
  "blur-unsupported": [{ title: "Remove the blur effect", text: "Then export again." }],
  cancelled: [{ title: "Start the export again", text: "Nothing was saved." }],
  "out-of-memory": [{ title: "Lower the size", text: "Smaller frames need much less memory." }, { title: "Close other tabs that play video", text: "They share the same memory as this export." }, { title: "Try a PNG sequence", text: "It renders one frame at a time." }],
  "invalid-options": [{ title: "Shorten the project or lower the frame rate", text: "Very long or very fast projects are over the frame limit." }],
  "audio-decode-failed": [{ title: "Export without audio", text: "The audio track could not be read." }],
  "font-decode-failed": [{ title: "Reload the page", text: "The bundled fonts did not load." }],
  "font-not-ready": [{ title: "Wait a moment and try again", text: "Fonts are still loading." }],
  "empty-frame-range": [{ title: "Lengthen the project", text: "A project needs at least one frame." }],
  "encoder-failure": [{ title: "Try again, or pick another format", text: "Encoding stopped unexpectedly." }],
  "muxer-failure": [{ title: "Try again, or pick another format", text: "Writing the file failed." }],
  "project-invalid": [{ title: "Fix the project", text: "Open a saved copy or start a new project." }],
};
const FORMAT_NAME: Record<ExportFormatId, string> = { mp4: "MP4", "png-sequence": "PNG sequence", gif: "GIF", webp: "WebP" };
const ENCODE_STEP: Record<ExportFormatId, string> = { mp4: "Encoding MP4 (H.264)", "png-sequence": "Packing ZIP", gif: "Encoding GIF", webp: "Encoding WebP" };
function fileSize(bytes: number): string {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
/** The wizard step to show: the machine decides 3 to 5, the host decides 1 or 2. */
export function currentStep(run: ExportState, view: ExportFlowView): 1 | 2 | 3 | 4 | 5 {
  if (run.status === "running") return 3;
  if (run.status === "done") return 4;
  if (run.status === "failed") return 5;
  return view.step;
}
export function adaptExportFlow(state: ExportFlowState, d: ExportFlowDispatchers): DcProps {
  const { project, run, view } = state;
  const caps = run.status === "idle" ? null : run.capabilities;
  const reasonFor = (c: FormatCard): string => {
    if (c.format === null) return WEBM_REASON;
    const cap = caps?.[CAP_KEY[c.format]];
    return cap !== undefined && cap.status === "unsupported" ? (cap.reason ?? "Not available in this browser.") : "";
  };
  const selectable = FORMAT_CARDS.filter((c) => reasonFor(c) === "");
  const card = selectable.find((c) => c.id === view.format) ?? selectable[0] ?? (FORMAT_CARDS[0] as FormatCard);
  const sizes = outputSizes(project);
  const chosen = sizes.find((x) => x.size === view.resolution) ?? sizes.find((x) => x.scale === 1) ?? sizes[0];
  const res = chosen?.label ?? `1× · ${project.canvas.width} × ${project.canvas.height}`;
  const resSize = chosen?.size ?? `${project.canvas.width} × ${project.canvas.height}`;
  const step = currentStep(run, view);
  const total = frameCountFor(project);
  const fps = project.canvas.fps;
  const duration = project.canvas.durationSeconds;
  const fraction = run.status === "running" ? run.fraction : run.status === "done" ? 1 : 0;
  const done = Math.min(total, Math.round(fraction * total));
  const pct = Math.round(fraction * 100);
  const format: ExportFormatId = run.status === "running" ? run.format : (card.format ?? "mp4");
  const fmtName = FORMAT_NAME[format];
  const dims = project.canvas.width / project.canvas.height;
  const crumbState = (i: number): "done" | "current" | "todo" | "error" =>
    step === 4 ? "done" : step === 5 ? (i < 2 ? "done" : "error") : i + 1 < Math.min(step, 3) ? "done" : i + 1 === Math.min(step, 3) ? "current" : "todo";
  const crumbs: DcValue[] = ["Format", "Options", "Export"].map((label, i) => {
    const st = crumbState(i);
    return {
      label,
      sep: i < 2,
      current: st === "current" ? "step" : "false",
      mark: st === "done" ? "✓" : st === "error" ? "!" : String(i + 1),
      color: st === "todo" ? "var(--color-text-tertiary)" : st === "error" ? "var(--color-text-error)" : "var(--color-text-primary)",
      weight: st === "current" ? 600 : 500,
      ring: st === "done" ? "var(--color-success-border)" : st === "current" ? "var(--color-accent-2)" : st === "error" ? "var(--color-error-border)" : "var(--color-border-default)",
      fill: st === "done" ? "var(--color-success-bg)" : st === "current" ? "var(--color-accent-2-subtle)" : st === "error" ? "var(--color-error-bg)" : "transparent",
      numColor: st === "done" ? "var(--color-text-success)" : st === "current" ? "var(--color-text-accent-2)" : st === "error" ? "var(--color-text-error)" : "var(--color-text-tertiary)",
    };
  });
  const cur = done >= total ? 3 : 1;
  const exportSteps: DcValue[] = ["Loading fonts", `Rendering ${total} frames`, ENCODE_STEP[format], "Saving file"].map((label, i) => ({
    label,
    cls: i < cur ? "is-done" : i === cur ? "is-current" : "",
    icon: i < cur ? "success" : i === cur ? "clock" : "minus",
  }));
  const destCards: DcValue[] = FORMAT_CARDS.map((c) => {
    const reason = reasonFor(c);
    const machine = c.format;
    return {
      id: c.id,
      name: c.name,
      use: c.use,
      meta: c.meta,
      icon: c.icon,
      checked: String(reason === "" && card.id === c.id),
      limited: reason !== "",
      limitedReason: reason,
      pick: () => {
        if (reason === "" && machine !== null) d.pickFormat(machine);
      },
    };
  });
  const errorCode: ErrorCode | null = run.status === "failed" ? run.error.code : null;
  const result = run.status === "done" ? run.result : null;
  const fpsText = `${fps} fps`;
  const durText = `${duration.toFixed(2)} s`;
  const data: Data = {
    cancelExport: () => d.cancelExport(),
    crumbs,
    d: { id: card.id, name: card.name, nameLower: card.nameLower },
    destCards,
    dur: durText,
    errCode: errorCode === null ? "" : `ERR_${errorCode.toUpperCase().replace(/-/g, "_")}`,
    estimate: `${total} frames · ${fmtName}`,
    exportLabel: "Export",
    exportSteps,
    failText: errorCode === null ? "" : messageFor(errorCode),
    fileIcon: card.icon,
    fileMeta: result ? `${fileSize(result.summary.byteSize)} · ${result.summary.width} × ${result.summary.height} · ${duration.toFixed(1)} s · ${result.summary.fps} fps` : "",
    fileName: result?.fileName ?? "",
    fps: fpsText,
    frameTc: timecode(done / fps, fps),
    frames: total,
    framesText: `${done} / ${total} frames`,
    onRes: (v: string) => {
      const picked = outputSizes(project).find((x) => x.label === String(v));
      if (picked) d.setResolution(picked.size);
    },
    onClose: () => d.close(),
    onDownload: () => d.download(),
    outSummary: `${resSize} · ${fpsText} · ${durText} · ${fmtName}`,
    pct,
    pctText: `${pct}%`,
    res,
    resOpts: (sizes.length > 0 ? sizes.map((x) => x.label) : [res]),
    s1: step === 1,
    s2: step === 2,
    s3: step === 3,
    s4: step === 4,
    s5: step === 5,
    stageInThumb: "100%",
    startExport: () => d.startExport(),
    successText: "Download it, or export another format for somewhere else.",
    successTitle: card.title,
    thumbAspect: `${project.canvas.width} / ${project.canvas.height}`,
    thumbW: dims >= 1 ? "140px" : `${Math.round(200 * dims)}px`,
    toDest: () => d.toDest(),
    toOptions: () => d.toOptions(),
    tryNext: (errorCode === null ? [] : TRY_NEXT[errorCode]).map((t, i) => ({ n: String(i + 1), title: t.title, text: t.text })),
  };
  return { data };
}
