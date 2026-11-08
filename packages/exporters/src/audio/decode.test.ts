import { describe, it, expect } from "vitest";

import {
  decodeAudio,
  AUDIO_FILE_MAX_BYTES,
  AUDIO_DECODED_MAX_SECONDS,
  type DecodeFn,
} from "./decode.js";

/** A fake decoded buffer with the given channels/rate/length. */
function fakeDecoded(numberOfChannels: number, sampleRate: number, length: number) {
  return {
    numberOfChannels,
    sampleRate,
    length,
    getChannelData: () => new Float32Array(length),
  };
}

describe("decodeAudio", () => {
  it("rejects a file above the 50 MB untrusted-file cap before decode", async () => {
    let decodeCalled = false;
    const decode: DecodeFn = async () => {
      decodeCalled = true;
      return fakeDecoded(2, 48000, 1);
    };
    const bytes = new Uint8Array(AUDIO_FILE_MAX_BYTES + 1);
    const r = await decodeAudio(bytes, decode);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("audio-decode-failed");
    expect(decodeCalled, "decode must not run for an oversize file").toBe(false);
  });

  it("rejects decoded audio longer than the 600s cap", async () => {
    const sampleRate = 48000;
    const length = (AUDIO_DECODED_MAX_SECONDS + 1) * sampleRate;
    const decode: DecodeFn = async () => fakeDecoded(1, sampleRate, length);
    const r = await decodeAudio(new Uint8Array(16), decode);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("audio-decode-failed");
  });

  it("rejects decoded PCM above the 512 MB cap", async () => {
    // 2 channels * length * 4 bytes > 512 MB, but duration under 600s.
    const sampleRate = 192000;
    const length = 500 * sampleRate; // 500s (< 600s duration cap)
    const decode: DecodeFn = async () => fakeDecoded(2, sampleRate, length);
    const bytes = 2 * length * 4;
    expect(bytes).toBeGreaterThan(536_870_912);
    const r = await decodeAudio(new Uint8Array(16), decode);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("audio-decode-failed");
  });

  it("returns audio-decode-failed (not a throw) when the decoder throws", async () => {
    const decode: DecodeFn = async () => {
      throw new Error("bad data");
    };
    const r = await decodeAudio(new Uint8Array(16), decode);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("audio-decode-failed");
  });

  it("returns audio-decode-failed when no decoder is available", async () => {
    const r = await decodeAudio(new Uint8Array(16), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("audio-decode-failed");
  });

  it("decodes within the caps and copies out per-channel PCM", async () => {
    const decode: DecodeFn = async () => fakeDecoded(2, 48000, 4800);
    const r = await decodeAudio(new Uint8Array(16), decode);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.audio.channels).toHaveLength(2);
      expect(r.audio.channels[0]).toHaveLength(4800);
      expect(r.audio.sampleRate).toBe(48000);
    }
  });
});
