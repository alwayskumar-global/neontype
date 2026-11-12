/**
 * Pure helpers for the editor's timecode readout ("mm:ss:ff": minutes, seconds, and the frame within the
 * second). Kept free of Playwright so a spec can unit-test them.
 */
export interface Timecode {
  minutes: number;
  seconds: number;
  frameInSecond: number;
}
/** Parses "mm:ss:ff". Throws on any other text. */
export function parseTimecode(text: string): Timecode {
  const m = /^(\d{2,}):(\d{2}):(\d{2,})$/.exec(text.trim());
  if (!m) throw new Error(`unexpected timecode text: ${text}`);
  return { minutes: Number(m[1]), seconds: Number(m[2]), frameInSecond: Number(m[3]) };
}
/**
 * The frame index a timecode shows, at `fps`. The playhead can sit on the end of the project, which reads one
 * frame past the last, so the index is capped at `totalFrames - 1` (the rule the old readout used).
 */
export function frameFromTimecode(text: string, fps: number, totalFrames: number): number {
  const t = parseTimecode(text);
  return Math.min(totalFrames - 1, (t.minutes * 60 + t.seconds) * fps + t.frameInSecond);
}
/** Total frames of a project: duration times fps, rounded half away from zero (the model's rule). */
export function totalFrames(durationSeconds: number, fps: number): number {
  return Math.round(durationSeconds * fps);
}
