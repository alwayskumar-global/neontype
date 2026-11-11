import { describe, it, expect } from "vitest";

import { MP4_OPTION_DISPOSITION } from "./api.js";
import type { Mp4Options } from "./types.js";
import type { WorkerOptions } from "./worker/protocol.js";

/**
 * Zero silent drops (Req 2): every public Mp4Options field must have an explicit
 * disposition — forwarded to the worker, decoded on the main thread, or consumed
 * on the calling thread. The disposition map is keyed by `keyof Mp4Options`, so
 * a new unclassified option fails to COMPILE; these runtime checks additionally
 * guard that every "worker" field maps to a real WorkerOptions key and that no
 * field is left with a bogus disposition.
 */
describe("MP4 option disposition (no silent drops)", () => {
  // Every Mp4Options key is listed with a known disposition value.
  it("classifies every Mp4Options field", () => {
    // A value-level sample of every Mp4Options key. If a key is added to the
    // type without being added here, this object fails to type-check.
    const allKeys: Record<keyof Mp4Options, true> = {
      output: true,
      fonts: true,
      videoBitrate: true,
      backgroundFallback: true,
      addSilentTrack: true,
      audio: true,
      limits: true,
      signal: true,
      onProgress: true,
    };
    for (const key of Object.keys(allKeys) as (keyof Mp4Options)[]) {
      expect(MP4_OPTION_DISPOSITION[key]).toBeDefined();
      expect(["worker", "decoded-on-main", "main-thread"]).toContain(MP4_OPTION_DISPOSITION[key]);
    }
  });

  it("maps every 'worker'-disposition field to a real WorkerOptions key", () => {
    // The WorkerOptions keys that MP4 forwards into. audioPcm is the decoded
    // product of the 'decoded-on-main' audio field.
    const workerKeys: Record<keyof WorkerOptions, true> = {
      output: true,
      videoBitrate: true,
      backgroundFallback: true,
      quality: true,
      addSilentTrack: true,
      audioPcm: true,
      fonts: true,
    };
    for (const key of Object.keys(MP4_OPTION_DISPOSITION) as (keyof Mp4Options)[]) {
      if (MP4_OPTION_DISPOSITION[key] === "worker") {
        expect(workerKeys[key as keyof WorkerOptions], `${key} must exist in WorkerOptions`).toBe(true);
      }
    }
  });

  it("routes audio through decode-on-main", () => {
    expect(MP4_OPTION_DISPOSITION.audio).toBe("decoded-on-main");
  });
});
