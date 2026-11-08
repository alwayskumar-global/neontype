import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { makeZip } from "client-zip";

import { frameFileName } from "./png-seq.js";
import { listZip, readStoredEntry, crc32 } from "../__tests__/helpers/zip-reader.js";

/** Collects a ZIP stream to a Uint8Array (mirrors the exporter's collector). */
async function zipOf(entries: { name: string; input: ArrayBuffer }[]): Promise<Uint8Array> {
  const stream = makeZip(entries);
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

describe("frameFileName", () => {
  it("zero-pads to at least 4 digits", () => {
    expect(frameFileName(0, 10)).toBe("frame_0000.png");
    expect(frameFileName(7, 10)).toBe("frame_0007.png");
    expect(frameFileName(123, 1000)).toBe("frame_0123.png");
  });

  it("widens past 9999 so lexical order matches numeric order", () => {
    // 12000 frames -> max index 11999 -> 5 digits.
    expect(frameFileName(5, 12000)).toBe("frame_00005.png");
    expect(frameFileName(11999, 12000)).toBe("frame_11999.png");
  });
});

// Feature: exporters, Property 6: PNG entry-name padding and ordering
describe("Property 6: PNG entry-name padding and ordering", () => {
  it("every name is zero-padded >= 4 digits and lexical order equals frame order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20000 }), (frameCount) => {
        const names = Array.from({ length: Math.min(frameCount, 2000) }, (_, i) =>
          frameFileName(i, frameCount),
        );
        // Width is at least 4 digits.
        for (const n of names) {
          const digits = /frame_(\d+)\.png/.exec(n)![1];
          expect(digits.length).toBeGreaterThanOrEqual(4);
        }
        // All names share the same digit width (so lexical == numeric).
        const widths = new Set(names.map((n) => /frame_(\d+)\.png/.exec(n)![1].length));
        expect(widths.size).toBe(1);
        // Lexical sort equals the generated (numeric) order.
        const sorted = [...names].sort();
        expect(sorted).toEqual(names);
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: exporters, Property 5: ZIP CRC-32 correctness
describe("Property 5: ZIP CRC-32 correctness", () => {
  it("each stored entry's CRC-32 equals an independent reference CRC-32", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uint8Array({ minLength: 0, maxLength: 512 }), { minLength: 1, maxLength: 6 }),
        async (buffers) => {
          const entries = buffers.map((b, i) => ({
            name: frameFileName(i, buffers.length),
            input: b.slice().buffer,
          }));
          const zip = await zipOf(entries);
          const listing = listZip(zip);
          expect(listing.entries).toHaveLength(buffers.length);
          for (let i = 0; i < buffers.length; i++) {
            const entry = listing.entries[i];
            // STORED (no compression).
            expect(entry.method).toBe(0);
            // The stored CRC matches our independent reference over the data.
            expect(entry.crc32).toBe(crc32(buffers[i]));
            // And the stored bytes round-trip exactly.
            const data = readStoredEntry(zip, entry);
            expect(Array.from(data)).toEqual(Array.from(buffers[i]));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
