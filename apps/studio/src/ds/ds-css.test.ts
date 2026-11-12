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
    for (const r of withUrl) expect(r.body).toMatch(/url\("\.\/fonts\/[A-Za-z0-9-]+\.woff2"\)/);
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

  it("every font file ds.css references exists in src/ds/fonts", () => {
    const files = new Set(listStudioFiles("src/ds/fonts", [".woff2"]).map((p) => p.split("/").pop()));
    const refs = [...dsCss.matchAll(/url\("\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
    expect(refs.length).toBe(6);
    for (const f of refs) expect(files.has(f), f).toBe(true);
  });

  it("the licence texts for the ported families are present", () => {
    const names = new Set(listStudioFiles("src/ds/fonts", [".txt"]).map((p) => p.split("/").pop()));
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

  /**
   * The ONLY design-system classes a wiring host stylesheet may reference (never declare): the generated screen's
   * root class and the preset card, used as context. The list is exact; any other ui-, fx-, ds-, or t- class
   * referenced under src/wiring/hosts/ fails, and no other directory has an allowance.
   */
  const HOST_REFERENCE_ALLOWLIST = ["ds-root", "ui-preset"] as const;
  const NAMESPACE = /^(ui|fx|ds)(-|$)|^t-/;
  /** Class names in a stylesheet's selectors, ignoring :where(...) (it only excludes subtrees; it declares nothing). */
  function selectorClasses(rs: ReturnType<typeof parseCss>, keyframes: string[] = []): Set<string> {
    const classes = new Set<string>();
    const walk = (list: ReturnType<typeof parseCss>): void => {
      for (const r of list) {
        if (r.prelude.startsWith("@keyframes")) keyframes.push(r.prelude.replace("@keyframes", "").trim());
        else if (r.children.length) walk(r.children);
        else if (!r.prelude.startsWith("@")) {
          for (const sel of splitSelectors(r.prelude.replace(/:where\([^)]*\)/g, ""))) for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) if (m[1]) classes.add(m[1]);
        }
      }
    };
    walk(rs);
    return classes;
  }
  /** The classes in ds.css's namespace that this file may NOT use. */
  function clashingClasses(path: string, classes: Set<string>): string[] {
    const allowed: readonly string[] = path.startsWith("src/wiring/hosts/") ? HOST_REFERENCE_ALLOWLIST : [];
    return [...classes].filter((c) => NAMESPACE.test(c) && !allowed.includes(c));
  }
  for (const path of others) {
    it(`${path} declares no .ui / .fx / .ds- / .t- class and no keyframes name that ds.css declares`, () => {
      const keyframes: string[] = [];
      const classes = selectorClasses(parseCss(readStudioText(path)), keyframes);
      expect(clashingClasses(path, classes), "classes in ds.css's namespace").toEqual([]);
      expect(keyframes.filter((k) => dsKeyframes.has(k)), "keyframes also declared by ds.css").toEqual([]);
    });
  }
  it("the wiring-host allowlist is exactly ds-root and ui-preset, and applies only under src/wiring/hosts/", () => {
    expect([...HOST_REFERENCE_ALLOWLIST]).toEqual(["ds-root", "ui-preset"]);
    const css = ".lib-host > .ds-root.dc-x { z-index: 1 } .ui-preset:hover .lib-fx > span { opacity: 1 }";
    expect(clashingClasses("src/wiring/hosts/x.css", selectorClasses(parseCss(css)))).toEqual([]);
    expect(clashingClasses("src/shell/layout.css", selectorClasses(parseCss(css))).sort()).toEqual(["ds-root", "ui-preset"]);
    expect(clashingClasses("src/wiring/other/x.css", selectorClasses(parseCss(css))).sort()).toEqual(["ds-root", "ui-preset"]);
  });
  it("any other design-system class referenced under src/wiring/hosts/ fails", () => {
    for (const bad of [".ui-btn", ".ui-preset__thumb", ".ds-w", ".fx--rise", ".fx", ".t-body", ".ds-root-x", ".ui-presets"]) {
      const classes = selectorClasses(parseCss(`.ds-root ${bad} { color: red }`));
      expect(clashingClasses("src/wiring/hosts/x.css", classes), bad).toEqual([bad.slice(1)]);
    }
  });
  it(":where(...) is ignored, so excluding a design-system subtree declares nothing", () => {
    const classes = selectorClasses(parseCss("button:not(:where(.ds-root *)) { color: red }"));
    expect(clashingClasses("src/shell/layout.css", classes)).toEqual([]);
  });
  it("the check detects a clash (guard against a vacuous test)", () => {
    const sample = parseCss(".ui-btn{color:red}@keyframes fx-rise{from{opacity:0}}");
    const classes = sample.flatMap((r) => (r.prelude.startsWith("@") ? [] : splitSelectors(r.prelude).flatMap((s) => [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1] ?? ""))));
    expect(classes.some((c) => /^(ui|fx|ds)(-|$)|^t-/.test(c))).toBe(true);
    expect(dsKeyframes.has("fx-rise")).toBe(true);
  });
});
