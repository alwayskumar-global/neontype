/**
 * Node I/O shell for repository-hygiene tests: reads every workspace package.json (the root, apps/*, packages/*).
 * Kept in .mjs with a hand-written .d.mts, like dc-io.mjs, because the studio tsconfig has no Node types.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** @returns {{ path: string, json: unknown }[]} paths are relative to the repository root, "/" separators */
export function readWorkspacePackageJsons() {
  const out = [{ path: "package.json", json: JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) }];
  for (const group of ["apps", "packages"]) {
    const dir = join(REPO_ROOT, group);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name, "package.json");
      if (e.isDirectory() && existsSync(f)) out.push({ path: `${group}/${e.name}/package.json`, json: JSON.parse(readFileSync(f, "utf8")) });
    }
  }
  return out;
}
/** Text of a file at the repository root (for .npmrc and similar). */
export function readRepoText(fileRel) {
  return readFileSync(join(REPO_ROOT, fileRel), "utf8");
}
