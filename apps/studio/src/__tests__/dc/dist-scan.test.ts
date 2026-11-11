/**
 * Nothing from design/ reaches a build (Requirement 17.6, 17.10). Builds the production config and
 * the harness config IN MEMORY (`write: false`; no temp directory) and scans every emitted file's
 * path and text for references to the design export, the vendor runtime, and the bundle namespace.
 */
import { describe, it, expect } from "vitest";
import { build } from "vite";
import { STUDIO_DIR } from "../../../scripts/dc-io.mjs";

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "design/ path", re: /(^|[^A-Za-z0-9_-])design\// },
  { name: "_ds/ export folder", re: /(^|[^A-Za-z0-9_])_ds\// },
  { name: "_ds_bundle", re: /_ds_bundle/ },
  { name: "support.js", re: /support\.js/ },
  { name: ".dc.html", re: /\.dc\.html/ },
  { name: "bundle namespace", re: /MotionTextStudioDesignSystem/ },
];

/** The part of Rollup's output this test reads (rollup is not a direct dependency, so it is typed here). */
type EmittedItem = { type: "chunk"; fileName: string; code: string } | { type: "asset"; fileName: string; source: string | Uint8Array };
type Emitted = { output: EmittedItem[] };
const isEmitted = (v: unknown): v is Emitted => typeof v === "object" && v !== null && "output" in v;

/**
 * Each config sets its own `root` relative to the working directory, which is apps/studio when the
 * suite runs. Public-folder files are copied at write time and are therefore not in the output.
 */
async function emitted(configFile: string): Promise<{ fileName: string; text: string }[]> {
  const result: unknown = await build({ configFile: `${STUDIO_DIR}/${configFile}`, logLevel: "silent", build: { write: false } });
  const outputs: Emitted[] = (Array.isArray(result) ? result : [result]).filter(isEmitted);
  const files: { fileName: string; text: string }[] = [];
  for (const out of outputs) {
    for (const item of out.output) {
      if (item.type === "chunk") files.push({ fileName: item.fileName, text: item.code });
      else if (typeof item.source === "string") files.push({ fileName: item.fileName, text: item.source });
      else files.push({ fileName: item.fileName, text: "" }); // binary asset: path only
    }
  }
  return files;
}

function scan(files: { fileName: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    for (const p of PATTERNS) {
      if (p.re.test(f.fileName)) hits.push(`${f.fileName}: path matches ${p.name}`);
      if (p.re.test(f.text)) hits.push(`${f.fileName}: text matches ${p.name}`);
    }
  }
  return hits;
}

describe("builds contain nothing from design/", () => {
  it("the production build", async () => {
    const files = await emitted("vite.config.ts");
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.some((f) => f.fileName === "index.html")).toBe(true);
    expect(files.some((f) => f.fileName.endsWith(".js") && f.text.length > 100_000)).toBe(true);
    expect(scan(files)).toEqual([]);
  }, 120_000);

  it("the dc-harness build (which bundles the generated screens)", async () => {
    const files = await emitted("vite.dc-harness.config.ts");
    expect(files.some((f) => f.fileName === "index.html")).toBe(true);
    expect(files.some((f) => f.fileName === "parity.html")).toBe(true);
    // It really includes the generated screen's CSS and the design-system CSS...
    expect(files.some((f) => f.fileName.endsWith(".css") && f.text.includes("dc-studio-editor"))).toBe(true);
    expect(files.some((f) => f.fileName.endsWith(".css") && f.text.includes(".ds-root"))).toBe(true);
    // ...and nothing from the design export.
    expect(scan(files)).toEqual([]);
  }, 120_000);

  it("the scan itself detects a reference (guard against a vacuous test)", () => {
    expect(scan([{ fileName: "assets/x.js", text: 'import x from "../design/Studio Editor.dc.html"' }]).length).toBeGreaterThanOrEqual(2);
    expect(scan([{ fileName: "assets/_ds_bundle.js", text: "" }]).length).toBeGreaterThanOrEqual(1);
    expect(scan([{ fileName: "assets/ok.js", text: "const designSystem = 1; // design-system" }])).toEqual([]);
  });
});
