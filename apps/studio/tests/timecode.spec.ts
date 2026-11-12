import { test, expect } from "@playwright/test";
import { frameFromTimecode, parseTimecode, totalFrames } from "./timecode.js";
/** Unit tests for the timecode helpers the other specs read the playhead with (pure; no browser page). */
test("parseTimecode reads mm:ss:ff", () => {
  expect(parseTimecode("00:00:00")).toEqual({ minutes: 0, seconds: 0, frameInSecond: 0 });
  expect(parseTimecode(" 01:07:23 ")).toEqual({ minutes: 1, seconds: 7, frameInSecond: 23 });
});
test("parseTimecode rejects other text", () => {
  for (const bad of ["", "frame 3 / 150 - 0.10s", "0:0:0", "00:00", "aa:bb:cc"]) expect(() => parseTimecode(bad), bad).toThrow();
});
test("frameFromTimecode is seconds times fps plus the frame in the second", () => {
  expect(frameFromTimecode("00:00:00", 30, 150)).toBe(0);
  expect(frameFromTimecode("00:01:00", 30, 150)).toBe(30);
  expect(frameFromTimecode("00:02:15", 30, 150)).toBe(75);
  expect(frameFromTimecode("01:00:00", 24, 100000)).toBe(1440);
});
test("frameFromTimecode caps at the last frame when the playhead is on the end", () => {
  expect(frameFromTimecode("00:05:00", 30, 150)).toBe(149);
  expect(frameFromTimecode("00:02:12", 24, 60)).toBe(59);
});
test("totalFrames rounds duration times fps", () => {
  expect(totalFrames(5, 30)).toBe(150);
  expect(totalFrames(2.5, 24)).toBe(60);
  expect(totalFrames(0.5, 30)).toBe(15);
});
