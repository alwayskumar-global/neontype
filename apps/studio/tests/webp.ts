/** A small reader for the top level of a WebP file, enough for the export specs to check the bytes they download. */
export interface WebpSummary {
  riff: boolean;
  webp: boolean;
  /** Top-level chunk ids in order. */
  chunks: string[];
  /** The VP8X flags byte, or null when there is no VP8X chunk. */
  vp8xFlags: number | null;
}
export const VP8X_ANIMATION = 0x02;
export const VP8X_ALPHA = 0x10;
const ascii = (b: Uint8Array, o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n));
export function summarizeWebp(bytes: Uint8Array): WebpSummary {
  const riff = bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF";
  const webp = riff && ascii(bytes, 8, 4) === "WEBP";
  const chunks: string[] = [];
  let vp8xFlags: number | null = null;
  let o = 12;
  while (webp && o + 8 <= bytes.byteLength) {
    const id = ascii(bytes, o, 4);
    const size = (bytes[o + 4]! | (bytes[o + 5]! << 8) | (bytes[o + 6]! << 16) | (bytes[o + 7]! << 24)) >>> 0;
    chunks.push(id);
    if (id === "VP8X" && vp8xFlags === null) vp8xFlags = bytes[o + 8] ?? null;
    o += 8 + size + (size & 1);
  }
  return { riff, webp, chunks, vp8xFlags };
}
