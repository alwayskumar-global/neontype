/**
 * Project rule: dependencies are exact-pinned. No workspace package.json may declare a specifier that starts with
 * ^ or ~ (or is any other range). `workspace:*` and other `workspace:` links are allowed.
 */
import { describe, it, expect } from "vitest";
import { readWorkspacePackageJsons, readRepoText } from "../../scripts/repo-io.mjs";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
/** An exact version, optionally with a prerelease or build suffix: 1.2.3, 1.2.3-beta.1, 1.2.3+build. */
const EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
function isAllowed(spec: string): boolean {
  return spec.startsWith("workspace:") || EXACT.test(spec);
}
function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
/** Every "<field>.<name>: <specifier>" in one package.json that is neither exact nor a workspace link. */
function unpinned(json: unknown): string[] {
  const pkg = asRecord(json);
  const bad: string[] = [];
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(asRecord(pkg[field]))) {
      if (typeof spec !== "string" || !isAllowed(spec)) bad.push(`${field}.${name}: ${String(spec)}`);
    }
  }
  for (const [name, spec] of Object.entries(asRecord(asRecord(pkg.pnpm).overrides))) {
    if (typeof spec !== "string" || !isAllowed(spec)) bad.push(`pnpm.overrides.${name}: ${String(spec)}`);
  }
  return bad;
}
describe("exact dependency pins", () => {
  const pkgs = readWorkspacePackageJsons();
  it("finds the root and the three workspace packages (not vacuous)", () => {
    const paths = pkgs.map((p) => p.path).sort();
    expect(paths).toEqual(["apps/studio/package.json", "package.json", "packages/engine/package.json", "packages/exporters/package.json"]);
  });
  it("no workspace package.json has a ^, ~ or other range specifier", () => {
    const bad = pkgs.flatMap((p) => unpinned(p.json).map((b) => `${p.path} ${b}`));
    expect(bad).toEqual([]);
  });
  it("the detector flags ranges and passes exact versions and workspace links", () => {
    const sample = {
      dependencies: { a: "^1.2.3", b: "~1.2.3", c: "1.2.3", d: "workspace:*", e: ">=1.0.0", f: "*", g: "latest", h: "1.2.3-beta.1" },
      devDependencies: { i: "1.x" },
      pnpm: { overrides: { j: "^2.0.0" } },
    };
    expect(unpinned(sample)).toEqual([
      "dependencies.a: ^1.2.3",
      "dependencies.b: ~1.2.3",
      "dependencies.e: >=1.0.0",
      "dependencies.f: *",
      "dependencies.g: latest",
      "devDependencies.i: 1.x",
      "pnpm.overrides.j: ^2.0.0",
    ]);
  });
  it("the root .npmrc sets save-exact=true so new dependencies are pinned", () => {
    expect(readRepoText(".npmrc")).toMatch(/^save-exact=true$/m);
  });
});
