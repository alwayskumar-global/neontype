/**
 * Capability detection (Req 3).
 *
 * Probes the WebCodecs encoders and a still-WebP canvas encode to build a
 * `CapabilityReport` BEFORE any export starts, so the UI offers only working
 * formats. Every probe is total: a reject, throw, unclassifiable result, or a
 * 2-second non-settle resolves to `unknown` and is never propagated. GIF is
 * always `supported` (no `VideoEncoder` needed); WebP is gated on a still-frame
 * `image/webp` probe; AAC is its own capability. Detection performs no encode
 * and issues no network request, and completes within 2 seconds.
 */

import type { CapabilityReport, CapabilityResult } from "./types.js";

/** Overall detection budget and per-probe non-settle bound (Req 3.10). */
export const DETECTION_TIMEOUT_MS = 2000;

/** Minimal shape of the WebCodecs encoder `isConfigSupported` statics we probe. */
interface ConfigProbe {
  isConfigSupported(config: unknown): Promise<{ supported?: boolean }>;
}

/** Injected environment so tests can supply mocked globals (Req 13.4). */
export interface CapabilityEnv {
  VideoEncoder?: ConfigProbe;
  AudioEncoder?: ConfigProbe;
  /** Probes a still `image/webp` encode; resolves the produced blob's type. */
  probeWebp?: () => Promise<string | null>;
  timeoutMs?: number;
}

const H264_CONFIG = { codec: "avc1.42001f", width: 1280, height: 720, bitrate: 2_000_000, framerate: 30 };
const VP9_ALPHA_CONFIG = { codec: "vp09.00.10.08", width: 1280, height: 720, bitrate: 2_000_000, framerate: 30, alpha: "keep" };
const AAC_CONFIG = { codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 };

function supported(): CapabilityResult {
  return { status: "supported" };
}
function unsupported(reason: string): CapabilityResult {
  return { status: "unsupported", reason };
}
function unknown(reason: string): CapabilityResult {
  return { status: "unknown", reason };
}

/** Races a promise against a timeout, resolving to a fallback on non-settle. */
function withTimeout<T>(p: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, timeoutMs);
    void p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      },
    );
  });
}

/** Probes one video/audio config to a `CapabilityResult` (never throws). */
async function probeConfig(
  encoder: ConfigProbe | undefined,
  config: unknown,
  absentReason: string,
  timeoutMs: number,
): Promise<CapabilityResult> {
  if (encoder === undefined) {
    return unsupported(absentReason);
  }
  const result = await withTimeout(
    (async (): Promise<CapabilityResult> => {
      try {
        const s = await encoder.isConfigSupported(config);
        if (s && s.supported === true) return supported();
        if (s && s.supported === false) return unsupported("config not supported");
        return unknown("unclassifiable isConfigSupported result");
      } catch {
        return unknown("isConfigSupported threw");
      }
    })(),
    unknown("isConfigSupported did not settle in time"),
    timeoutMs,
  );
  return result;
}

/**
 * Resolves the environment from injected overrides or the ambient globals.
 * Reading WebCodecs/OffscreenCanvas off `globalThis` keeps this safe in Node
 * (where they are absent) and in the browser/worker (where they are present).
 */
function resolveEnv(env: CapabilityEnv): Required<Pick<CapabilityEnv, "timeoutMs">> & CapabilityEnv {
  const g = globalThis as Record<string, unknown>;
  return {
    VideoEncoder: env.VideoEncoder ?? (g.VideoEncoder as ConfigProbe | undefined),
    AudioEncoder: env.AudioEncoder ?? (g.AudioEncoder as ConfigProbe | undefined),
    probeWebp: env.probeWebp ?? defaultWebpProbe,
    timeoutMs: env.timeoutMs ?? DETECTION_TIMEOUT_MS,
  };
}

/** Default still-WebP probe using `OffscreenCanvas.convertToBlob` when present. */
async function defaultWebpProbe(): Promise<string | null> {
  const g = globalThis as Record<string, unknown>;
  const OffscreenCanvasCtor = g.OffscreenCanvas as
    | (new (w: number, h: number) => { convertToBlob(opts: { type: string }): Promise<{ type: string }> })
    | undefined;
  if (OffscreenCanvasCtor === undefined) {
    return null;
  }
  try {
    const c = new OffscreenCanvasCtor(2, 2);
    const blob = await c.convertToBlob({ type: "image/webp" });
    return blob.type;
  } catch {
    return null;
  }
}

/** Probes still-WebP support to a `CapabilityResult` (Req 3.5). */
async function probeWebpCapability(
  probe: () => Promise<string | null>,
  timeoutMs: number,
): Promise<CapabilityResult> {
  return withTimeout(
    (async (): Promise<CapabilityResult> => {
      try {
        const type = await probe();
        if (type === "image/webp") return supported();
        return unsupported("still image/webp encode unavailable");
      } catch {
        return unsupported("still image/webp probe threw");
      }
    })(),
    unknown("webp probe did not settle in time"),
    timeoutMs,
  );
}

/**
 * Detects export capabilities (Req 3). Pass `env` to inject mocked globals in
 * tests; by default the ambient `VideoEncoder`/`AudioEncoder`/`OffscreenCanvas`
 * are used.
 */
export async function detectCapabilities(env: CapabilityEnv = {}): Promise<CapabilityReport> {
  const resolved = resolveEnv(env);
  const timeoutMs = resolved.timeoutMs;

  // The VP9-alpha and WebP probes are kept but their results are NOT reported:
  // both formats are deferred (not shipped in this release), so the report
  // always marks them unsupported regardless of the runtime probe (see
  // src/formats/deferred.ts and the README "Not in this release" section).
  const [mp4, , aac] = await Promise.all([
    probeConfig(resolved.VideoEncoder, H264_CONFIG, "VideoEncoder is unavailable", timeoutMs),
    probeConfig(resolved.VideoEncoder, VP9_ALPHA_CONFIG, "VideoEncoder is unavailable", timeoutMs),
    probeConfig(resolved.AudioEncoder, AAC_CONFIG, "AudioEncoder is unavailable", timeoutMs),
    probeWebpCapability(resolved.probeWebp!, timeoutMs),
  ]);

  const deferred = (format: string): CapabilityResult => ({
    status: "unsupported",
    reason: `${format} export is not available in this release`,
  });

  // GIF, PNG sequence, and embed never require a WebCodecs encoder (Req 3.3, 3.4).
  return {
    mp4,
    webmAlpha: deferred("WebM (VP9 alpha)"),
    aac,
    webp: deferred("animated WebP"),
    gif: supported(),
    pngSequence: supported(),
    embed: supported(),
  };
}
