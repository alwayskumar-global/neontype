/**
 * Frame-interval performance instrument (Requirement 13). Lives only in the
 * shell (reads the animation clock). Records rAF timestamps over a window and
 * reports mean and p95 inter-frame interval (ms).
 */
export class FrameTimer {
  private readonly stamps: number[] = [];
  private rafId: number | null = null;

  /** Start sampling rAF timestamps. */
  start(): void {
    this.stamps.length = 0;
    const tick = (ts: number): void => {
      this.stamps.push(ts);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop sampling and return { mean, p95, count } of inter-frame intervals (ms). */
  stop(): { mean: number; p95: number; count: number } {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const intervals: number[] = [];
    for (let i = 1; i < this.stamps.length; i++) intervals.push(this.stamps[i] - this.stamps[i - 1]);
    if (intervals.length === 0) return { mean: 0, p95: 0, count: 0 };
    const sum = intervals.reduce((a, b) => a + b, 0);
    const sorted = [...intervals].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return { mean: sum / intervals.length, p95, count: intervals.length };
  }
}
