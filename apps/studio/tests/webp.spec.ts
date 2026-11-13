import { test, expect } from "@playwright/test";
import { summarizeWebp, VP8X_ALPHA, VP8X_ANIMATION } from "./webp.js";
/** Unit tests for the WebP reader the export specs use (pure; no browser page). */
const chunk = (id: string, payload: number[]): number[] => {
  const size = payload.length;
  return [...[...id].map((c) => c.charCodeAt(0)), size & 255, (size >> 8) & 255, 0, 0, ...payload, ...(size & 1 ? [0] : [])];
};
const file = (chunks: number[][]): Uint8Array => {
  const body = [...[..."WEBP"].map((c) => c.charCodeAt(0)), ...chunks.flat()];
  return Uint8Array.from([...[..."RIFF"].map((c) => c.charCodeAt(0)), body.length & 255, (body.length >> 8) & 255, 0, 0, ...body]);
};
test("reads the chunk ids and the VP8X flags", () => {
  const bytes = file([chunk("VP8X", [VP8X_ANIMATION | VP8X_ALPHA, 0, 0, 0, 0, 0, 0, 0, 0, 0]), chunk("ANIM", [0, 0, 0, 0, 0, 0]), chunk("ANMF", [1, 2, 3]), chunk("ANMF", [4])]);
  const s = summarizeWebp(bytes);
  expect([s.riff, s.webp]).toEqual([true, true]);
  expect(s.chunks).toEqual(["VP8X", "ANIM", "ANMF", "ANMF"]);
  expect(s.vp8xFlags! & VP8X_ANIMATION).toBe(VP8X_ANIMATION);
  expect(s.vp8xFlags! & VP8X_ALPHA).toBe(VP8X_ALPHA);
});
test("a flagless VP8X has neither flag, and other bytes are not a WebP", () => {
  const s = summarizeWebp(file([chunk("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]));
  expect(s.vp8xFlags).toBe(0);
  expect(summarizeWebp(Uint8Array.from([1, 2, 3])).webp).toBe(false);
  expect(summarizeWebp(Uint8Array.from([..."RIFF....WAVE"].map((c) => c.charCodeAt(0)))).webp).toBe(false);
});
