/**
 * The still-WebP probe shared by the capability report (Req 3.5) and the WebP exporter (Req 7.5): encode a tiny
 * canvas as image/webp and report the Blob type the browser produced.
 *
 * `OffscreenCanvas.convertToBlob` throws "no rendering context" until a context has been requested, so the probe
 * calls `getContext("2d")` first. A browser that cannot encode WebP falls back to PNG, so the type tells.
 */
export async function probeStillWebpType(): Promise<string | null> {
  const g = globalThis as Record<string, unknown>;
  const Ctor = g.OffscreenCanvas as
    | (new (w: number, h: number) => { getContext(id: "2d"): unknown; convertToBlob(opts: { type: string }): Promise<{ type: string }> })
    | undefined;
  if (Ctor === undefined) return null;
  try {
    const canvas = new Ctor(2, 2);
    if (!canvas.getContext("2d")) return null;
    return (await canvas.convertToBlob({ type: "image/webp" })).type;
  } catch {
    return null;
  }
}
