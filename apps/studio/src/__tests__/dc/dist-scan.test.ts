/**
 * Nothing from design/ reaches a build (Requirement 17.6, 17.10). Builds the production config and
 * the harness config IN MEMORY (`write: false`) and scans every emitted file's path and text for references to the design export, the vendor runtime, and the bundle namespace.
 */
import { describe, it, expect } from "vitest";
import { build } from "vite";
import { STUDIO_DIR, listAbsFiles, withTempDir } from "../../../scripts/dc-io.mjs";

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

/** Selectors that only ds.css introduces: the `.ui-` component classes and the `.ds-root` token scope. */
function dsCssHits(css: { fileName: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const f of css) {
    if (/\.ui-/.test(f.text)) hits.push(`${f.fileName}: .ui- selector`);
    if (/\.ds-root/.test(f.text)) hits.push(`${f.fileName}: .ds-root selector`);
  }
  return hits;
}
/** Builds for real into a temp dir, so files copied from public/ at write time are included. */
function writtenFiles(configFile: string): Promise<string[]> {
  return withTempDir(async (outDir) => {
    await build({ configFile: `${STUDIO_DIR}/${configFile}`, logLevel: "silent", build: { outDir, emptyOutDir: true } });
    return listAbsFiles(outDir);
  });
}
const DS_FONT = /(^|\/)(DMMono|InstrumentSans)-[^/]*\.woff2$/;
describe("builds contain nothing from design/", () => {
  it("the production build", async () => {
    const files = await emitted("vite.config.ts");
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.some((f) => f.fileName === "index.html")).toBe(true);
    expect(files.some((f) => f.fileName.endsWith(".js") && f.text.length > 100_000)).toBe(true);
    expect(scan(files)).toEqual([]);
  }, 120_000);
  it("the production build ships the design-system CSS (the live app wires the Effects Library; Requirement 19.5)", async () => {
    const files = await emitted("vite.config.ts");
    const css = files.filter((f) => f.fileName.endsWith(".css"));
    expect(css.length).toBeGreaterThanOrEqual(1);
    expect(css.some((f) => f.text.includes("--"))).toBe(true); // non-vacuity: the app's own CSS is there
    const hits = dsCssHits(css);
    expect(hits.some((h) => h.endsWith(".ui- selector")), "a .ui- selector").toBe(true);
    expect(hits.some((h) => h.endsWith(".ds-root selector")), "the .ds-root selector").toBe(true);
  }, 120_000);
  it("the harness build DOES carry the design-system CSS, so the CSS check can fail", async () => {
    const files = await emitted("vite.dc-harness.config.ts");
    expect(dsCssHits(files.filter((f) => f.fileName.endsWith(".css"))).length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("the default-route dist (as written, including public/) contains all six DMMono and InstrumentSans files", async () => {
    const files = await writtenFiles("vite.config.ts");
    // Non-vacuity: the written dist includes the public/ copy (Noto fonts) and the app's own assets.
    expect(files.some((p) => /fonts\/noto-sans-latin-400-normal\.woff2$/.test(p))).toBe(true);
    expect(files.some((p) => p.endsWith("index.html"))).toBe(true);
    const ds = files.filter((p) => DS_FONT.test(p));
    expect(ds.filter((p) => /DMMono/.test(p)).length).toBe(4);
    expect(ds.filter((p) => /InstrumentSans/.test(p)).length).toBe(2);
    // They come from the bundle (hashed assets), not from public/.
    expect(ds.every((p) => p.startsWith("assets/"))).toBe(true);
  }, 120_000);

  it("the harness dist DOES contain all six DMMono / InstrumentSans files", async () => {
    const files = await writtenFiles("vite.dc-harness.config.ts");
    const ds = files.filter((p) => DS_FONT.test(p));
    expect(ds.filter((p) => /DMMono/.test(p)).length).toBe(4);
    expect(ds.filter((p) => /InstrumentSans/.test(p)).length).toBe(2);
    expect(DS_FONT.test("assets/DMMono-400-latin-abc123.woff2")).toBe(true); // the pattern matches hashed names
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
