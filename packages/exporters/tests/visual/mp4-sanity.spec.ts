import { test, expect } from "@playwright/test";

import { parseMp4 } from "../../src/__tests__/helpers/mp4-box-reader.js";

/**
 * MP4 real-encode + muxer sanity (Req 2, Req 13.1, 13.7-13.10).
 *
 * The PRIMARY path runs end-to-end through the WORKER (exportMp4 decodes audio
 * on the main thread, then dispatchExport -> worker-entry muxes) in bundled
 * Chromium over the localhost harness (a secure context, so WebCodecs is
 * available). The produced MP4 is parsed by the hand-written box reader. Audio
 * is decoded on the main thread and transferred to the worker as PCM.
 */

declare global {
  interface Window {
    runMp4Export: (mode: "none" | "exact" | "short" | "long" | "silent") => Promise<{
      ok: boolean;
      code?: string;
      bytes: number[];
      summary?: { width: number; height: number; fps: number; frameCount: number; notes: string[] };
    }>;
    runMp4AudioUnsupported: () => Promise<{ ok: boolean; code?: string }>;
  }
}

const FPS = 12;
const DURATION = 1;
const EXPECTED_FRAMES = Math.round(DURATION * FPS);

/** Seconds of a track from its box-reader units/timescale. */
function trackSeconds(t: { durationUnits: number; timescale: number } | undefined): number {
  if (!t || t.timescale === 0) return 0;
  return t.durationUnits / t.timescale;
}

test("MP4 (H.264) real-encode via the worker: frames, duration, codec", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.runMp4Export === "function");

  const r = await page.evaluate(() => window.runMp4Export("none"));
  expect(r.ok, `export failed: ${r.code ?? ""}`).toBe(true);
  expect(r.bytes.length).toBeGreaterThan(0);
  expect(r.summary?.frameCount).toBe(EXPECTED_FRAMES);

  const info = parseMp4(Uint8Array.from(r.bytes));
  expect(Math.abs(info.durationSeconds - DURATION)).toBeLessThanOrEqual(1 / FPS + 1e-3);
  const video = info.tracks.find((t) => t.handler === "vide");
  expect(video?.codec).toBe("avc1");
  expect(video?.sampleCount).toBe(EXPECTED_FRAMES);
});

for (const mode of ["exact", "short", "long", "silent"] as const) {
  test(`MP4 with ${mode} audio via the worker has an AAC track within one audio frame`, async ({
    page,
  }) => {
    await page.goto("http://localhost:5273/");
    await page.waitForFunction(() => typeof window.runMp4Export === "function");

    const r = await page.evaluate((m) => window.runMp4Export(m), mode);
    expect(r.ok, `export failed: ${r.code ?? ""}`).toBe(true);

    const info = parseMp4(Uint8Array.from(r.bytes));
    const video = info.tracks.find((t) => t.handler === "vide");
    const audio = info.tracks.find((t) => t.handler === "soun");
    expect(video?.codec).toBe("avc1");
    expect(audio, "an audio track exists").toBeTruthy();
    expect(audio?.codec).toBe("mp4a");

    // The audio-track timescale is the sample rate the muxer was configured
    // with (mp4-muxer uses the audio sample rate as the track timescale). It
    // must be the rate the decoder/encoder/muxer all used consistently — a
    // standard audio rate (OfflineAudioContext decoded our WAV at 44.1 kHz).
    const sampleRate = audio?.timescale ?? 0;
    expect([44100, 48000]).toContain(sampleRate);

    // With the project end-trim applied, the AAC track duration is within ONE
    // AAC frame (+1 ms) of the project duration, and never shorter than the
    // project duration minus one AAC frame.
    const audioSeconds = trackSeconds(audio);
    const oneAudioFrame = 1024 / sampleRate;
    expect(Math.abs(audioSeconds - DURATION)).toBeLessThanOrEqual(oneAudioFrame + 0.001);
    expect(audioSeconds).toBeGreaterThanOrEqual(DURATION - oneAudioFrame);
  });
}

test("requesting audio when AAC is unsupported returns browser-unsupported (never ok-without-audio)", async ({
  page,
}) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.runMp4AudioUnsupported === "function");
  const r = await page.evaluate(() => window.runMp4AudioUnsupported());
  expect(r.ok).toBe(false);
  expect(r.code).toBe("browser-unsupported");
});
