/**
 * Audio trim / pad to the export duration (Req 2.7-2.9, Property 8).
 *
 * The encoded AAC track length must equal `durationSeconds`. Decoded PCM is:
 *   - padded with silence when short by MORE than one audio frame,
 *   - truncated when long by MORE than one audio frame,
 *   - left unchanged when within one audio frame of the target.
 * `addSilentTrack` produces an all-silence track of exactly the target length.
 * "One audio frame" is the AAC frame of 1024 samples per channel. Pure data in,
 * data out; deterministic; no wall-clock.
 */

import type { DecodedAudio } from "./decode.js";

/** Samples per channel in one AAC frame. */
export const AAC_FRAME_SAMPLES = 1024;

/** The target length in frames for a duration at a sample rate. */
export function targetLength(durationSeconds: number, sampleRate: number): number {
  return Math.round(durationSeconds * sampleRate);
}

/**
 * Trims or pads `audio` so its per-channel length equals `targetLength`
 * (within one AAC frame it is left unchanged, per Req 2.9). Returns a new
 * `DecodedAudio`; the input is not mutated.
 */
export function trimOrPad(audio: DecodedAudio, durationSeconds: number): DecodedAudio {
  const target = targetLength(durationSeconds, audio.sampleRate);
  const delta = target - audio.length;
  // Within one audio frame: leave unchanged (Req 2.9).
  if (Math.abs(delta) <= AAC_FRAME_SAMPLES) {
    return audio;
  }
  const newLength = target;
  const channels = audio.channels.map((src) => {
    const out = new Float32Array(newLength);
    const copyLen = Math.min(src.length, newLength);
    out.set(src.subarray(0, copyLen), 0);
    // Remaining samples (if padding) are already 0 (silence).
    return out;
  });
  return { channels, sampleRate: audio.sampleRate, length: newLength };
}

/**
 * Builds an all-silence track of exactly the target length for `addSilentTrack`
 * (Req 2.10). Mono by default; channel count is explicit.
 */
export function silentTrack(
  durationSeconds: number,
  sampleRate: number,
  numberOfChannels = 1,
): DecodedAudio {
  const length = targetLength(durationSeconds, sampleRate);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) {
    channels.push(new Float32Array(length));
  }
  return { channels, sampleRate, length };
}
