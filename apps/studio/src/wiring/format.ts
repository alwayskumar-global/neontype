/** Pure formatters shared by the adapters (no DOM, no clock). */
/** "mm:ss:ff" for a time in seconds at `fps` (frame counted within the second). */
export function timecode(t: number, fps: number): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const s = Math.floor(t + 1e-6);
  const f = Math.min(Math.max(1, Math.round(fps)) - 1, Math.floor((t - s) * fps + 1e-6));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f)}`;
}
/** Number of decimals in a step like 0.05 (used to format slider values). */
export function decimals(step: number): number {
  return (String(step).split(".")[1] ?? "").length;
}
/** A number with a unit suffix; the degree sign sits flush, other units after a space. */
export function withUnit(value: number, step: number, unit: string): string {
  const n = Number(value).toFixed(decimals(step));
  return unit === "" ? n : unit === "°" ? `${n}°` : `${n} ${unit}`;
}
