/** Pure formatters shared by the adapters (no DOM, no clock). */
/** "mm:ss:ff" for a time in seconds at `fps` (frame counted within the second). */
export function timecode(t: number, fps: number): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const s = Math.floor(t + 1e-6);
  const f = Math.min(Math.max(1, Math.round(fps)) - 1, Math.floor((t - s) * fps + 1e-6));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f)}`;
}
/** A percentage string like "37.500%" for `part / whole` (0 when whole is 0). */
export function percent(part: number, whole: number): string {
  return `${(whole > 0 ? (part / whole) * 100 : 0).toFixed(3)}%`;
}
/** Ruler ticks across a duration: 61 ticks, a long tick every tenth, a medium one every fifth. */
export function rulerTicks(): { left: string; h: number }[] {
  return Array.from({ length: 61 }, (_, i) => ({ left: `${((i / 60) * 100).toFixed(3)}%`, h: i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4 }));
}
/** Ruler labels at whole-second steps chosen so at most 7 labels show for the duration. */
export function rulerLabels(durationSeconds: number): { left: string; label: string; tf: string }[] {
  const step = Math.max(1, Math.ceil(durationSeconds / 6));
  const out: { left: string; label: string; tf: string }[] = [];
  for (let s = 0; s <= durationSeconds + 1e-9; s += step) {
    const last = s + step > durationSeconds + 1e-9;
    out.push({ left: percent(s, durationSeconds), label: `${s}s`, tf: last ? "translateX(calc(-100% - 4px))" : "translateX(4px)" });
  }
  return out;
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
