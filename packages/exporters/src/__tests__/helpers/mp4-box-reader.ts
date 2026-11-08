/**
 * Minimal hand-written MP4 (ISO BMFF) box reader for tests only (Req 13.1).
 *
 * NOT a general MP4 parser and NOT shipped: it walks the box tree just far
 * enough to verify what the muxer sanity + real-encode tests assert — the movie
 * duration, each track's handler type and codec, and a per-track sample count.
 * No dependency is used (the design explicitly forbids an MP4 parser package).
 *
 * Box layout: [4-byte big-endian size][4-byte type][payload]. A size of 1 means
 * a 64-bit size follows the type; size 0 means "to end of file". Container
 * boxes (moov, trak, mdia, minf, stbl, mvex, edts) hold child boxes; we recurse
 * into the ones we need.
 */

/** A parsed track summary. */
export interface TrackInfo {
  /** Handler type: "vide" (video), "soun" (audio), or other. */
  handler: string;
  /** Sample-entry codec fourcc, e.g. "avc1" or "mp4a". */
  codec: string;
  /** Number of samples (frames) in the track, from stsz/stz2. */
  sampleCount: number;
  /** Track timescale (units per second), from mdhd. */
  timescale: number;
  /** Track duration in timescale units, from mdhd. */
  durationUnits: number;
}

/** The parsed MP4 summary the tests consume. */
export interface Mp4Info {
  /** Movie timescale from mvhd. */
  movieTimescale: number;
  /** Movie duration in movie-timescale units from mvhd. */
  movieDurationUnits: number;
  /** Movie duration in seconds. */
  durationSeconds: number;
  tracks: TrackInfo[];
}

class Reader {
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u32(pos: number): number {
    return this.view.getUint32(pos);
  }
  u64(pos: number): number {
    const hi = this.view.getUint32(pos);
    const lo = this.view.getUint32(pos + 4);
    return hi * 2 ** 32 + lo;
  }
  str(pos: number, len: number): string {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.bytes[pos + i]);
    return s;
  }
  get length(): number {
    return this.bytes.byteLength;
  }
}

interface Box {
  type: string;
  start: number; // payload start
  end: number; // exclusive
}

/** Iterates the boxes in `[from, to)`, returning each box's type and payload span. */
function boxes(r: Reader, from: number, to: number): Box[] {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to) {
    let size = r.u32(pos);
    const type = r.str(pos + 4, 4);
    let header = 8;
    if (size === 1) {
      size = r.u64(pos + 8);
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) break;
    out.push({ type, start: pos + header, end: pos + size });
    pos += size;
  }
  return out;
}

/** Finds the first child box of `type` within `[from, to)`. */
function find(r: Reader, from: number, to: number, type: string): Box | null {
  for (const b of boxes(r, from, to)) if (b.type === type) return b;
  return null;
}

/** Parses an MP4 file into the summary used by the tests. */
export function parseMp4(bytes: Uint8Array): Mp4Info {
  const r = new Reader(bytes);
  const top = boxes(r, 0, r.length);
  const moov = top.find((b) => b.type === "moov");
  if (!moov) throw new Error("no moov box");

  // mvhd: version(1)+flags(3); v0 -> creation(4) mod(4) timescale(4) duration(4).
  const mvhd = find(r, moov.start, moov.end, "mvhd");
  if (!mvhd) throw new Error("no mvhd box");
  const mvhdVersion = r.u32(mvhd.start) >>> 24;
  let movieTimescale: number;
  let movieDurationUnits: number;
  if (mvhdVersion === 1) {
    movieTimescale = r.u32(mvhd.start + 4 + 8 + 8);
    movieDurationUnits = r.u64(mvhd.start + 4 + 8 + 8 + 4);
  } else {
    movieTimescale = r.u32(mvhd.start + 4 + 4 + 4);
    movieDurationUnits = r.u32(mvhd.start + 4 + 4 + 4 + 4);
  }

  const tracks: TrackInfo[] = [];
  for (const trak of boxes(r, moov.start, moov.end).filter((b) => b.type === "trak")) {
    const mdia = find(r, trak.start, trak.end, "mdia");
    if (!mdia) continue;

    // mdhd: timescale + duration.
    const mdhd = find(r, mdia.start, mdia.end, "mdhd");
    let timescale = 0;
    let durationUnits = 0;
    if (mdhd) {
      const v = r.u32(mdhd.start) >>> 24;
      if (v === 1) {
        timescale = r.u32(mdhd.start + 4 + 8 + 8);
        durationUnits = r.u64(mdhd.start + 4 + 8 + 8 + 4);
      } else {
        timescale = r.u32(mdhd.start + 4 + 4 + 4);
        durationUnits = r.u32(mdhd.start + 4 + 4 + 4 + 4);
      }
    }

    // hdlr: version(1)+flags(3)+pre_defined(4)+handler_type(4).
    const hdlr = find(r, mdia.start, mdia.end, "hdlr");
    const handler = hdlr ? r.str(hdlr.start + 8, 4) : "";

    const minf = find(r, mdia.start, mdia.end, "minf");
    const stbl = minf ? find(r, minf.start, minf.end, "stbl") : null;
    let codec = "";
    let sampleCount = 0;
    if (stbl) {
      const stsd = find(r, stbl.start, stbl.end, "stsd");
      if (stsd) {
        // stsd: version(1)+flags(3)+entry_count(4) then the first sample entry
        // box (size(4)+fourcc(4)).
        codec = r.str(stsd.start + 8 + 4, 4);
      }
      const stsz = find(r, stbl.start, stbl.end, "stsz");
      if (stsz) {
        // stsz: version+flags(4) + sample_size(4) + sample_count(4).
        sampleCount = r.u32(stsz.start + 4 + 4);
      } else {
        const stz2 = find(r, stbl.start, stbl.end, "stz2");
        if (stz2) sampleCount = r.u32(stz2.start + 4 + 4);
      }
    }

    tracks.push({ handler, codec, sampleCount, timescale, durationUnits });
  }

  return {
    movieTimescale,
    movieDurationUnits,
    durationSeconds: movieTimescale > 0 ? movieDurationUnits / movieTimescale : 0,
    tracks,
  };
}
