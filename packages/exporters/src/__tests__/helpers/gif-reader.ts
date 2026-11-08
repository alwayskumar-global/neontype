/**
 * Minimal hand-written GIF reader for tests only (Req 6, Property 7).
 *
 * NOT a general GIF decoder and NOT shipped: it parses the header, logical
 * screen descriptor, the NETSCAPE loop extension, and each frame's Graphic
 * Control Extension (delay + transparency flag) + Image Descriptor, skipping
 * pixel data via its LZW sub-block chain. No dependency is used.
 *
 * Structure (little-endian u16):
 *   "GIF89a" | LSD(7) | [GCT] | blocks...
 *   0x21 0xF9 -> Graphic Control Extension (delay cs, transparent flag)
 *   0x2C      -> Image Descriptor (+ optional LCT) + LZW min code size + subblocks
 *   0x21 0xFF -> Application Extension (NETSCAPE loop)
 *   0x3B      -> trailer
 */

export interface GifFrame {
  /** Delay in centiseconds (as stored in the GCE). */
  delayCentiseconds: number;
  /** Whether the frame's GCE sets the transparency flag. */
  transparent: boolean;
  /** Size of the active color table for this frame (global or local). */
  paletteSize: number;
}

export interface GifInfo {
  width: number;
  height: number;
  /** Global color table size (0 if none). */
  globalPaletteSize: number;
  /** Netscape loop count if present (0 = forever). */
  loopCount: number | null;
  frames: GifFrame[];
}

/** Parses a GIF into the summary the tests consume. */
export function parseGif(bytes: Uint8Array): GifInfo {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== "GIF89a" && sig !== "GIF87a") throw new Error(`not a GIF: ${sig}`);

  let p = 6;
  const width = dv.getUint16(p, true);
  const height = dv.getUint16(p + 2, true);
  const packed = bytes[p + 4];
  p += 7; // LSD is 7 bytes

  const gctFlag = (packed & 0x80) !== 0;
  const gctSize = gctFlag ? 1 << ((packed & 0x07) + 1) : 0;
  if (gctFlag) p += gctSize * 3;

  const frames: GifFrame[] = [];
  let loopCount: number | null = null;
  let pendingDelay = 0;
  let pendingTransparent = false;

  const skipSubBlocks = (): void => {
    for (;;) {
      const size = bytes[p++];
      if (size === 0) break;
      p += size;
    }
  };

  while (p < bytes.length) {
    const b = bytes[p++];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      // Extension.
      const label = bytes[p++];
      if (label === 0xf9) {
        // Graphic Control Extension: blockSize(1)=4, packed(1), delay(2), tIndex(1), term(1)
        const blockSize = bytes[p++];
        const gcePacked = bytes[p];
        const delay = dv.getUint16(p + 1, true);
        p += blockSize; // packed+delay+tIndex
        p++; // block terminator
        pendingDelay = delay;
        pendingTransparent = (gcePacked & 0x01) !== 0;
      } else if (label === 0xff) {
        // Application Extension (NETSCAPE loop).
        const blockSize = bytes[p++];
        const appId = String.fromCharCode(...bytes.subarray(p, p + blockSize));
        p += blockSize;
        if (appId.startsWith("NETSCAPE")) {
          const subSize = bytes[p++]; // 3
          // sub-block: 0x01, loopCount(2)
          loopCount = dv.getUint16(p + 1, true);
          p += subSize;
          p++; // terminator
        } else {
          skipSubBlocks();
        }
      } else {
        skipSubBlocks();
      }
    } else if (b === 0x2c) {
      // Image Descriptor: x,y,w,h (8 bytes) + packed(1)
      const idPacked = bytes[p + 8];
      p += 9;
      const lctFlag = (idPacked & 0x80) !== 0;
      const lctSize = lctFlag ? 1 << ((idPacked & 0x07) + 1) : 0;
      if (lctFlag) p += lctSize * 3;
      p++; // LZW minimum code size
      skipSubBlocks(); // image data sub-blocks
      frames.push({
        delayCentiseconds: pendingDelay,
        transparent: pendingTransparent,
        paletteSize: lctFlag ? lctSize : gctSize,
      });
      pendingDelay = 0;
      pendingTransparent = false;
    } else {
      // Unknown byte; stop to avoid runaway.
      break;
    }
  }

  return { width, height, globalPaletteSize: gctSize, loopCount, frames };
}
