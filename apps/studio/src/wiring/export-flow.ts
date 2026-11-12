/**
 * Adapter for the generated Export Flow screen (Requirement 19.2). Pure: store snapshot, the export
 * machine state, and the host's wizard state in; the screen's `data` out. Binding kinds are listed in the
 * design ("Binding tables"). Owner decisions applied here: Frame rate and Duration are READ-ONLY displays
 * of the project (their handlers are inert and never edit it); the Web embed destination is omitted; WebM
 * stays unsupported; there is no framing, loop, or audio.
 *
 * The screen's keys are still those of the CURRENT design. The owner is revising it (gap D-4); when the
 * re-export lands, `wiring.test.ts` fails until this adapter follows the new `EXPORT_FLOW_BINDINGS`.
 */
import type { ErrorCode } from "@studio/exporters";
import type { Project } from "@studio/engine";
import type { DcProps, DcValue } from "../ds/dc-runtime.js";
import { frameCountFor } from "../model/selectors.js";
import { messageFor } from "../export/errors.js";
import type { ExportFormatId, ExportState } from "../export/machine.js";
import { timecode } from "./format.js";
import { INERT, type Data } from "./types.js";
/** A destination card: a name for a format plus the aspect it expects. */
export interface Destination {
  readonly id: string;
  readonly name: string;
  readonly nameLower: string;
  readonly ratio: string;
  readonly ar: string;
  /** width / height the destination expects. */
  readonly aspect: number;
  readonly fh: number;
  readonly icon: string;
  readonly use: string;
  readonly title: string;
  readonly format: ExportFormatId;
  readonly alpha: boolean;
}
/** Destinations the exporters can honour. Web embed is omitted: there is no embed package. */
export const DESTINATIONS: readonly Destination[] = [
  { id: "reel", name: "Reel", nameLower: "reel", ratio: "9:16", ar: "9/16", aspect: 9 / 16, fh: 64, icon: "play", use: "Short vertical video for reels and shorts.", title: "Your reel is ready", format: "mp4", alpha: false },
  { id: "story", name: "Story", nameLower: "story", ratio: "9:16", ar: "9/16", aspect: 9 / 16, fh: 64, icon: "clock", use: "Full-screen frames that sit under app buttons.", title: "Your story is ready", format: "mp4", alpha: false },
  { id: "square", name: "Square", nameLower: "square video", ratio: "1:1", ar: "1/1", aspect: 1, fh: 56, icon: "grid", use: "Feed posts and ads that crop the same everywhere.", title: "Your square video is ready", format: "mp4", alpha: false },
  { id: "youtube", name: "YouTube", nameLower: "YouTube video", ratio: "16:9", ar: "16/9", aspect: 16 / 9, fh: 44, icon: "image", use: "Intros, lower thirds and title cards.", title: "Your video is ready", format: "mp4", alpha: false },
  { id: "overlay", name: "Transparent overlay", nameLower: "transparent overlay", ratio: "Alpha", ar: "1/1", aspect: 0, fh: 56, icon: "layers", use: "Titles you lay over footage in another editor.", title: "Your overlay is ready", format: "png-sequence", alpha: true },
];
export const DEFAULT_DESTINATION = "overlay";
/** Output sizes (as "W × H") the exporters accept for this project: its own aspect, scaled uniformly. */
export function outputSizes(project: Project): string[] {
  const { width: w, height: h } = project.canvas;
  const out: string[] = [];
  for (const k of [1, 0.5, 2]) {
    const ow = Math.round(w * k);
    const oh = Math.round(h * k);
    if (ow >= 1 && oh >= 1 && Math.abs(ow / oh - w / h) * oh <= 1) out.push(`${ow} × ${oh}`);
  }
  return out;
}
/** Destinations offered for this project: those whose aspect matches, plus the alpha overlay. */
export function offeredDestinations(project: Project): Destination[] {
  const ar = project.canvas.width / project.canvas.height;
  return DESTINATIONS.filter((x) => x.alpha || Math.abs(x.aspect - ar) / ar < 0.01);
}
/** Wizard state held by the host. */
export interface ExportFlowView {
  step: 1 | 2;
  destination: string;
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
  pickDestination(id: string): void;
  setResolution(res: string): void;
  pickPng(): void;
  startExport(): void;
  cancelExport(): void;
}
/** Binding keys without backing behaviour in v1 (design table, kind I). */
export const INERT_BINDINGS: readonly string[] = [
  "audio", "embedCode", "embedLoop", "embedPreview", "embedSize", "embedStart", "embedTag", "embedW", "eta",
  "framing", "framingHelp", "framingOpts", "loop", "loopHelp", "onAudio", "onDur", "onEmbedLoop", "onEmbedSize",
  "onEmbedStart", "onFps", "onFraming", "onLoop", "pickWebm", "pngSize", "sizeOpts", "startOpts", "webmSize",
];
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
  const offered = offeredDestinations(project);
  const dest = offered.find((x) => x.id === view.destination) ?? offered[offered.length - 1] ?? (DESTINATIONS[DESTINATIONS.length - 1] as Destination);
  const sizes = outputSizes(project);
  const res = view.resolution !== null && sizes.includes(view.resolution) ? view.resolution : (sizes[0] ?? `${project.canvas.width} × ${project.canvas.height}`);
  const step = currentStep(run, view);
  const total = frameCountFor(project);
  const fps = project.canvas.fps;
  const duration = project.canvas.durationSeconds;
  const fraction = run.status === "running" ? run.fraction : run.status === "done" ? 1 : 0;
  const done = Math.min(total, Math.round(fraction * total));
  const pct = Math.round(fraction * 100);
  const format: ExportFormatId = run.status === "running" ? run.format : dest.format;
  const fmtName = FORMAT_NAME[format];
  const dims = res.split(" × ").map(Number);
  const ratioW = dims[0] && dims[1] ? dims[0] / dims[1] : 1;
  const crumbState = (i: number): "done" | "current" | "todo" | "error" =>
    step === 4 ? "done" : step === 5 ? (i < 2 ? "done" : "error") : i + 1 < Math.min(step, 3) ? "done" : i + 1 === Math.min(step, 3) ? "current" : "todo";
  const crumbs: DcValue[] = ["Destination", "Options", "Export"].map((label, i) => {
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
  const destCards: DcValue[] = offered.map((x) => ({
    id: x.id,
    name: x.name,
    ratio: x.ratio,
    ar: x.ar,
    fh: x.fh,
    icon: x.icon,
    use: x.use,
    meta: `${sizes[0] ?? res} · ${x.alpha ? "PNG" : "MP4"}`,
    frameClass: `ui-dest__frame${x.alpha ? " ui-checker" : ""}`,
    checked: String(dest.id === x.id),
    limited: false,
    aria: `${x.name}, ${x.ratio}, ${sizes[0] ?? res}, ${x.alpha ? "PNG" : "MP4"}. ${x.use}`,
    pick: () => d.pickDestination(x.id),
  }));
  const webmUnsupported = run.status === "configuring" ? run.capabilities.webmAlpha.status === "unsupported" : true;
  const errorCode: ErrorCode | null = run.status === "failed" ? run.error.code : null;
  const result = run.status === "done" ? run.result : null;
  const data: Data = {
    audio: false,
    cancelExport: () => d.cancelExport(),
    crumbs,
    d: { name: dest.name, nameLower: dest.nameLower, ratio: dest.ratio, ar: dest.ar },
    destCards,
    dur: duration,
    embedCode: "",
    embedLoop: false,
    embedPreview: null,
    embedSize: "responsive",
    embedStart: "visible",
    embedTag: "",
    embedW: "100%",
    errCode: errorCode === null ? "" : `ERR_${errorCode.toUpperCase().replace(/-/g, "_")}`,
    estimate: `${total} frames · ${fmtName}`,
    eta: "",
    exportLabel: "Export",
    exportSteps,
    failText: errorCode === null ? "" : messageFor(errorCode),
    fileIcon: dest.alpha ? "image" : "play",
    fileMeta: result ? `${fileSize(result.summary.byteSize)} · ${result.summary.width} × ${result.summary.height} · ${duration.toFixed(1)} s · ${result.summary.fps} fps` : "",
    fileName: result?.fileName ?? "",
    fps,
    fpsOpts: [{ value: fps, label: String(fps) }],
    frameTc: timecode(done / fps, fps),
    frames: total,
    framesText: `${done} / ${total} frames`,
    framing: "fit",
    framingHelp: "",
    framingOpts: [],
    isAlpha: dest.alpha,
    isEmbed: false,
    isMp4: dest.format === "mp4",
    loop: false,
    loopHelp: "",
    needsFraming: false,
    noFraming: true,
    onAudio: INERT,
    onDur: INERT,
    onEmbedLoop: INERT,
    onEmbedSize: INERT,
    onEmbedStart: INERT,
    onFps: INERT,
    onFraming: INERT,
    onLoop: INERT,
    onRes: (v: string) => d.setResolution(v),
    outSummary: `${res} · ${fps} fps · ${duration.toFixed(2)} s · ${fmtName}`,
    pct,
    pctText: `${pct}%`,
    pickPng: () => d.pickPng(),
    pickWebm: INERT,
    pngChecked: "true",
    pngSize: "",
    res,
    resOpts: sizes.length > 0 ? sizes : [res],
    s1: step === 1,
    s2: step === 2,
    s3: step === 3,
    s4: step === 4,
    s5: step === 5,
    sizeOpts: [],
    stageInThumb: "100%",
    startExport: () => d.startExport(),
    startOpts: [],
    successText: "Download it, or export another format for somewhere else.",
    successTitle: dest.title,
    thumbW: ratioW >= 1 ? "140px" : `${Math.round(200 * ratioW)}px`,
    toDest: () => d.toDest(),
    toOptions: () => d.toOptions(),
    tryNext: (errorCode === null ? [] : TRY_NEXT[errorCode]).map((t, i) => ({ n: String(i + 1), title: t.title, text: t.text })),
    unsupported: webmUnsupported,
    webmChecked: "false",
    webmOk: !webmUnsupported,
    webmSize: "",
  };
  return { data };
}
