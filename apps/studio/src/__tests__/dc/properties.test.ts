/**
 * Property 11 (converter determinism) and Property 12 (generated output is CSP-clean), over random
 * documents drawn from the supported grammar (Requirement 17.2, 17.6).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import ts from "typescript";
import { convertDc } from "../../../scripts/dc-convert-lib.mjs";
import { leafRules, parseCss, splitSelectors } from "./css-util.js";

const doc = (root: string, css: string): string =>
  `<!DOCTYPE html>\n<html><head></head><body>\n<x-dc>\n<helmet><style>${css}</style></helmet>\n${root}\n</x-dc>\n</body></html>\n`;

// ---------------------------------------------------------------- generators

const bindPath = fc.constantFrom("a", "b.c", "d.e.f", "title", "items", "v.x", "v.y.z");
// Braces appear only as a spaced phrase: a literal "{" glued to "{{" is ambiguous in the input language.
const textChars = fc.constantFrom(..."abcXYZ 019.,;:!?-_()'/".split(""), "é", "வ", " { x } ", "&amp;", "&lt;", "&quot;", "\\", "\u2028");
const staticText = fc.array(textChars, { minLength: 1, maxLength: 12 }).map((cs) => cs.join(""));
const textNode = fc
  .array(fc.oneof(staticText, bindPath.map((p) => `{{ ${p} }}`), fc.constant("{{ $index }}"), fc.constant("{{ 7 }}")), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(""));

const decl = fc.constantFrom(
  "color:red", "width:10px", "background:#2D343F", "font-family:'Instrument Sans',sans-serif", "transition: color .1s  ease",
  "opacity:{{ a }}", "transform:scale({{ b.c }})", "left:{{ d.e.f }}px", "transform:translateY(calc(-50% + {{ v.x }}cqw))", "width:{{ 14 }}px",
);
const styleValue = fc.array(decl, { minLength: 1, maxLength: 3 }).map((d) => d.join(";"));
const attr = fc.oneof(
  fc.constantFrom('class="x y"', 'role="button"', 'aria-hidden="true"', 'aria-label="Label"', 'data-fx="1"', 'title="{{ title }}"', 'aria-label="{{ a }}"', 'data-id="{{ items }}"', 'aria-checked="{{ b.c }}"'),
  styleValue.map((v) => `style="${v}"`),
  fc.constant('style-hover="color:blue"'),
  fc.constant('style-focus="outline:none"'),
);
const uniqueAttrs = fc.array(attr, { maxLength: 4 }).map((as) => {
  const seen = new Set<string>();
  return as.filter((a) => {
    const name = a.split("=")[0] ?? "";
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
});

const tag = fc.constantFrom("div", "span", "p", "section", "header", "footer", "li");

const { node } = fc.letrec<{ node: string; el: string; scIf: string; scFor: string }>((tie) => ({
  node: fc.oneof({ depthSize: "small", withCrossShrink: true }, textNode, tie("el"), tie("scIf"), tie("scFor")),
  el: fc.tuple(tag, uniqueAttrs, fc.array(tie("node"), { maxLength: 3 })).map(([t, as, kids]) => `<${t}${as.length ? " " + as.join(" ") : ""}>${kids.join("")}</${t}>`),
  scIf: fc.tuple(bindPath, fc.array(tie("node"), { minLength: 1, maxLength: 2 })).map(([p, kids]) => `<sc-if value="{{ ${p} }}">${kids.join("")}</sc-if>`),
  scFor: fc.tuple(bindPath, fc.array(tie("node"), { minLength: 1, maxLength: 2 })).map(([p, kids]) => `<sc-for list="{{ ${p} }}" as="v">${kids.join("")}</sc-for>`),
}));

const helmetCss = fc
  .array(
    fc.constantFrom(
      "*{box-sizing:border-box}", "html,body{margin:0;height:100%}", "button,input{font:inherit}", "a{color:#FF85E0}a:hover{color:#FFADEA}",
      "@keyframes spin{to{transform:rotate(1turn)}}", "@media (prefers-reduced-motion: reduce){[data-fx]{animation:none!important}}",
      ".x{color:red}", "span:focus-visible{outline:2px solid #2DD3F0}",
    ),
    { maxLength: 4 },
  )
  .map((rules) => [...new Set(rules)].join("\n"));

const screen = fc.tuple(tag, uniqueAttrs, fc.array(node, { minLength: 1, maxLength: 4 }), helmetCss).map(([t, as, kids, css]) =>
  doc(`<${t}${as.length ? " " + as.join(" ") : ""}>${kids.join("")}</${t}>`, css),
);

const FORBIDDEN = [{ text: "http://" }, { text: "https://" }, { text: "design/" }, { text: "support.js" }];

// ---------------------------------------------------------------- properties

// Feature: studio, Property 11: Converter determinism
describe("Property 11: converter determinism", () => {
  it("converting the same document twice gives byte-identical files, bindings and keyframes", () => {
    fc.assert(
      fc.property(screen, (src) => {
        const a = convertDc(src, { fileName: "Gen Screen.dc.html", forbid: FORBIDDEN });
        const b = convertDc(src, { fileName: "Gen Screen.dc.html", forbid: FORBIDDEN });
        expect(a.files.map((f) => f.path)).toEqual(b.files.map((f) => f.path));
        for (let i = 0; i < a.files.length; i++) expect(a.files[i]?.content).toEqual(b.files[i]?.content);
        expect(a.bindings).toEqual(b.bindings);
        expect(a.keyframes).toEqual(b.keyframes);
      }),
      { numRuns: 150 },
    );
  });
  it("is independent of line endings (CRLF) and of a leading BOM, apart from the raw-bytes hash", () => {
    fc.assert(
      fc.property(screen, (src) => {
        const a = convertDc(src, { fileName: "G.dc.html" });
        const b = convertDc("\uFEFF" + src.replace(/\n/g, "\r\n"), { fileName: "G.dc.html" });
        const strip = (c: string | Uint8Array): string => (typeof c === "string" ? c.replace(/\/\/ sha256: .*\n/, "") : "");
        for (let i = 0; i < a.files.length; i++) expect(strip(b.files[i]?.content ?? "")).toBe(strip(a.files[i]?.content ?? ""));
      }),
      { numRuns: 60 },
    );
  });
});

// Feature: studio, Property 12: Generated output is CSP-clean
describe("Property 12: generated output is CSP-clean", () => {
  it("contains no style attribute/prop, HTML sink, script/style element, remote URL or design/ path; the CSS is scoped; the TSX parses", () => {
    fc.assert(
      fc.property(screen, (src) => {
        const r = convertDc(src, { fileName: "Gen Screen.dc.html", forbid: FORBIDDEN });
        const css = r.files.find((f) => f.path.endsWith(".css"))?.content as string;
        const tsx = r.files.find((f) => f.path.endsWith(".tsx"))?.content as string;
        for (const text of [css, tsx]) {
          expect(text).not.toMatch(/\bstyle\s*=/);
          expect(text).not.toContain("dangerouslySetInnerHTML");
          expect(text).not.toMatch(/<script/i);
          expect(text).not.toMatch(/<style/i);
          expect(text).not.toMatch(/https?:\/\//);
          expect(text).not.toContain("design/");
        }
        // CSS: balanced, and every selector is under the screen root; keyframes are prefixed.
        const root = `dc-${r.slug}`;
        for (const rule of parseCss(css)) {
          if (rule.prelude.startsWith("@keyframes")) expect(rule.prelude).toContain(`${root}-`);
        }
        for (const leaf of leafRules(parseCss(css))) {
          if (leaf.prelude.startsWith("@")) continue;
          for (const sel of splitSelectors(leaf.prelude)) {
            expect(sel.startsWith(`.${root}`) || sel.startsWith(`:where(.${root})`), sel).toBe(true);
          }
        }
        // TSX: syntactically valid (transpile reports syntax errors only).
        const out = ts.transpileModule(tsx, {
          reportDiagnostics: true,
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          fileName: "Gen.tsx",
        });
        const errors = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
        expect(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
  it("the generator exercises the interesting paths (guard against a vacuous property)", () => {
    const seen = { dynStyle: 0, hover: 0, scFor: 0, scIf: 0, keyframes: 0, media: 0 };
    fc.assert(
      fc.property(screen, (src) => {
        const r = convertDc(src, { fileName: "Gen.dc.html" });
        const tsx = r.files.find((f) => f.path.endsWith(".tsx"))?.content as string;
        if (tsx.includes("dcVars(")) seen.dynStyle++;
        if (src.includes("style-hover")) seen.hover++;
        if (tsx.includes("childScope(")) seen.scFor++;
        if (tsx.includes("truthy(")) seen.scIf++;
        if (Object.keys(r.keyframes).length) seen.keyframes++;
        if (src.includes("@media")) seen.media++;
      }),
      { numRuns: 200 },
    );
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(5);
  });
});
