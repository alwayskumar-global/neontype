/**
 * Unit tests for capability detection (Task 2.3) using mocked encoders.
 */

import { describe, it, expect } from "vitest";

import { detectCapabilities, type CapabilityEnv } from "./capabilities.js";

/** A mock encoder whose isConfigSupported resolves `supported`. */
function okEncoder() {
  return { isConfigSupported: async () => ({ supported: true }) };
}
/** A mock encoder whose isConfigSupported resolves `unsupported`. */
function noEncoder() {
  return { isConfigSupported: async () => ({ supported: false }) };
}
/** A mock encoder whose isConfigSupported rejects. */
function throwingEncoder() {
  return { isConfigSupported: async () => { throw new Error("boom"); } };
}
/** A mock encoder whose isConfigSupported never settles. */
function hangingEncoder() {
  return { isConfigSupported: () => new Promise<{ supported?: boolean }>(() => {}) };
}

const webpOk = async () => "image/webp";
const webpNo = async () => "image/png";

describe("detectCapabilities — supported", () => {
  it("reports supported codecs as supported and GIF/PNG/embed always available", async () => {
    const env: CapabilityEnv = { VideoEncoder: okEncoder(), AudioEncoder: okEncoder(), probeWebp: webpOk };
    const r = await detectCapabilities(env);
    expect(r.mp4.status).toBe("supported");
    expect(r.webmAlpha.status).toBe("supported");
    expect(r.aac.status).toBe("supported");
    expect(r.webp.status).toBe("supported");
    expect(r.gif.status).toBe("supported");
    expect(r.pngSequence.status).toBe("supported");
    expect(r.embed.status).toBe("supported");
  });
});

describe("detectCapabilities — unsupported", () => {
  it("maps supported:false to unsupported", async () => {
    const env: CapabilityEnv = { VideoEncoder: noEncoder(), AudioEncoder: noEncoder(), probeWebp: webpNo };
    const r = await detectCapabilities(env);
    expect(r.mp4.status).toBe("unsupported");
    expect(r.webmAlpha.status).toBe("unsupported");
    expect(r.aac.status).toBe("unsupported");
    expect(r.webp.status).toBe("unsupported");
    // GIF/PNG/embed stay supported regardless.
    expect(r.gif.status).toBe("supported");
    expect(r.pngSequence.status).toBe("supported");
  });
});

describe("detectCapabilities — unknown", () => {
  it("maps a throwing probe to unknown", async () => {
    const env: CapabilityEnv = { VideoEncoder: throwingEncoder(), AudioEncoder: throwingEncoder(), probeWebp: webpOk };
    const r = await detectCapabilities(env);
    expect(r.mp4.status).toBe("unknown");
    expect(r.aac.status).toBe("unknown");
  });

  it("maps a hanging probe to unknown via the timeout", async () => {
    const env: CapabilityEnv = { VideoEncoder: hangingEncoder(), AudioEncoder: hangingEncoder(), probeWebp: webpOk, timeoutMs: 20 };
    const r = await detectCapabilities(env);
    expect(r.mp4.status).toBe("unknown");
    expect(r.webmAlpha.status).toBe("unknown");
    expect(r.aac.status).toBe("unknown");
  });
});

describe("detectCapabilities — VideoEncoder/AudioEncoder absent", () => {
  it("marks MP4 and WebM-alpha unsupported while GIF/PNG/embed stay available", async () => {
    // No VideoEncoder/AudioEncoder injected and none on globalThis in Node.
    const env: CapabilityEnv = { probeWebp: webpNo };
    const r = await detectCapabilities(env);
    expect(r.mp4.status).toBe("unsupported");
    expect(r.webmAlpha.status).toBe("unsupported");
    expect(r.aac.status).toBe("unsupported");
    expect(r.gif.status).toBe("supported");
    expect(r.pngSequence.status).toBe("supported");
    expect(r.embed.status).toBe("supported");
  });
});
