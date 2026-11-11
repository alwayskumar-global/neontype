import { describe, it, expect } from "vitest";
import { listStudioFiles, readStudioText } from "../../scripts/dc-io.mjs";
import { leafRules, parseCss, splitSelectors, stripComments } from "../__tests__/dc/css-util.js";

const dsCss = readStudioText("src/ds/ds.css");
const studioTokens = readStudioText("src/tokens.css");
const studioFonts = readStudioText("src/fonts/fonts.css");
const rules = parseCss(dsCss);

const declaredFamilies = (css: string): string[] =>
  [...stripComments(css).matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*["']?([^"';}]+?)["']?\s*[;}]/g)].map((m) => (m[1] ?? "").trim());

describe("ds.css assembly (Requirement 18.1, 18.7-18.10)", () => {
  const bare = stripComments(dsCss);

  it("has a header naming the source export id and namespace", () => {
    expect(dsCss).toContain("f5b901ae-a7fb-489e-9b53-af9bc496124b");
    expect(dsCss).toContain("MotionTextStudioDesignSystem_f5b901");
  });

  it("scopes tokens under .ds-root: no :root, no @import", () => {
    expect(bare).not.toContain(":root");
    expect(bare).not.toContain("@import");
    expect(leafRules(rules).some((r) => splitSelectors(r.prelude).includes(".ds-root"))).toBe(true);
  });

  it("drops every local(...) font source and uses url() only inside @font-face", () => {
    expect(bare).not.toContain("local(");
    const outside = rules.filter((r) => !r.prelude.startsWith("@font-face") && r.body.includes("url("));
    expect(outside.map((r) => r.prelude)).toEqual([]);
    const withUrl = rules.filter((r) => r.prelude.startsWith("@font-face"));
    expect(withUrl.length).toBeGreaterThan(0);
    for (const r of withUrl) expect(r.body).toMatch(/url\("\/fonts\/[A-Za-z0-9-]+\.woff2"\)/);
  });

  it("every selector is a .ui*/.ds-*/.fx* class (or :where/[attr]); no bare element selectors", () => {
    const offenders: string[] = [];
    for (const r of leafRules(rules)) {
      if (r.prelude.startsWith("@")) continue;
      for (const sel of splitSelectors(r.prelude)) {
        if (!/^(\.(ui|ds|fx|t)[-\w]*|:where\(|\[)/.test(sel)) offenders.push(sel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every one of the studio's shared token names is declared only under .ds-root", () => {
    const studioNames = new Set([...studioTokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const offenders: string[] = [];
    for (const r of leafRules(rules)) {
      if (r.prelude.startsWith("@")) continue;
      const isRoot = splitSelectors(r.prelude).every((s) => s === ".ds-root");
      if (isRoot) continue;
      for (const m of r.body.matchAll(/(?:^|[;{\s])(--[a-z0-9-]+)\s*:/g)) {
        if (m[1] !== undefined && studioNames.has(m[1])) offenders.push(`${r.prelude} declares ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the reduced-motion block", () => {
    expect(bare).toContain("prefers-reduced-motion");
  });
});

describe("font-face rules (Requirement 18.7-18.9)", () => {
  const ds = declaredFamilies(dsCss);
  const studio = declaredFamilies(studioFonts);

  it("ds.css declares only Instrument Sans and DM Mono", () => {
    expect([...new Set(ds)].sort()).toEqual(["DM Mono", "Instrument Sans"]);
  });

  it("does not port the design system's Noto Sans Tamil face", () => {
    expect(ds.some((f) => /Tamil/i.test(f))).toBe(false);
    expect(stripComments(dsCss)).not.toMatch(/@font-face[^}]*Noto/);
  });

  it("shares no family name with the studio's own font css (parity: one declaration per family)", () => {
    expect(studio.length).toBeGreaterThan(0);
    const shared = ds.filter((f) => studio.includes(f));
    expect(shared).toEqual([]);
  });

  it("every font file ds.css references exists in public/fonts", () => {
    const files = new Set(listStudioFiles("public/fonts", [".woff2"]).map((p) => p.split("/").pop()));
    const refs = [...dsCss.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
    expect(refs.length).toBe(6);
    for (const f of refs) expect(files.has(f), f).toBe(true);
  });

  it("the licence texts for the ported families are present", () => {
    const names = new Set(listStudioFiles("public/fonts", [".txt"]).map((p) => p.split("/").pop()));
    expect(names.has("OFL-Instrument-Sans.txt")).toBe(true);
    expect(names.has("OFL-DM-Mono.txt")).toBe(true);
  });
});

describe("no collision between ds.css and the studio's other stylesheets (Requirement 18.1)", () => {
  // ds.css is imported globally (its component classes are not re-scoped), so no other stylesheet may
  // declare the same class prefixes or keyframe names.
  const others = listStudioFiles("src", [".css"]).filter((p) => p !== "src/ds/ds.css");
  const dsKeyframes = new Set(
    leafRulesAndKeyframes(rules)
      .filter((r) => r.startsWith("@keyframes"))
      .map((r) => r.replace("@keyframes", "").trim()),
  );

  function leafRulesAndKeyframes(rs: ReturnType<typeof parseCss>): string[] {
    return rs.flatMap((r) => (r.prelude.startsWith("@keyframes") ? [r.prelude] : r.children.length ? leafRulesAndKeyframes(r.children) : []));
  }

  it("checks real stylesheets", () => {
    expect(others).toContain("src/tokens.css");
    expect(others).toContain("src/shell/layout.css");
    expect(dsKeyframes.size).toBeGreaterThan(5);
  });

  for (const path of others) {
    it(`${path} declares no .ui / .fx / .ds- / .t- class and no keyframes name that ds.css declares`, () => {
      const parsed = parseCss(readStudioText(path));
      const classes = new Set<string>();
      const keyframes: string[] = [];
      const walk = (rs: ReturnType<typeof parseCss>): void => {
        for (const r of rs) {
          if (r.prelude.startsWith("@keyframes")) keyframes.push(r.prelude.replace("@keyframes", "").trim());
          else if (r.children.length) walk(r.children);
          else if (!r.prelude.startsWith("@")) {
            for (const sel of splitSelectors(r.prelude)) for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) if (m[1]) classes.add(m[1]);
          }
        }
      };
      walk(parsed);
      const clashing = [...classes].filter((c) => /^(ui|fx|ds)(-|$)|^t-/.test(c));
      expect(clashing, "classes in ds.css's namespace").toEqual([]);
      expect(keyframes.filter((k) => dsKeyframes.has(k)), "keyframes also declared by ds.css").toEqual([]);
    });
  }

  it("the check detects a clash (guard against a vacuous test)", () => {
    const sample = parseCss(".ui-btn{color:red}@keyframes fx-rise{from{opacity:0}}");
    const classes = sample.flatMap((r) => (r.prelude.startsWith("@") ? [] : splitSelectors(r.prelude).flatMap((s) => [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1] ?? ""))));
    expect(classes.some((c) => /^(ui|fx|ds)(-|$)|^t-/.test(c))).toBe(true);
    expect(dsKeyframes.has("fx-rise")).toBe(true);
  });
});
