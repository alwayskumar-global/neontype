/**
 * Hand-written animated-WebP RIFF container (Req 7). No WebP encoder package: each frame is a still WebP
 * produced by the browser (`convertToBlob('image/webp')`), and this module only rearranges bytes.
 *
 * Layout (https://developers.google.com/speed/webp/docs/riff_container):
 *   "RIFF" <u32 size> "WEBP"
 *     "VP8X" (10)  flags (animation 0x02, alpha 0x10), 24-bit canvas width-1 and height-1
 *     "ANIM" (6)   background colour B,G,R,A and a 16-bit loop count (0 = forever)
 *     "ANMF" (16 + frame data) per frame: 24-bit X/2, Y/2, width-1, height-1, duration (ms), a flags byte,
 *                  then the frame's [ALPH] + VP8 or VP8L chunks, copied whole from the still
 * Every chunk payload is padded to an even length with one zero byte (the size field excludes the pad).
 * All integers are little-endian. Pure: no clock, no randomness, no DOM.
 */
/** A malformed still WebP, or a value that does not fit the container. */
export class WebpFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebpFormatError";
  }
}
export const VP8X_ANIMATION = 0x02;
export const VP8X_ALPHA = 0x10;
/** ANMF flags: bit 1 = do not blend (the frame replaces the pixels it covers), bit 0 = dispose to background. */
export const ANMF_NO_BLEND = 0x02;
const U24_MAX = 0xffffff;
const U32_MAX = 0xffffffff;
const enc = new TextEncoder();
const dec = new TextDecoder("latin1");
const fourcc = (s: string): Uint8Array => enc.encode(s);
function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u24(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}
function readU32(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
/** A whole chunk: fourcc, u32 payload size, payload, and a zero pad byte when the size is odd. */
export function chunk(id: string, payload: Uint8Array): Uint8Array {
  if (id.length !== 4) throw new WebpFormatError(`chunk id must be 4 characters: ${id}`);
  if (payload.byteLength > U32_MAX) throw new WebpFormatError("chunk payload does not fit a 32-bit size");
  const pad = payload.byteLength & 1;
  const out = new Uint8Array(8 + payload.byteLength + pad);
  out.set(fourcc(id), 0);
  out.set(u32(payload.byteLength), 4);
  out.set(payload, 8);
  return out;
}
function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}
/**
 * Frame durations in milliseconds that sum EXACTLY to `totalMs`. Frame `i` lasts
 * `floor((i+1)*totalMs/N) - floor(i*totalMs/N)`: integer arithmetic only, so the rounding remainder is spread
 * across the frames deterministically and the telescoping sum is `totalMs`.
 */
export function frameDurationsMs(frameCount: number, totalMs: number): number[] {
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new WebpFormatError("frameCount must be a positive integer");
  if (!Number.isInteger(totalMs) || totalMs < 0) throw new WebpFormatError("totalMs must be a non-negative integer");
  const boundary = (i: number): number => {
    const product = i * totalMs;
    return (product - (product % frameCount)) / frameCount;
  };
  const out: number[] = [];
  for (let i = 0; i < frameCount; i++) out.push(boundary(i + 1) - boundary(i));
  return out;
}
/** The parts of a still WebP that go into an animation frame. */
export interface StillParts {
  /** The whole ALPH chunk (header and pad), or null. */
  alph: Uint8Array | null;
  /** The whole VP8 or VP8L chunk (header and pad). */
  image: Uint8Array;
  kind: "VP8" | "VP8L";
  width: number;
  height: number;
  /** Whether the still carries alpha: an ALPH chunk, the VP8X alpha flag, or VP8L's alpha_is_used bit. */
  hasAlpha: boolean;
}
function bitstreamSize(kind: "VP8" | "VP8L", payload: Uint8Array): { width: number; height: number; lossless: boolean } {
  if (kind === "VP8") {
    // 3-byte frame tag, start code 9d 01 2a, then 14-bit width and height (+ 2 scale bits each).
    if (payload.byteLength < 10 || payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) {
      throw new WebpFormatError("VP8 chunk has no key-frame start code");
    }
    return { width: (payload[6]! | (payload[7]! << 8)) & 0x3fff, height: (payload[8]! | (payload[9]! << 8)) & 0x3fff, lossless: false };
  }
  if (payload.byteLength < 5 || payload[0] !== 0x2f) throw new WebpFormatError("VP8L chunk has no signature");
  const bits = readU32(payload, 1);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, lossless: true };
}
/**
 * Splits a still WebP file (as `convertToBlob('image/webp')` produces: simple lossy or lossless, or extended
 * with VP8X + ALPH) into the chunks an ANMF frame needs. The still's own RIFF wrapper is dropped, never nested.
 */
export function parseStillWebp(bytes: Uint8Array): StillParts {
  if (bytes.byteLength < 20) throw new WebpFormatError("still WebP is too short");
  if (dec.decode(bytes.subarray(0, 4)) !== "RIFF" || dec.decode(bytes.subarray(8, 12)) !== "WEBP") {
    throw new WebpFormatError("still WebP is not a RIFF/WEBP file");
  }
  const declared = readU32(bytes, 4) + 8;
  if (declared > bytes.byteLength + 1) throw new WebpFormatError("still WebP RIFF size exceeds the file");
  const end = Math.min(declared, bytes.byteLength);
  let o = 12;
  let alph: Uint8Array | null = null;
  let image: Uint8Array | null = null;
  let kind: "VP8" | "VP8L" | null = null;
  let size = { width: 0, height: 0, lossless: false };
  let vp8xAlpha = false;
  while (o + 8 <= end) {
    const id = dec.decode(bytes.subarray(o, o + 4));
    const len = readU32(bytes, o + 4);
    const payloadEnd = o + 8 + len;
    if (payloadEnd > bytes.byteLength) throw new WebpFormatError(`chunk ${id} runs past the end of the file`);
    const whole = (): Uint8Array => {
      const out = new Uint8Array(8 + len + (len & 1));
      out.set(bytes.subarray(o, payloadEnd), 0);
      return out;
    };
    if (id === "VP8X") {
      vp8xAlpha = (bytes[o + 8]! & VP8X_ALPHA) !== 0;
    } else if (id === "ALPH") {
      alph = whole();
    } else if (id === "VP8 " || id === "VP8L") {
      kind = id === "VP8L" ? "VP8L" : "VP8";
      image = whole();
      size = bitstreamSize(kind, bytes.subarray(o + 8, payloadEnd));
      break;
    }
    o = payloadEnd + (len & 1);
  }
  if (image === null || kind === null) throw new WebpFormatError("still WebP has no VP8 or VP8L image chunk");
  return { alph, image, kind, width: size.width, height: size.height, hasAlpha: alph !== null || vp8xAlpha || (size.lossless && (bytes[o + 8 + 4]! & 0x10) !== 0) };
}
/** One animation frame: the still's chunks and how long it shows. */
export interface AnimFrame {
  /** The frame's [ALPH] + VP8/VP8L chunks, whole. */
  data: Uint8Array;
  width: number;
  height: number;
  durationMs: number;
}
export interface AnimOptions {
  width: number;
  height: number;
  /** Sets the VP8X alpha flag. Set it only for a transparent background. */
  alpha: boolean;
  /** ANIM background colour as [r, g, b, a]. */
  background?: readonly [number, number, number, number];
  /** 0 = loop forever. */
  loopCount?: number;
}
/** Builds the animated WebP file. */
export function buildAnimatedWebp(frames: readonly AnimFrame[], opts: AnimOptions): Uint8Array {
  if (frames.length === 0) throw new WebpFormatError("an animation needs at least one frame");
  const { width, height } = opts;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > U24_MAX + 1 || height > U24_MAX + 1) {
    throw new WebpFormatError(`canvas ${width}x${height} does not fit 24-bit dimensions`);
  }
  const vp8x = chunk("VP8X", Uint8Array.from([VP8X_ANIMATION | (opts.alpha ? VP8X_ALPHA : 0), 0, 0, 0, ...u24(width - 1), ...u24(height - 1)]));
  const [r, g, b, a] = opts.background ?? [0, 0, 0, 0];
  const anim = chunk("ANIM", Uint8Array.from([b, g, r, a, ...u16(opts.loopCount ?? 0)]));
  const parts: Uint8Array[] = [vp8x, anim];
  for (const [i, f] of frames.entries()) {
    if (f.width !== width || f.height !== height) throw new WebpFormatError(`frame ${i} is ${f.width}x${f.height}, expected ${width}x${height}`);
    if (!Number.isInteger(f.durationMs) || f.durationMs < 0 || f.durationMs > U24_MAX) throw new WebpFormatError(`frame ${i} duration ${f.durationMs} ms does not fit 24 bits`);
    const header = Uint8Array.from([...u24(0), ...u24(0), ...u24(f.width - 1), ...u24(f.height - 1), ...u24(f.durationMs), ANMF_NO_BLEND]);
    parts.push(chunk("ANMF", concat([header, f.data])));
  }
  const body = concat(parts);
  const riffSize = 4 + body.byteLength;
  if (riffSize > U32_MAX) throw new WebpFormatError("animation is larger than 4 GiB");
  return concat([fourcc("RIFF"), Uint8Array.from(u32(riffSize)), fourcc("WEBP"), body]);
}
