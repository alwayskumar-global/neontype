import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  trimOrPad,
  silentTrack,
  targetLength,
  AAC_FRAME_SAMPLES,
} from "./trim-pad.js";
import type { DecodedAudio } from "./decode.js";

/** A decoded track of `length` frames at `sampleRate`, one channel of ramp data. */
function track(length: number, sampleRate: number, channels = 1): DecodedAudio {
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const d = new Float32Array(length);
    for (let i = 0; i < length; i++) d[i] = ((i % 100) / 100) * (c + 1);
    chans.push(d);
  }
  return { channels: chans, sampleRate, length };
}

describe("trimOrPad", () => {
  it("pads with silence when short by more than one audio frame", () => {
    const sr = 48000;
    const dur = 1; // target 48000
    const short = track(48000 - 3 * AAC_FRAME_SAMPLES, sr);
    const out = trimOrPad(short, dur);
    expect(out.length).toBe(targetLength(dur, sr));
    // The padded tail is silence.
    expect(out.channels[0][out.length - 1]).toBe(0);
  });

  it("truncates when long by more than one audio frame", () => {
    const sr = 48000;
    const dur = 1;
    const long = track(48000 + 3 * AAC_FRAME_SAMPLES, sr);
    const out = trimOrPad(long, dur);
    expect(out.length).toBe(targetLength(dur, sr));
  });

  it("leaves the track unchanged when within one audio frame of target", () => {
    const sr = 48000;
    const dur = 1;
    const near = track(48000 + AAC_FRAME_SAMPLES - 1, sr);
    const out = trimOrPad(near, dur);
    expect(out).toBe(near); // identity: unchanged
  });

  it("preserves the leading samples when trimming/padding", () => {
    const sr = 48000;
    const dur = 1;
    const long = track(60000, sr);
    const out = trimOrPad(long, dur);
    for (let i = 0; i < 100; i++) expect(out.channels[0][i]).toBe(long.channels[0][i]);
  });
});

describe("silentTrack", () => {
  it("produces an all-zero track of exactly the target length", () => {
    const sr = 48000;
    const dur = 2;
    const s = silentTrack(dur, sr, 2);
    expect(s.length).toBe(targetLength(dur, sr));
    expect(s.channels).toHaveLength(2);
    expect(s.channels[0].every((v) => v === 0)).toBe(true);
  });
});

// Feature: exporters, Property 8: AAC track length equals durationSeconds
describe("Property 8: AAC track length equals durationSeconds", () => {
  it("trimmed/padded length equals target within one audio frame, for any input", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 600, noNaN: true }),
        fc.constantFrom(44100, 48000),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: -5, max: 5 }),
        (durationSeconds, sampleRate, frameDelta, subFrame) => {
          const target = targetLength(durationSeconds, sampleRate);
          // Build an input whose length deviates from target by frameDelta
          // audio frames (+/-) plus a sub-frame offset.
          const rawLength = Math.max(0, target + frameDelta * AAC_FRAME_SAMPLES + subFrame);
          const input = track(rawLength, sampleRate);
          const out = trimOrPad(input, durationSeconds);
          // The result length must equal the target within one audio frame.
          expect(Math.abs(out.length - target)).toBeLessThanOrEqual(AAC_FRAME_SAMPLES);
        },
      ),
      { numRuns: 200 },
    );
  });
});
