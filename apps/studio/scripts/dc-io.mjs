/**
 * File-system access for the design-source converter and its tests. Kept separate from
 * dc-convert-lib.mjs (pure) because apps/studio has no @types/node: tests under src/ import this
 * module through the hand-written dc-io.d.mts and never touch node:fs themselves.
 *
 * design/ is read as INPUT only; nothing here is imported by the app or bundled.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { convertDc } from "./dc-convert-lib.mjs";

/** apps/studio (the parent of scripts/). */
export const STUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig() {
  return JSON.parse(readFileSync(join(STUDIO_DIR, "scripts", "dc-convert.config.json"), "utf8"));
}

/** Every file under `dir` (recursively), as sorted forward-slash paths relative to `dir`. */
function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

/** Reads `design/assets/*` into { "assets/<name>": bytes }. */
function readAssets(designDir) {
  const dir = join(designDir, "assets");
  const out = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) out[`assets/${name}`] = new Uint8Array(readFileSync(join(dir, name)));
  return out;
}

/** Converts every configured screen. Returns [{ slug, componentName, files, bindings, keyframes }] in config order. */
export function convertAll() {
  const config = loadConfig();
  const designDir = resolve(STUDIO_DIR, config.designDir);
  const assets = readAssets(designDir);
  return config.files.map((entry) => {
    const source = new Uint8Array(readFileSync(join(designDir, entry.source)));
    return convertDc(source, {
      fileName: entry.source,
      rules: { omitIf: entry.omitIf, replaceText: entry.replaceText, forbid: entry.forbid },
      forbid: config.forbid,
      assets,
    });
  });
}

/** Flattens convertAll() into a { "slug/file": content } map. */
export function convertAllToMap() {
  const map = {};
  for (const r of convertAll()) for (const f of r.files) map[f.path] = f.content;
  return map;
}

/** Writes the converted screens under `outDir` (default: the configured outDir), replacing it. */
export function writeAll(outDir) {
  const config = loadConfig();
  const target = resolve(STUDIO_DIR, outDir ?? config.outDir);
  const map = convertAllToMap();
  rmSync(target, { recursive: true, force: true });
  for (const [path, content] of Object.entries(map)) {
    const dest = join(target, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  return Object.keys(map).sort();
}

const TEXT_EXT = /\.(tsx?|css|json|md)$/;

/** Reads a directory (relative to apps/studio) into { "rel/path": string | Uint8Array }. Text by extension. */
export function readTree(dirRel) {
  const dir = resolve(STUDIO_DIR, dirRel);
  const out = {};
  if (!existsSync(dir)) return out;
  for (const rel of walk(dir)) {
    const bytes = readFileSync(join(dir, rel));
    out[rel] = TEXT_EXT.test(rel) ? bytes.toString("utf8") : new Uint8Array(bytes);
  }
  return out;
}

/** Reads one text file relative to apps/studio. */
export function readStudioText(fileRel) {
  return readFileSync(resolve(STUDIO_DIR, fileRel), "utf8");
}

/** Lists files under a directory relative to apps/studio, filtered by extension list. */
export function listStudioFiles(dirRel, exts) {
  const dir = resolve(STUDIO_DIR, dirRel);
  if (!existsSync(dir)) return [];
  return walk(dir).filter((p) => exts.some((e) => p.endsWith(e))).map((p) => `${dirRel}/${p}`);
}

/** Reads a design input as bytes (used by tests that must compare the committed copy of an asset). */
export function readDesignAsset(nameRel) {
  const config = loadConfig();
  return new Uint8Array(readFileSync(join(resolve(STUDIO_DIR, config.designDir), nameRel)));
}

/** Recursive list of file paths (relative to absDir, "/" separators) under an absolute directory. */
export function listAbsFiles(absDir, rel = "") {
  return readdirSync(join(absDir, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listAbsFiles(absDir, rel ? `${rel}/${e.name}` : e.name) : [rel ? `${rel}/${e.name}` : e.name],
  );
}

/** Runs fn(absDir) with a fresh temporary directory, always removing it afterwards. */
export async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "studio-dist-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
