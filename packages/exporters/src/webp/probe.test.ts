import { afterEach, describe, expect, it, vi } from "vitest";
import { probeStillWebpType } from "./probe.js";
/**
 * The still-WebP probe must request a 2D context BEFORE `convertToBlob`: a real OffscreenCanvas throws "no rendering
 * context" otherwise, which made the probe report WebP unsupported in every browser.
 */
function stubCanvas(type: string, opts: { requireContext?: boolean; throws?: boolean; noContext?: boolean } = {}): string[] {
  const calls: string[] = [];
  class Fake {
    private hasContext = false;
    getContext(id: string): unknown {
      calls.push(`getContext:${id}`);
      if (opts.noContext) return null;
      this.hasContext = true;
      return {};
    }
    async convertToBlob(o: { type: string }): Promise<{ type: string }> {
      calls.push(`convertToBlob:${o.type}`);
      if (opts.throws || (opts.requireContext !== false && !this.hasContext)) throw new Error("no rendering context");
      return { type };
    }
  }
  vi.stubGlobal("OffscreenCanvas", Fake);
  return calls;
}
afterEach(() => vi.unstubAllGlobals());
describe("probeStillWebpType", () => {
  it("asks for a 2D context first, then encodes image/webp, and returns the blob type", async () => {
    const calls = stubCanvas("image/webp");
    expect(await probeStillWebpType()).toBe("image/webp");
    expect(calls).toEqual(["getContext:2d", "convertToBlob:image/webp"]);
  });
  it("returns the fallback type when the browser cannot encode WebP (it hands back PNG)", async () => {
    stubCanvas("image/png");
    expect(await probeStillWebpType()).toBe("image/png");
  });
  it("returns null with no OffscreenCanvas, no 2D context, or an encode that throws", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    expect(await probeStillWebpType()).toBeNull();
    stubCanvas("image/webp", { noContext: true });
    expect(await probeStillWebpType()).toBeNull();
    stubCanvas("image/webp", { throws: true });
    expect(await probeStillWebpType()).toBeNull();
  });
});
