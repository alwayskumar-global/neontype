/**
 * Audio decode for the optional MP4 AAC track (Req 2.6-2.10, Req 11).
 *
 * Decodes an imported, UNTRUSTED audio file into PCM on the main thread via
 * `OfflineAudioContext.decodeAudioData`. Three hard caps protect the tab:
 *   - the raw file is rejected before decode above 50 MB (52,428,800 bytes),
 *   - the decoded duration is rejected above 600 seconds,
 *   - the decoded PCM is rejected above 512 MB (536,870,912 bytes).
 * Every failure returns `audio-decode-failed` with buffers released and the
 * project unchanged, and the decoder can accept a subsequent request. Never
 * throws.
 */

import type { ExportError } from "../errors.js";
import { fail } from "../errors.js";

/** Untrusted-file size cap in bytes (50 MB). */
export const AUDIO_FILE_MAX_BYTES = 52_428_800;
/** Decoded-duration cap in seconds. */
export const AUDIO_DECODED_MAX_SECONDS = 600;
/** Decoded-PCM size cap in bytes (512 MB). */
export const AUDIO_DECODED_MAX_BYTES = 536_870_912;

/** Decoded PCM: per-channel Float32 sample data plus the sample rate. */
export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
  /** Frames per channel. */
  length: number;
}

/** A decode result: the PCM, or a typed failure (never throws). */
export type DecodeResult = { ok: true; audio: DecodedAudio } | { ok: false; error: ExportError };

/** The subset of an audio-context factory we need (injectable for tests). */
export type DecodeFn = (bytes: ArrayBuffer) => Promise<{
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}>;

/** Default decoder backed by `OfflineAudioContext.decodeAudioData`. */
function defaultDecode(): DecodeFn | null {
  const Ctx =
    (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ??
    (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctx) return null;
  return (bytes: ArrayBuffer) => {
    // A 1-frame context is enough; decodeAudioData ignores its rate for decode.
    const ctx = new Ctx(1, 1, 44100);
    return ctx.decodeAudioData(bytes);
  };
}

/**
 * Decodes untrusted audio bytes to PCM, enforcing the size/duration caps.
 * `decodeFn` is injectable so tests avoid a real `OfflineAudioContext`.
 */
export async function decodeAudio(
  bytes: Uint8Array,
  decodeFn: DecodeFn | null = defaultDecode(),
): Promise<DecodeResult> {
  if (bytes.byteLength > AUDIO_FILE_MAX_BYTES) {
    return { ok: false, error: toError(`audio file exceeds ${AUDIO_FILE_MAX_BYTES} bytes`) };
  }
  if (!decodeFn) {
    return { ok: false, error: toError("audio decoding is not available in this runtime") };
  }

  let decoded: Awaited<ReturnType<DecodeFn>>;
  try {
    // Pass a copy so the caller's buffer is never detached/transferred.
    decoded = await decodeFn(bytes.slice().buffer);
  } catch {
    return { ok: false, error: toError("audio could not be decoded") };
  }

  const durationSeconds = decoded.length / decoded.sampleRate;
  if (durationSeconds > AUDIO_DECODED_MAX_SECONDS) {
    return { ok: false, error: toError(`decoded audio exceeds ${AUDIO_DECODED_MAX_SECONDS} seconds`) };
  }
  const decodedBytes = decoded.numberOfChannels * decoded.length * 4;
  if (decodedBytes > AUDIO_DECODED_MAX_BYTES) {
    return { ok: false, error: toError(`decoded audio exceeds ${AUDIO_DECODED_MAX_BYTES} bytes`) };
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    // Copy out so nothing retains the decoder's internal buffers.
    channels.push(new Float32Array(decoded.getChannelData(c)));
  }
  return { ok: true, audio: { channels, sampleRate: decoded.sampleRate, length: decoded.length } };
}

function toError(message: string): ExportError {
  const r = fail("audio-decode-failed", message);
  return r.ok === false ? r.error : { code: "audio-decode-failed", message };
}
