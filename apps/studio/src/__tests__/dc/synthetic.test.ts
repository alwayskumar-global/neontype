/**
 * Mapping and fail-loud tests on small synthetic inputs (Requirement 17.1, 17.3, 17.9). The
 * converter must reject anything outside the supported grammar with `file:line: message`.
 */
import { describe, it, expect } from "vitest";
import { convertDc, DcConvertError, type ConvertOptions } from "../../../scripts/dc-convert-lib.mjs";

const DS = "MotionTextStudioDesignSystem_f5b901";

/** A minimal valid document; the body starts on line 7. */
const doc = (body: string, css = ""): string =>
  `<!DOCTYPE html>\n<html><head></head><body>\n<x-dc>\n<helmet><style>${css}</style></helmet>\n${body}\n</x-dc>\n</body></html>\n`;

/** Converts `body` wrapped in a plain <div> screen root (directives and x-imports cannot be the root). */
function convert(body: string, css = "", opts: Partial<ConvertOptions> = {}) {
  return convertDc(doc(`<div>${body}</div>`, css), { fileName: "T.dc.html", ...opts });
}
/** Converts `body` exactly as given, for tests about the root itself. */
function convertRaw(body: string, css = "", opts: Partial<ConvertOptions> = {}) {
  return convertDc(doc(body, css), { fileName: "T.dc.html", ...opts });
}
const tsx = (r: ReturnType<typeof convert>): string => r.files.find((f) => f.path.endsWith(".tsx"))?.content as string;
const css = (r: ReturnType<typeof convert>): string => r.files.find((f) => f.path.endsWith(".css"))?.content as string;

function fails(fn: () => unknown, match: RegExp, line?: number, prefix: RegExp = /^T\.dc\.html:\d+: /): void {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err, "expected a DcConvertError").toBeInstanceOf(DcConvertError);
  const e = err as DcConvertError;
  expect(e.message).toMatch(match);
  expect(e.message).toMatch(prefix);
  if (line !== undefined) expect(e.line).toBe(line);
}

describe("fail loud: tokenizer and structure", () => {
  it("unknown element", () => fails(() => convert("<blink>x</blink>"), /unsupported element <blink>/, 5));
  it("unsupported attribute", () => fails(() => convert('<div foo="x"></div>'), /unsupported attribute "foo"/, 5));
  it("single-quoted attribute", () => fails(() => convert("<div class='a'></div>"), /double-quoted/, 5));
  it("valueless attribute outside a script (not an HTML boolean)", () => fails(() => convert("<div inert></div>"), /no value/, 5));
  it("self-closing syntax", () => fails(() => convert("<div />"), /self-closing/, 5));
  it("unterminated comment", () => fails(() => convert("<!-- never closed <div></div>"), /unterminated comment/, 5));
  it("mismatched end tag names the open tag's line", () => fails(() => convert("<div>\n<span>\n</div>"), /unexpected <\/div>.*open <span>.*line 6/, 7));
  it("unclosed tag", () => fails(() => convert("<div>"), /unexpected <\/x-dc>.*open <div>/));
  it("unsupported entity", () => fails(() => convert("<div>a&nbsp;b</div>"), /unsupported entity &nbsp;/, 5));
  it("two screen roots", () => fails(() => convertRaw("<div></div><div></div>"), /exactly one screen root/));
  it("no screen root", () => fails(() => convertRaw(""), /exactly one screen root/));
  it("no <x-dc>", () => fails(() => convertDc("<!DOCTYPE html><html><body><div></div></body></html>", { fileName: "T.dc.html" }), /exactly one <x-dc>/));
  it("an inline script that is not the data script", () => fails(() => convertRaw("<script>alert(1)</script><div></div>"), /unsupported inline <script>/));
  it("a directive or design-system import cannot be the screen root", () => {
    fails(() => convertRaw('<sc-if value="{{ p }}"><div></div></sc-if>'), /screen root must be a plain element, not <sc-if>/);
    fails(() => convertRaw(`<x-import component-from-global-scope="${DS}.Icon" name="play"></x-import>`), /screen root must be a plain element, not <x-import>/);
    fails(() => convertRaw("<dc-import name=\"x\"></dc-import>"), /not <dc-import>/);
  });
  it("a script src that is not the vendor runtime or the bundle", () => fails(() => convertRaw('<script src="https://evil.example/x.js"></script><div></div>'), /unsupported <script src/));
});

describe("fail loud: bindings", () => {
  it("an operator inside {{ }}", () => fails(() => convert("<p>{{ a + b }}</p>"), /unsupported binding expression "\{\{ a \+ b \}\}"/, 5));
  it("a call, ternary, negation and string literal", () => {
    for (const expr of ["f(x)", "a ? b : c", "!a", "'str'", "a[0]", "a.b()"]) {
      fails(() => convert(`<div>{{ ${expr} }}</div>`), /unsupported binding expression/);
    }
  });
  it("an unterminated {{", () => fails(() => convert("<div>{{ a</div>"), /unterminated \{\{/, 5));
  it("static text mixed with a binding in an attribute", () => fails(() => convert('<div title="a {{ b }}"></div>'), /mixes static text with a binding/, 5));
  it("a binding in style-hover", () => fails(() => convert('<div style-hover="color:{{ c }}"></div>'), /not supported in style-hover/, 5));
  it("an object-valued style binding", () => fails(() => convert('<div style="{{ obj }}"></div>'), /malformed declaration/, 5));
  it("sc-if and sc-for need a path binding", () => {
    fails(() => convert('<sc-if value="literal"><div></div></sc-if>'), /single binding to a path/);
    fails(() => convert('<sc-for list="{{ l }}"><div></div></sc-for>'), /needs list and as/);
    fails(() => convert('<sc-for list="{{ l }}" as="$index"><div></div></sc-for>'), /invalid sc-for variable/);
  });
});

describe("fail loud: design-system imports and events", () => {
  const xi = (comp: string, extra = "") => `<x-import component-from-global-scope="${DS}.${comp}" ${extra}></x-import>`;
  it("unknown namespace", () => fails(() => convert('<x-import component-from-global-scope="Other_ns.Button"></x-import>'), /unsupported component namespace/));
  it("unknown component", () => fails(() => convert(xi("Carousel")), /unsupported design-system component "Carousel"/));
  it("unknown prop on a known component", () => fails(() => convert(xi("Button", 'bogus="1"')), /unsupported prop "bogus" on Button/));
  it("a style on a component that does not take className", () => fails(() => convert(xi("Toggle", 'style="color:red"')), /style on <x-import Toggle> is not supported/));
  it("a dynamic style on an x-import", () => fails(() => convert(xi("Icon", 'name="play" style="color:{{ c }}"')), /dynamic style on <x-import> is not supported/));
  it("an enum prop that is not static", () => fails(() => convert(xi("Button", 'variant="{{ v }}"')), /must be a static value/));
  it("an event attribute outside the allow-list", () => fails(() => convert('<div onMouseDown="{{ h }}"></div>'), /unsupported attribute "onMouseDown"/));
  it("an event attribute bound to a literal", () => fails(() => convert('<div onClick="notBound"></div>'), /must be a binding to a function/));
  it("an <img> with a dynamic or unknown src", () => {
    fails(() => convert('<img src="{{ s }}" alt="x">'), /<img src> must be a static path/);
    fails(() => convert('<img src="assets/missing.png" alt="x">'), /was not provided/);
    fails(() => convert('<img src="../secret.png" alt="x">', "", { assets: { "../secret.png": new Uint8Array(1) } }), /unsupported asset path/);
    fails(() => convert('<img src="https://x.test/a.png" alt="x">'), /unsupported asset path/);
    fails(() => convert('<img src="/abs.png" alt="x">'), /unsupported asset path/);
  });
  it("two different assets sharing a file name", () => {
    const assets = { "a/logo.png": new Uint8Array([1]), "b/logo.png": new Uint8Array([2]) };
    fails(() => convert('<img src="a/logo.png" alt="x"><img src="b/logo.png" alt="y">', "", { assets }), /share the file name/);
  });
});

describe("fail loud: helmet CSS", () => {
  it("@supports", () => fails(() => convert("<div></div>", "@supports (display:grid){div{color:red}}"), /unsupported at-rule @supports/));
  it("@font-face and @import", () => {
    fails(() => convert("<div></div>", "@font-face{font-family:x}"), /unsupported at-rule @font-face/);
    fails(() => convert("<div></div>", "@import url(x.css);a{b:c}"), /unexpected text|unsupported at-rule/);
  });
  it("!important in an inline style (fails closed)", () => {
    fails(() => convert('<p style="color:red !important">x</p>'), /"!important" in an inline style/);
    fails(() => convert('<p style="color:red!important">x</p>'), /"!important" in an inline style/);
  });
  it("html/body/:root used as more than a whole selector", () => {
    fails(() => convert("<div></div>", "body > div{color:red}"), /more than a whole selector/);
    fails(() => convert("<div></div>", "html body{color:red}"), /more than a whole selector/);
  });
  it("nested rules and unbalanced braces", () => {
    fails(() => convert("<div></div>", "a{b{color:red}}"), /nested CSS rules|malformed/);
    fails(() => convert("<div></div>", "a{color:red"), /unbalanced braces/);
  });
});

describe("fail loud: configuration rules", () => {
  it("replaceText with a wrong count", () => {
    fails(() => convert("<p>x</p>", "", { rules: { replaceText: [{ from: "<p>", to: "<p>", expect: 2 }] } }), /matched 1 time\(s\), expected 2/);
  });
  it("a stale omitIf rule that matches nothing", () => {
    fails(() => convert("<div></div>", "", { rules: { omitIf: [{ tag: "section" }] } }), /matched nothing \(stale rule\)/);
  });
  it("forbid text and forbid regex fail the build and name the output file", () => {
    fails(() => convert("<p>secret-word</p>", "", { forbid: [{ text: "secret-word" }] }), /forbidden text "secret-word" in generated output \(t\/T\.tsx\)/, undefined, /^t\/T\.tsx:\d+: /);
    fails(() => convert("<p>Flash sale</p>", "", { forbid: [{ regex: "\\bFlash\\b" }] }), /forbidden pattern/, undefined, /^t\/T\.tsx:\d+: /);
  });
  it("a replaceText that would introduce a style attribute is caught by the output invariant", () => {
    fails(
      () => convert("<p>X</p>", "", { rules: { replaceText: [{ from: "X", to: "style=y", expect: 1 }] } }),
      /generated output contains a style="\.\.\." attribute or prop/,
      undefined,
      /^t\/T\.tsx:\d+: /,
    );
  });
});

describe("mapping: styles", () => {
  it("a static style becomes a scoped class; identical text shares one class", () => {
    const r = convert('<div><span style="width:1px;height:20px;background:#2D343F"></span><span style="width: 1px; HEIGHT:20px; background:#2D343F"></span></div>');
    const classes = [...tsx(r).matchAll(/className="(dc-t-s[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(classes).toHaveLength(2);
    expect(classes[0]).toBe(classes[1]);
    expect(css(r)).toContain(`.dc-t .${classes[0]} { width: 1px; height: 20px; background: #2D343F; }`);
    expect(tsx(r)).not.toMatch(/\bstyle\s*=/);
  });
  it("a whole-value binding becomes var(--dc-0) set from a ref", () => {
    const r = convert('<div style="opacity:{{ c.op }}"></div>');
    expect(css(r)).toMatch(/opacity: var\(--dc-0\);/);
    expect(tsx(r)).toContain('ref={dcVars({ "--dc-0": get(scope, "c.op") })}');
    expect(r.bindings).toEqual(["c"]);
  });
  it("a binding with a glued unit becomes calc(var() * 1unit); bindings are numbered in order", () => {
    const r = convert('<div style="transform:translateY(calc(-50% + {{ a }}cqw)) scale({{ b }});opacity:{{ c }}"></div>');
    expect(css(r)).toContain("transform: translateY(calc(-50% + calc(var(--dc-0) * 1cqw))) scale(var(--dc-1)); opacity: var(--dc-2);");
    expect(tsx(r)).toContain('{ "--dc-0": get(scope, "a"), "--dc-1": get(scope, "b"), "--dc-2": get(scope, "c") }');
  });
  it("a numeric literal binding is inlined", () => {
    expect(css(convert('<div style="width:{{ 14 }}px"></div>'))).toContain("width: 14px;");
  });
  it("hover, focus and active rules follow the base rule in that order", () => {
    const r = convert('<button style="color:red" style-hover="color:blue" style-focus="outline:none" style-active="color:green"></button>');
    const lines = css(r).split("\n").filter((l) => l.startsWith(".dc-t "));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^\.dc-t \.dc-t-s[0-9a-f]{6} \{ color: red; \}$/);
    expect(lines[1]).toContain(":hover { color: blue; }");
    expect(lines[2]).toContain(":focus { outline: none; }");
    expect(lines[3]).toContain(":active { color: green; }");
  });
  it("an element with only style-hover still gets a class", () => {
    const r = convert('<a style-hover="color:red">x</a>');
    expect(tsx(r)).toMatch(/className="dc-t-s[0-9a-f]{6}"/);
    expect(css(r)).toContain(":hover { color: red; }");
  });
  it("a style that names a helmet keyframe uses the prefixed name", () => {
    const r = convert('<div style="animation:spin 1s linear infinite"></div>', "@keyframes spin{to{transform:rotate(1turn)}}");
    expect(css(r)).toContain("@keyframes dc-t-spin");
    expect(css(r)).toMatch(/animation: dc-t-spin 1s linear infinite;/);
    expect(r.keyframes).toEqual({ spin: "dc-t-spin" });
    expect(tsx(r)).toContain('{ "spin": "dc-t-spin" }');
  });
});

describe("mapping: helmet CSS scoping", () => {
  it("html/body/:root map to the root; * and element selectors are :where()-prefixed", () => {
    const out = css(convert("<div></div>", "*{box-sizing:border-box}html,body{margin:0}a{color:red}a:hover{color:blue}:root{--x:1}"));
    expect(out).toContain(":where(.dc-t), :where(.dc-t) * {");
    expect(out).toMatch(/\.dc-t \{\s*margin: 0;\s*\}/);
    expect(out).toContain(":where(.dc-t) a {");
    expect(out).toContain(":where(.dc-t) a:hover {");
    expect(out).toMatch(/\.dc-t \{\s*--x: 1;\s*\}/);
  });
  it("keeps @media and !important, scoping the rules inside", () => {
    const out = css(convert("<div></div>", "@media (prefers-reduced-motion: reduce){[data-fx],[data-fx] *{animation:none!important}}"));
    expect(out).toContain("@media (prefers-reduced-motion: reduce) {");
    expect(out).toContain(":where(.dc-t) [data-fx], :where(.dc-t) [data-fx] * {");
    expect(out).toContain("animation: none!important;");
  });
  it("accepts a container query", () => {
    expect(css(convert("<div></div>", "@container (min-width: 300px){a{color:red}}"))).toContain("@container (min-width: 300px) {");
  });
});

describe("mapping: markup", () => {
  it("sc-if becomes a truthy conditional; several children are wrapped in a Fragment", () => {
    const one = tsx(convert('<sc-if value="{{ p }}"><div>a</div></sc-if>'));
    expect(one).toContain('{truthy(get(scope, "p")) ? (');
    expect(one).not.toContain("<Fragment>");
    const many = tsx(convert('<sc-if value="{{ p }}"><div>a</div><div>b</div></sc-if>'));
    expect(many).toContain("<Fragment>");
    expect(many).toContain('import { Fragment } from "react";');
  });
  it("sc-for uses childScope, $index and a keyed Fragment; nesting uses s2 and shadows", () => {
    const out = tsx(convert('<sc-for list="{{ l }}" as="x"><sc-for list="{{ x.items }}" as="x"><span>{{ x.name }}{{ $index }}</span></sc-for></sc-for>'));
    expect(out).toContain('asList(get(scope, "l")).map((item1, i1) => {');
    expect(out).toContain('const s1 = childScope(scope, { "x": item1, "$index": i1 });');
    expect(out).toContain('asList(get(s1, "x.items")).map((item2, i2) => {');
    expect(out).toContain('const s2 = childScope(s1, { "x": item2, "$index": i2 });');
    expect(out).toContain('{asNode(get(s2, "x.name"))}');
    expect(out).toContain('{asNode(get(s2, "$index"))}');
    expect(out).toContain("<Fragment key={i2}>");
  });
  it("a style var inside sc-for reads the loop scope (its own callback ref per item)", () => {
    const out = tsx(convert('<sc-for list="{{ l }}" as="c"><span style="opacity:{{ c.op }}"></span></sc-for>'));
    expect(out).toContain('ref={dcVars({ "--dc-0": get(s1, "c.op") })}');
  });
  it("loop variables are not root bindings; root paths record their first segment", () => {
    const r = convert('<sc-for list="{{ rows }}" as="r"><span>{{ r.a }}{{ other.b.c }}</span></sc-for>');
    expect(r.bindings).toEqual(["other", "rows"]);
  });
  it("attribute renames and typed attributes", () => {
    const out = tsx(convert('<label class="c" for="f" tabindex="0"><svg viewBox="0 0 1 1" stroke-width="1.5" stroke-linecap="round"><path d="M0 0"></path></svg></label>'));
    expect(out).toContain('className="c"');
    expect(out).toContain('htmlFor="f"');
    expect(out).toContain("tabIndex={0}");
    expect(out).toContain('strokeWidth="1.5"');
    expect(out).toContain('strokeLinecap="round"');
    expect(out).toContain('viewBox="0 0 1 1"');
  });
  it("aria attributes use narrowing helpers; static values pass through", () => {
    const out = tsx(convert('<div aria-checked="{{ c }}" aria-selected="{{ s }}" aria-valuenow="{{ n }}" aria-current="{{ k }}" aria-label="{{ l }}" aria-hidden="true"></div>'));
    expect(out).toContain('aria-checked={asTristate(get(scope, "c"))}');
    expect(out).toContain('aria-selected={asBooleanish(get(scope, "s"))}');
    expect(out).toContain('aria-valuenow={asNumber(get(scope, "n"))}');
    expect(out).toContain('aria-current={asCurrent(get(scope, "k"))}');
    expect(out).toContain('aria-label={asText(get(scope, "l"))}');
    expect(out).toContain('aria-hidden="true"');
  });
  it("an input with value and onChange is controlled; without onChange it is read-only", () => {
    const a = tsx(convert('<input value="{{ v }}" onChange="{{ h }}">'));
    expect(a).toContain('value={asString(get(scope, "v"))}');
    expect(a).toContain('onChange={asHandler(get(scope, "h")) ?? noop}');
    expect(a).not.toContain("readOnly");
    const b = tsx(convert('<input value="{{ v }}">'));
    expect(b).toContain("readOnly");
  });
  it("event attributes are narrowed with asHandler, never passed as strings", () => {
    const out = tsx(convert('<button onClick="{{ go }}" onKeyDown="{{ k }}" onPointerDown="{{ p }}"></button>'));
    expect(out).toContain('onClick={asHandler(get(scope, "go"))}');
    expect(out).toContain('onKeyDown={asHandler(get(scope, "k"))}');
    expect(out).toContain('onPointerDown={asHandler(get(scope, "p"))}');
  });
  it("a ref plus dynamic style are merged", () => {
    const out = tsx(convert('<div ref="{{ r }}" style="opacity:{{ o }}"></div>'));
    expect(out).toContain('ref={mergeRefs(asRef(get(scope, "r")), dcVars({ "--dc-0": get(scope, "o") }))}');
    expect(tsx(convert('<div ref="{{ r }}"></div>'))).toContain('ref={asRef(get(scope, "r"))}');
  });
  it("boolean attributes and typed literals", () => {
    const out = tsx(convert(`<div><button disabled="{{ d }}"></button><x-import component-from-global-scope="${DS}.Icon" name="play" size="{{ 14 }}"></x-import></div>`));
    expect(out).toContain('disabled={asBool(get(scope, "d"))}');
    expect(out).toContain('<Icon name="play" size={14} />');
  });
  it("x-import props are camelCased and coerced by kind; hint-*, dc-props and the namespace are dropped", () => {
    const r = convert(
      `<x-import component-from-global-scope="${DS}.Button" variant="primary" size="lg" icon-right="check" on-click="{{ go }}" dc-props="{{ fw }}" hint-size="1px,2px">Save</x-import>`,
    );
    expect(tsx(r)).toMatch(/<Button variant="primary" size="lg" iconRight="check" onClick=\{asHandler\(get\(scope, "go"\)\)\}>\s*Save\s*<\/Button>/);
    expect(tsx(r)).toContain("// Not applied: dc-props");
    expect(tsx(r)).toContain('import { Button } from "../../ds/index.js";');
    expect(tsx(r)).not.toContain("hint-");
    expect(tsx(r)).not.toContain("component-from-global-scope");
  });
  it("x-import Select/SegmentedControl/Toast use the options and action helpers", () => {
    const out = tsx(
      convert(
        `<div><x-import component-from-global-scope="${DS}.Select" label="Sort" options="{{ o }}" value="{{ v }}" on-change="{{ c }}" width="152px"></x-import>` +
          `<x-import component-from-global-scope="${DS}.Toast" variant="info" title="{{ t }}" action="{{ a }}" on-close="{{ x }}"></x-import></div>`,
      ),
    );
    expect(out).toContain('options={asOptions(get(scope, "o"))}');
    expect(out).toContain('label="Sort"');
    expect(out).toContain('width="152px"');
    expect(out).toContain('title={asString(get(scope, "t"))}');
    expect(out).toContain('action={asAction(get(scope, "a"))}');
  });
  it("a static style on an Icon x-import becomes className", () => {
    const out = tsx(convert(`<x-import component-from-global-scope="${DS}.Icon" name="play" style="color:red;margin-top:1px"></x-import>`));
    expect(out).toMatch(/<Icon className="dc-t-s[0-9a-f]{6}" name="play" \/>|<Icon name="play" className="dc-t-s[0-9a-f]{6}" \/>/);
  });
  it("dc-import becomes the backdrop slot and its props are recorded as not forwarded", () => {
    const r = convert('<div><dc-import name="Other" playing="{{ false }}" warning="{{ false }}" hint-size="100%,100%"></dc-import></div>');
    expect(tsx(r)).toContain("{backdrop}");
    expect(tsx(r)).toContain("export function T({ data, backdrop }: DcProps)");
    expect(tsx(r)).toContain("// Not forwarded: dc-import props (playing, warning)");
  });
  it("an <img> becomes an asset import and the bytes are copied unchanged", () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const r = convert('<img src="assets/neontype-logo.png" alt="Logo">', "", { assets: { "assets/neontype-logo.png": bytes } });
    expect(tsx(r)).toContain('import neontypeLogo from "./assets/neontype-logo.png";');
    expect(tsx(r)).toContain('<img src={neontypeLogo} alt="Logo" />');
    const asset = r.files.find((f) => f.path === "t/assets/neontype-logo.png");
    expect(asset?.content).toBe(bytes);
  });
  it("static text: whitespace collapses, special characters are escaped as JSON strings", () => {
    const out = tsx(convert("<div>\n  Hello   {{ n }}  world &amp; { }\n</div>"));
    expect(out).toContain("Hello");
    expect(out).toContain('{asNode(get(scope, "n"))}');
    expect(out).toContain('{" world & { }"}');
    expect(out).not.toMatch(/\bstyle\s*=/);
  });
  it("U+2028 / U+2029 never appear raw in generated code", () => {
    const out = tsx(convert("<div>a\u2028b\u2029c</div>"));
    expect(out).not.toMatch(/[\u2028\u2029]/);
  });
  it("the root carries ds-root and the screen class; the component name and constants follow the file name", () => {
    const r = convertDc(doc("<div></div>"), { fileName: "My Cool Screen.dc.html" });
    expect(r.slug).toBe("my-cool-screen");
    expect(r.componentName).toBe("MyCoolScreen");
    const t = r.files.find((f) => f.path.endsWith(".tsx"))?.content as string;
    expect(t).toContain('<div className="ds-root dc-my-cool-screen" />');
    expect(t).toContain("export const MY_COOL_SCREEN_BINDINGS");
    expect(t).toContain('import "../../ds/ds.css";\nimport "./my-cool-screen.css";');
  });
  it("omitIf removes the matched element and replaceText rewrites the input", () => {
    const r = convert('<div><p data-screen-label="Review bar">gone</p><p>kept</p></div>', "", {
      rules: { omitIf: [{ attr: { "data-screen-label": "Review bar" } }], replaceText: [{ from: "kept", to: "stays", expect: 1 }] },
    });
    expect(tsx(r)).not.toContain("gone");
    expect(tsx(r)).toContain("stays");
  });
  it("omitIf can match on tag and text", () => {
    const r = convert("<div><p>drop me</p><p>keep me</p></div>", "", { rules: { omitIf: [{ tag: "p", text: "drop" }] } });
    expect(tsx(r)).not.toContain("drop me");
    expect(tsx(r)).toContain("keep me");
  });
  it("CRLF and BOM input is normalised, and the hash is of the raw bytes", () => {
    const text = doc("<div>x</div>");
    const a = convertDc(text, { fileName: "T.dc.html" });
    const b = convertDc("\uFEFF" + text.replace(/\n/g, "\r\n"), { fileName: "T.dc.html" });
    expect(css(a)).toBe(css(b));
    expect(tsx(a).replace(/\/\/ sha256: .*\n/, "")).toBe(tsx(b).replace(/\/\/ sha256: .*\n/, ""));
    expect(tsx(a)).not.toBe(tsx(b)); // different raw bytes, different hash
  });
});
describe("root-rule scoping (finding C-1)", () => {
  /** The class names a root-only rule can have, e.g. `.dc-t.dc-t-s1a2b3c`. */
  const onRoot = /^\.dc-t\.dc-t-s[0-9a-f]{6}(:hover)? \{/m;
  const descendant = /^\.dc-t \.dc-t-s[0-9a-f]{6}(:hover)? \{/m;
  it("a root element's own style rule matches the root itself, not a descendant", () => {
    const out = css(convertRaw('<div style="position: fixed; inset: 0"><span>x</span></div>'));
    expect(out).toMatch(onRoot);
    expect(out).not.toMatch(descendant);
    // The root really carries both classes the rule needs.
    expect(tsx(convertRaw('<div style="position: fixed; inset: 0"><span>x</span></div>'))).toMatch(/className="ds-root dc-t dc-t-s[0-9a-f]{6}"/);
  });
  it("a child element's rule stays a descendant rule", () => {
    const out = css(convertRaw('<div style="position: fixed"><span style="color: red">x</span></div>'));
    expect(out).toMatch(onRoot);
    expect(out).toMatch(descendant);
    expect(out.match(/^\.dc-t\.dc-t-s/gm)?.length).toBe(1);
    expect(out.match(/^\.dc-t \.dc-t-s/gm)?.length).toBe(1);
  });
  it("a style the root shares with a child is emitted for both", () => {
    const out = css(convertRaw('<div style="color: red"><span style="color: red">x</span></div>'));
    expect(out).toMatch(/^\.dc-t\.dc-t-s([0-9a-f]{6}) \{|^\.dc-t\.dc-t-s([0-9a-f]{6}), \.dc-t \.dc-t-s\2 \{/m);
    expect(out).toMatch(/^(\.dc-t\.dc-t-s[0-9a-f]{6}), \.dc-t \.dc-t-s[0-9a-f]{6} \{ color: red; \}$/m);
  });
  it("hover and focus rules on the root follow the same scoping", () => {
    const out = css(convertRaw('<div style="color: red" style-hover="color: blue"><span>x</span></div>'));
    expect(out).toMatch(/^\.dc-t\.dc-t-s[0-9a-f]{6}:hover \{/m);
    expect(out).not.toMatch(/^\.dc-t \.dc-t-s[0-9a-f]{6}:hover/m);
  });
  it("a root with no style produces no root rule", () => {
    const out = css(convertRaw("<div><span>x</span></div>"));
    expect(out).not.toMatch(/^\.dc-t\.dc-t-s/m);
  });
});
describe("boolean attributes and design-time props (owner-approved, narrow)", () => {
  it("each allowlisted valueless boolean is emitted as attr={true}", () => {
    const cases: [string, string][] = [
      ["<button disabled>x</button>", "disabled={true}"],
      ["<input type=\"checkbox\" checked>", "checked={true}"],
      ["<input readonly>", "readOnly={true}"],
      ["<input required>", "required={true}"],
      ["<div hidden>x</div>", "hidden={true}"],
      ["<input type=\"file\" multiple>", "multiple={true}"],
      ["<input autofocus>", "autoFocus={true}"],
      ["<select disabled><option value=\"a\" selected>A</option></select>", "selected={true}"],
    ];
    for (const [body, want] of cases) expect(tsx(convert(body)), body).toContain(want);
  });
  it("is case-insensitive in the source and equals the valued form", () => {
    expect(tsx(convert("<button DISABLED>x</button>"))).toContain("disabled={true}");
    // The header carries the source hash, which differs; the code below it must not.
    const body = (s: string): string => s.replace(/^\/\/ sha256:.*$/m, "");
    const bare = body(tsx(convert("<button disabled>x</button>")));
    const valued = body(tsx(convert('<button disabled="true">x</button>')));
    expect(bare).toBe(valued);
  });
  it("a valueless attribute that is not an allowlisted boolean still fails closed", () => {
    for (const bad of ["inert", "download", "open", "async", "draggable", "contenteditable"]) {
      fails(() => convert(`<div ${bad}></div>`), /has no value/, 5);
    }
  });
  it("a valueless boolean on a bound value is still a normal error (disabled=\"{{ x }}\" works, disabled=\"maybe\" fails)", () => {
    expect(tsx(convert('<button disabled="{{ off }}">x</button>'))).toContain("disabled={asBool(");
    fails(() => convert('<button disabled="maybe">x</button>'), /must be true or false/, 5);
  });
  it("a single-quoted data-props on the design-time data script is accepted and dropped", () => {
    const withProps = doc(
      "<div>x</div>",
    ).replace("</x-dc>", `<script type="text/x-dc" data-dc-script data-props='{"step":{"default":"a \\"b\\"","options":["x"]}}'>class Component extends DCLogic {}</script>\n</x-dc>`);
    const out = convertDc(withProps, { fileName: "T.dc.html" });
    expect(out.files.find((f) => f.path.endsWith(".tsx"))?.content).not.toContain("data-props");
  });
  it("a single-quoted value anywhere else still fails closed", () => {
    fails(() => convert("<div class='a'></div>"), /double-quoted/, 5);
    fails(() => convert("<span aria-label='x'>y</span>"), /double-quoted/, 5);
    const onOtherScript = doc("<div>x</div>").replace("</x-dc>", "<style data-x='1'>a{}</style>\n</x-dc>");
    expect(() => convertDc(onOtherScript, { fileName: "T.dc.html" })).toThrow(/double-quoted/);
  });
});
describe("native form elements: select, option, textarea (owner-approved)", () => {
  const SELECT = '<select value="{{ v }}" onChange="{{ h }}"><sc-for list="{{ opts }}" as="o"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select>';
  it("a select with value and onChange, and options under sc-for, is accepted", () => {
    const out = tsx(convert(SELECT));
    expect(out).toMatch(/<select value=\{asString\(/);
    expect(out).toMatch(/onChange=\{asHandler\(.*\) \?\? noop\}/);
    expect(out).toContain("<option value=");
    expect(out).not.toContain("readOnly");
  });
  it("a select with no onChange is accepted only when disabled, and never gets readOnly", () => {
    const out = tsx(convert('<select value="{{ v }}" disabled><option value="a">A</option></select>'));
    expect(out).toContain("disabled={true}");
    expect(out).not.toContain("readOnly");
    fails(() => convert('<select value="{{ v }}"><option value="a">A</option></select>'), /needs an onChange handler or must be disabled/, 5);
  });
  it("select: multiple is allowed without a bound value, aria-* and name and id are allowed, anything else fails", () => {
    expect(tsx(convert('<select multiple onChange="{{ h }}" aria-label="Pick" name="n" id="i"><option value="a">A</option></select>'))).toContain("multiple={true}");
    fails(() => convert('<select multiple value="{{ v }}" onChange="{{ h }}"><option value="a">A</option></select>'), /multiple.*not supported/, 5);
    fails(() => convert('<select onChange="{{ h }}" title="x"><option value="a">A</option></select>'), /attribute "title" is not supported on <select>/, 5);
    fails(() => convert('<select onChange="{{ h }}">text<option value="a">A</option></select>'), /text directly inside <select>/, 5);
    fails(() => convert('<select onChange="{{ h }}"><div></div></select>'), /<div> inside <select>/, 5);
  });
  it("an option takes a static or bound value, disabled, and selected; text content is its label", () => {
    const out = tsx(convert('<select disabled><option value="a" disabled>A</option><option value="{{ x }}" selected>B</option></select>'));
    expect(out).toContain('<option value="a" disabled={true}>');
    expect(out).toContain("selected={true}");
    fails(() => convert('<select disabled><option value="a" label="x">A</option></select>'), /attribute "label" is not supported on <option>/, 5);
  });
  it("an option outside a select fails, even under a directive", () => {
    fails(() => convert('<option value="a">A</option>'), /<option> is only supported inside <select>/, 5);
    fails(() => convert('<div><sc-for list="{{ l }}" as="o"><option value="a">A</option></sc-for></div>'), /<option> is only supported inside <select>/, 5);
  });
  it("a textarea with a bound value and onChange is accepted with rows, cols, maxlength, placeholder, aria-*", () => {
    const out = tsx(convert('<textarea class="a" rows="2" cols="30" maxlength="2000" placeholder="Type" aria-label="Text" value="{{ t }}" onChange="{{ h }}"></textarea>'));
    expect(out).toMatch(/<textarea /);
    expect(out).toContain("rows={2}");
    expect(out).toContain("cols={30}");
    expect(out).toContain("maxLength={2000}");
    expect(out).toContain('placeholder="Type"');
    expect(out).toMatch(/value=\{asString\(/);
    expect(out).not.toContain("readOnly");
  });
  it("a textarea without onChange is read-only", () => {
    expect(tsx(convert('<textarea value="{{ t }}"></textarea>'))).toContain("readOnly");
  });
  it("textarea content, a child element, and unsupported attributes fail closed", () => {
    fails(() => convert('<textarea value="{{ t }}">hello</textarea>'), /<textarea> content is not supported/, 5);
    fails(() => convert('<textarea value="{{ t }}"><span>x</span></textarea>'), /<textarea> content is not supported/, 5);
    fails(() => convert('<textarea value="{{ t }}" wrap="soft"></textarea>'), /attribute "wrap" is not supported on <textarea>/, 5);
    fails(() => convert('<textarea value="{{ t }}" rows="two"></textarea>'), /must be a number/, 5);
  });
});
describe("boolean attributes are valid only on their hosts", () => {
  it("selected only on <option>; multiple only on <select> and <input type=file>; checked only on <input>", () => {
    fails(() => convert("<input selected>"), /"selected" is not valid on <input>/, 5);
    fails(() => convert("<div selected></div>"), /"selected" is not valid on <div>/, 5);
    fails(() => convert('<input type="text" multiple>'), /only valid on <input type="file">/, 5);
    fails(() => convert("<button multiple>x</button>"), /"multiple" is not valid on <button>/, 5);
    fails(() => convert("<button checked>x</button>"), /"checked" is not valid on <button>/, 5);
    fails(() => convert("<div checked></div>"), /"checked" is not valid on <div>/, 5);
    expect(tsx(convert('<input type="checkbox" checked>'))).toContain("checked={true}");
    expect(tsx(convert('<input type="file" multiple>'))).toContain("multiple={true}");
  });
  it("the other booleans are limited to the elements they are valid on", () => {
    fails(() => convert("<div disabled></div>"), /"disabled" is not valid on <div>/, 5);
    fails(() => convert("<button readonly>x</button>"), /"readonly" is not valid on <button>/, 5);
    fails(() => convert("<div required></div>"), /"required" is not valid on <div>/, 5);
    expect(tsx(convert("<div hidden>x</div>"))).toContain("hidden={true}");
    expect(tsx(convert("<input readonly>"))).toContain("readOnly={true}");
    // A textarea gets readOnly from having no handler, not from a source attribute.
    fails(() => convert("<textarea readonly value=\"{{ t }}\"></textarea>"), /attribute "readonly" is not supported on <textarea>/, 5);
  });
});

describe("cascade layers", () => {
  const layered = (r: ReturnType<typeof convert>): { before: string; layer: string; after: string } => {
    const text = css(r);
    const i = text.indexOf("@layer screen {");
    expect(i, "an @layer screen block").toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    for (let k = text.indexOf("{", i); k < text.length; k++) {
      if (text[k] === "{") depth++;
      else if (text[k] === "}" && --depth === 0) {
        end = k;
        break;
      }
    }
    return { before: text.slice(0, i), layer: text.slice(i, end + 1), after: text.slice(end + 1) };
  };
  it("wraps all helmet rules in exactly one top-level @layer screen block", () => {
    const r = convert("<p>x</p>", ".a:hover:not(:disabled){color:red} @media (min-width:1px){.b{color:blue}} @keyframes k{from{opacity:0}to{opacity:1}} p{color:green}");
    expect(css(r).match(/@layer screen \{/g)).toHaveLength(1);
    const { before, layer, after } = layered(r);
    expect(before.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
    for (const frag of [".a:hover:not(:disabled)", ".b", "@keyframes", "p {"]) expect(layer).toContain(frag);
    expect(after).not.toMatch(/:hover:not|@media|@keyframes/);
  });
  it("emits no layer block for an empty helmet", () => {
    expect(css(convert("<p>x</p>"))).not.toContain("@layer");
  });
  it("keeps converted inline-style classes outside any @layer", () => {
    const r = convert('<p style="color:blue">x</p>', ".x:hover:not(:disabled){color:red}");
    const { layer, after } = layered(r);
    expect(layer).not.toContain("color: blue");
    expect(after).toContain("color: blue");
    expect(after).not.toContain("@layer");
  });
  it("accepts a high-specificity helmet selector next to an inline style", () => {
    expect(() => convert('<p class="x" style="color:blue">x</p>', ".x:hover:not(:disabled){color:red} #id.a.b{color:red}")).not.toThrow();
  });
});
