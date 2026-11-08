/**
 * Minimal hand-written ZIP reader for tests only (Req 4, Property 5/6).
 *
 * NOT a general ZIP library and NOT shipped: it reads the End Of Central
 * Directory record and the Central Directory to list entries (name, CRC-32,
 * compression method, sizes) and, for STORED entries, returns the raw bytes.
 * No dependency is used. Assumes a non-ZIP64 archive (our exports are small).
 *
 * Record signatures (little-endian):
 *   EOCD:  0x06054b50
 *   CD hdr: 0x02014b50
 *   Local:  0x04034b50
 */

export interface ZipEntry {
  name: string;
  /** Stored CRC-32 from the central directory. */
  crc32: number;
  /** 0 = stored (no compression), 8 = deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Offset of the local file header. */
  localHeaderOffset: number;
}

export interface ZipListing {
  entries: ZipEntry[];
}

class LE {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u16(p: number): number {
    return this.view.getUint16(p, true);
  }
  u32(p: number): number {
    return this.view.getUint32(p, true);
  }
  str(p: number, len: number): string {
    return new TextDecoder().decode(this.bytes.subarray(p, p + len));
  }
}

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

/** Finds the End Of Central Directory record (scans backward from the end). */
function findEocd(r: LE): number {
  // EOCD is 22 bytes minimum; the comment is usually empty. Scan back a bit.
  for (let p = r.bytes.byteLength - 22; p >= 0; p--) {
    if (r.u32(p) === EOCD_SIG) return p;
  }
  throw new Error("no EOCD record (not a ZIP?)");
}

/** Lists the entries in a ZIP archive via its central directory. */
export function listZip(bytes: Uint8Array): ZipListing {
  const r = new LE(bytes);
  const eocd = findEocd(r);
  const total = r.u16(eocd + 10);
  let cd = r.u32(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < total; i++) {
    if (r.u32(cd) !== CD_SIG) throw new Error("bad central directory header");
    const method = r.u16(cd + 10);
    const crc32 = r.u32(cd + 16);
    const compressedSize = r.u32(cd + 20);
    const uncompressedSize = r.u32(cd + 24);
    const nameLen = r.u16(cd + 28);
    const extraLen = r.u16(cd + 30);
    const commentLen = r.u16(cd + 32);
    const localHeaderOffset = r.u32(cd + 42);
    const name = r.str(cd + 46, nameLen);
    entries.push({ name, crc32, method, compressedSize, uncompressedSize, localHeaderOffset });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return { entries };
}

/** Reads a STORED entry's raw bytes from its local header (throws if deflated). */
export function readStoredEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  if (entry.method !== 0) throw new Error(`entry ${entry.name} is not stored (method ${entry.method})`);
  const r = new LE(bytes);
  const lho = entry.localHeaderOffset;
  if (r.u32(lho) !== 0x04034b50) throw new Error("bad local file header");
  const nameLen = r.u16(lho + 26);
  const extraLen = r.u16(lho + 28);
  const dataStart = lho + 30 + nameLen + extraLen;
  return bytes.subarray(dataStart, dataStart + entry.uncompressedSize);
}

/** A reference CRC-32 (IEEE 802.3) over `bytes`, independent of client-zip. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let b = 0; b < 8; b++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
