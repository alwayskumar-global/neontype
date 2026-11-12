/**
 * A strict hand-reader for animated WebP files, used by tests to parse the exporter's output back. It enforces the
 * container rules itself (RIFF size, even padding, chunk order) instead of trusting the writer.
 */
export interface Sub {
  id: string;
  size: number;
}
export interface ReadFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
  flags: number;
  blend: boolean;
  dispose: boolean;
  /** The chunks inside the frame, in order. */
  chunks: Sub[];
  /** The frame data bytes (after the 16-byte ANMF header), padding included. */
  data: Uint8Array;
}
export interface ReadWebp {
  fileLength: number;
  riffSize: number;
  vp8xFlags: number;
  animation: boolean;
  alpha: boolean;
  canvasWidth: number;
  canvasHeight: number;
  background: [number, number, number, number];
  loopCount: number;
  /** Top-level chunk ids in order. */
  topLevel: string[];
  frames: ReadFrame[];
}
const ascii = (b: Uint8Array, o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n));
const u16 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const u24 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
export function readAnimatedWebp(b: Uint8Array): ReadWebp {
  if (ascii(b, 0, 4) !== "RIFF") throw new Error("no RIFF");
  const riffSize = u32(b, 4);
  if (riffSize + 8 !== b.byteLength) throw new Error(`RIFF size ${riffSize} + 8 != file length ${b.byteLength}`);
  if (ascii(b, 8, 4) !== "WEBP") throw new Error("not WEBP");
  const top: { id: string; off: number; size: number }[] = [];
  let o = 12;
  while (o < b.byteLength) {
    if (o + 8 > b.byteLength) throw new Error("truncated chunk header");
    const id = ascii(b, o, 4);
    const size = u32(b, o + 4);
    const end = o + 8 + size + (size & 1);
    if (end > b.byteLength) throw new Error(`chunk ${id} overruns the file`);
    if (size & 1 && b[o + 8 + size] !== 0) throw new Error(`chunk ${id} pad byte is not zero`);
    top.push({ id, off: o, size });
    o = end;
  }
  if (top[0]?.id !== "VP8X" || top[0].size !== 10) throw new Error("first chunk must be VP8X (10 bytes)");
  if (top[1]?.id !== "ANIM" || top[1].size !== 6) throw new Error("second chunk must be ANIM (6 bytes)");
  const v = top[0].off + 8;
  const flags = b[v]!;
  const a = top[1].off + 8;
  const frames: ReadFrame[] = [];
  for (const c of top.slice(2)) {
    if (c.id !== "ANMF") throw new Error(`unexpected top-level chunk ${c.id}`);
    const p = c.off + 8;
    const flagsByte = b[p + 15]!;
    const dataStart = p + 16;
    const dataEnd = p + c.size;
    const chunks: Sub[] = [];
    let q = dataStart;
    while (q < dataEnd) {
      const id = ascii(b, q, 4);
      const size = u32(b, q + 4);
      const end = q + 8 + size + (size & 1);
      if (end > dataEnd) throw new Error(`frame chunk ${id} overruns its ANMF`);
      if (size & 1 && b[q + 8 + size] !== 0) throw new Error(`frame chunk ${id} pad byte is not zero`);
      chunks.push({ id, size });
      q = end;
    }
    frames.push({
      x: u24(b, p) * 2,
      y: u24(b, p + 3) * 2,
      width: u24(b, p + 6) + 1,
      height: u24(b, p + 9) + 1,
      durationMs: u24(b, p + 12),
      flags: flagsByte,
      blend: (flagsByte & 0x02) === 0,
      dispose: (flagsByte & 0x01) !== 0,
      chunks,
      data: b.slice(dataStart, dataEnd),
    });
  }
  return {
    fileLength: b.byteLength,
    riffSize,
    vp8xFlags: flags,
    animation: (flags & 0x02) !== 0,
    alpha: (flags & 0x10) !== 0,
    canvasWidth: u24(b, v + 4) + 1,
    canvasHeight: u24(b, v + 7) + 1,
    background: [b[a + 2]!, b[a + 1]!, b[a]!, b[a + 3]!],
    loopCount: u16(b, a + 4),
    topLevel: top.map((c) => c.id),
    frames,
  };
}
