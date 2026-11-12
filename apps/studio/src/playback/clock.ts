/**
 * The playback clock (Requirement 1). The ONLY place in the app that reads the
 * animation clock (requestAnimationFrame / performance.now). It advances a
 * current time from real elapsed time, supports play/pause/loop/scrub, and calls
 * a per-frame tick with the current time; the preview draws from the tick.
 */

/** Pure loop-wrap: wrap t into [0, duration] when looping, else clamp. */
export function wrapTime(t: number, durationSeconds: number, loop: boolean): number {
  if (durationSeconds <= 0) return 0;
  if (loop) {
    const m = t % durationSeconds;
    return m < 0 ? m + durationSeconds : m;
  }
  return Math.max(0, Math.min(durationSeconds, t));
}

export interface ClockOptions {
  /** Called once per frame with the current time (seconds). */
  onTick: (t: number) => void;
  /** Current project duration (seconds); read fresh each frame. */
  getDuration: () => number;
  /** Whether looping is enabled; read fresh each frame. */
  getLoop: () => boolean;
  /** Called when playback starts (true) or stops (false); not called for a repeated play or pause. */
  onPlayingChange?: (playing: boolean) => void;
}

/** A playback clock controlling preview time. */
export class PlaybackClock {
  private readonly opts: ClockOptions;
  private rafId: number | null = null;
  private lastTs = 0;
  private current = 0;
  private playing = false;

  constructor(opts: ClockOptions) {
    this.opts = opts;
  }

  get time(): number {
    return this.current;
  }
  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.opts.onPlayingChange?.(true);
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  pause(): void {
    const was = this.playing;
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (was) this.opts.onPlayingChange?.(false);
  }

  /** Jump to a specific time (scrub); clamps to [0, duration]; does not play. */
  seek(t: number): void {
    this.current = wrapTime(t, this.opts.getDuration(), false);
    this.opts.onTick(this.current);
  }

  dispose(): void {
    this.pause();
  }

  private readonly frame = (ts: number): void => {
    if (!this.playing) return;
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    this.current = wrapTime(this.current + dt, this.opts.getDuration(), this.opts.getLoop());
    this.opts.onTick(this.current);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
