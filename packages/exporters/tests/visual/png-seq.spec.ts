import { test, expect } from "@playwright/test";

import { listZip, readStoredEntry, crc32 } from "../../src/__tests__/helpers/zip-reader.js";

/**
 * PNG sequence ZIP via the WORKER (Req 4). Runs exportPngSequence -> dispatchExport
 * -> worker-entry over the localhost harness in bundled Chromium, then parses the
 * ZIP with the hand-written reader: the entry count equals the frame count, the
 * entry names are the zero-padded ordered sequence, every entry is STORED, and
 * each entry's stored CRC-32 matches an independent reference over its bytes.
 */

declare global {
  interface Window {
    runPngExport: (background: string) => Promise<{
      ok: boolean;
      code?: string;
      bytes: number[];
      frameCount?: number;
    }>;
  }
}

const EXPECTED_FRAMES = Math.round(0.3 * 10); // project: 0.3s @ 10fps = 3

for (const background of ["#102030", "transparent"]) {
  test(`PNG sequence ZIP via the worker lists the right entries (${background})`, async ({
    page,
  }) => {
    await page.goto("http://localhost:5273/");
    await page.waitForFunction(() => typeof window.runPngExport === "function");

    const r = await page.evaluate((bg) => window.runPngExport(bg), background);
    expect(r.ok, `export failed: ${r.code ?? ""}`).toBe(true);
    expect(r.frameCount).toBe(EXPECTED_FRAMES);

    const zip = Uint8Array.from(r.bytes);
    const { entries } = listZip(zip);
    expect(entries).toHaveLength(EXPECTED_FRAMES);

    // Names are the zero-padded ordered sequence.
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
    expect(names[0]).toBe("frame_0000.png");
    expect(names[EXPECTED_FRAMES - 1]).toBe(`frame_000${EXPECTED_FRAMES - 1}.png`);

    for (const entry of entries) {
      // STORED (uncompressed) + valid PNG signature + correct CRC-32.
      expect(entry.method).toBe(0);
      const data = readStoredEntry(zip, entry);
      // PNG magic: 89 50 4E 47 0D 0A 1A 0A
      expect(Array.from(data.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(entry.crc32).toBe(crc32(data));
    }
  });
}
