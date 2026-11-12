/**
 * Design-source converter, stages (e) and (f): the style compiler and the CSS scoper.
 *
 *  (e) Every `style="..."` becomes classes in the screen's CSS. Static declarations stay literal;
 *      each `{{ binding }}` becomes a numbered CSS custom property (`var(--dc-N)`) that the emitted
 *      element sets from a ref callback through setCssVars (CSSOM; CSP-safe). Nothing is ever
 *      written to a DOM `style` attribute.
 *  (f) Helmet CSS is scoped under `:where(.dc-<slug>)` (zero specificity), so each rule keeps its
 *      source specificity; html/body/:root map to the root class. Keyframes names are prefixed. The whole
 *      block is wrapped in `@layer screen`; converted inline-style classes stay UNLAYERED, so an
 *      inline style beats every helmet rule whatever its specificity (as the source's style attribute did).
 *
 * Node built-ins only. Deterministic: class names come from a hash of the compiled text.
 */
import { createHash } from "node:crypto";
import { DcConvertError, parseBindings } from "./dc-parse.mjs";

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// ----------------------------------------------------------------------------------------------
// shared small scanners
// ----------------------------------------------------------------------------------------------

/** Splits `s` on `sep` at paren/bracket depth 0 and outside quotes. */
export function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === "\\") {
        cur += s[++i] ?? "";
      } else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
      cur += ch;
    } else if (ch === ")" || ch === "]") {
      depth--;
      cur += ch;
    } else if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const collapseWs = (s) => s.replace(/\s+/g, " ").trim();

/** Rewrites keyframe names inside an `animation` / `animation-name` value (identifier boundaries). */
function rewriteAnimationNames(prop, value, keyframeMap) {
  if (prop !== "animation" && prop !== "animation-name") return value;
  if (keyframeMap.size === 0) return value;
  return value
    .split(/(var\([^)]*\)|"[^"]*"|'[^']*')/)
    .map((part, idx) => {
      if (idx % 2 === 1) return part; // var(...) or a string: untouched
      return part.replace(/(^|[\s,])([A-Za-z_][\w-]*)(?=$|[\s,;])/g, (m, pre, name) =>
        keyframeMap.has(name) ? pre + keyframeMap.get(name) : m,
      );
    })
    .join("");
}

// ----------------------------------------------------------------------------------------------
// (e) style compiler
// ----------------------------------------------------------------------------------------------

/**
 * Compiles one declaration list. Returns { text, decls: [[prop, value]], vars: [{name, path}] }.
 * `text` is the normalised declaration text (bindings already replaced), used for hashing.
 * `varStart` lets a caller number several lists consistently (hover/focus/active carry no bindings).
 */
export function compileDeclarations(value, { file, line, keyframeMap, allowBindings }) {
  const segs = parseBindings(value, file, line);
  const vars = [];
  let joined = "";
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    if (seg.static !== undefined) {
      joined += seg.static;
      continue;
    }
    if (!allowBindings) throw new DcConvertError("bindings are not supported in style-hover / style-focus / style-active", file, line);
    const b = seg.binding;
    if (b.kind === "literal") {
      // A literal binding is inlined as its text; a following unit stays glued to it.
      joined += b.text;
      continue;
    }
    const name = `--dc-${vars.length}`;
    vars.push({ name, path: b.path });
    const next = segs[k + 1];
    const unit = next && next.static !== undefined ? /^[A-Za-z%]+/.exec(next.static) : null;
    if (unit) {
      joined += `calc(var(${name}) * 1${unit[0]})`;
      segs[k + 1] = { static: next.static.slice(unit[0].length) };
    } else {
      joined += `var(${name})`;
    }
  }
  const decls = [];
  for (const piece of splitTop(joined, ";")) {
    if (piece.trim() === "") continue;
    const colon = piece.indexOf(":");
    if (colon < 0) throw new DcConvertError(`malformed declaration "${collapseWs(piece)}" in style`, file, line);
    const prop = piece.slice(0, colon).trim().toLowerCase();
    let val = collapseWs(piece.slice(colon + 1));
    if (!prop || !val) throw new DcConvertError(`malformed declaration "${collapseWs(piece)}" in style`, file, line);
    if (/!\s*important\s*$/i.test(val)) {
      throw new DcConvertError(`"!important" in an inline style (${prop}) is not supported: the converted class is unlayered and could not reproduce its priority`, file, line);
    }
    val = rewriteAnimationNames(prop, val, keyframeMap);
    decls.push([prop, val]);
  }
  return { text: decls.map(([p, v]) => `${p}:${v}`).join(";"), decls, vars };
}

/**
 * A per-screen registry of style classes. `add` returns { className, vars } for one element's
 * style / style-hover / style-focus / style-active attributes.
 */
export function createStyleRegistry(slug, keyframeMap) {
  /** @type {Map<string, {hashed: string, base: any, states: Record<string, any>}>} */
  const classes = new Map();
  const hashToText = new Map();
  /** How many elements use each class, and how many of those are the screen root. */
  const uses = new Map();
  const rootUses = new Map();
  return {
    add({ style, hover, focus, active, file, line }) {
      const base = style !== undefined
        ? compileDeclarations(style, { file, line, keyframeMap, allowBindings: true })
        : { text: "", decls: [], vars: [] };
      const states = {};
      for (const [key, val] of [["hover", hover], ["focus", focus], ["active", active]]) {
        if (val !== undefined) states[key] = compileDeclarations(val, { file, line, keyframeMap, allowBindings: false });
      }
      let hashed = base.text;
      for (const key of ["hover", "focus", "active"]) if (states[key]) hashed += `\n${key}:${states[key].text}`;
      const h6 = sha256(hashed).slice(0, 6);
      const className = `dc-${slug}-s${h6}`;
      const prior = hashToText.get(h6);
      if (prior !== undefined && prior !== hashed) {
        throw new DcConvertError(`style class hash collision on ${h6}`, file, line);
      }
      hashToText.set(h6, hashed);
      if (!classes.has(className)) classes.set(className, { hashed, base, states });
      uses.set(className, (uses.get(className) ?? 0) + 1);
      return { className, vars: base.vars };
    },
    /**
     * Records that one use of `className` is the screen ROOT element. The root carries `dc-<slug>` itself, so a
     * descendant selector (`.dc-<slug> .cls`) can never match it; its rule is emitted as `.dc-<slug>.cls`.
     */
    markRoot(className) {
      rootUses.set(className, (rootUses.get(className) ?? 0) + 1);
    },
    /** The CSS for every registered class, sorted by class name. */
    render() {
      const fmt = (decls) => decls.map(([p, v]) => `${p}: ${v};`).join(" ");
      const out = [];
      for (const className of [...classes.keys()].sort()) {
        const { base, states } = classes.get(className);
        // Root-only class: match the root element itself. Shared with a descendant: match both.
        const nRoot = rootUses.get(className) ?? 0;
        const nAll = uses.get(className) ?? 0;
        const descendant = `.dc-${slug} .${className}`;
        const onRoot = `.dc-${slug}.${className}`;
        const sel = (suffix) => (nRoot === 0 ? descendant + suffix : nRoot >= nAll ? onRoot + suffix : `${onRoot}${suffix}, ${descendant}${suffix}`);
        if (base.decls.length) out.push(`${sel("")} { ${fmt(base.decls)} }`);
        for (const key of ["hover", "focus", "active"]) {
          if (states[key] && states[key].decls.length) out.push(`${sel(":" + key)} { ${fmt(states[key].decls)} }`);
        }
      }
      return out.join("\n");
    },
  };
}

// ----------------------------------------------------------------------------------------------
// (f) CSS scoper
// ----------------------------------------------------------------------------------------------

/** Removes /* ... *\/ comments (string-aware enough for helmet CSS). */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Returns the keyframe names defined in `css`. */
export function findKeyframeNames(css) {
  const names = [];
  const re = /@keyframes\s+([A-Za-z_][\w-]*)/g;
  let m;
  while ((m = re.exec(stripComments(css)))) names.push(m[1]);
  return [...new Set(names)].sort();
}

/** Scans a block starting at css[i] === "{"; returns the index of the matching "}". */
function matchBrace(css, i, file) {
  let depth = 0;
  let quote = "";
  for (let k = i; k < css.length; k++) {
    const ch = css[k];
    if (quote) {
      if (ch === "\\") k++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return k;
  }
  throw new DcConvertError("unbalanced braces in <helmet> CSS", file, 1);
}

const ROOT_ALIASES = new Set(["html", "body", ":root"]);

function scopeSelector(sel, root, file) {
  const s = sel.trim();
  if (s === "") throw new DcConvertError("empty selector in <helmet> CSS", file, 1);
  if (ROOT_ALIASES.has(s)) return { out: `.${root}`, root: true };
  if (/^(html|body|:root)(?![\w-])/.test(s)) {
    throw new DcConvertError(`selector "${s}" uses html/body/:root as more than a whole selector`, file, 1);
  }
  if (s === "*") return { out: `:where(.${root}), :where(.${root}) *`, root: false };
  return { out: `:where(.${root}) ${s}`, root: false };
}

function scopeBlockBody(body, ctx, depth, file) {
  const decls = [];
  for (const piece of splitTop(body, ";")) {
    if (piece.trim() === "") continue;
    if (piece.includes("{")) throw new DcConvertError("nested CSS rules are not supported in <helmet> CSS", file, 1);
    const colon = piece.indexOf(":");
    if (colon < 0) throw new DcConvertError(`malformed CSS declaration "${collapseWs(piece)}"`, file, 1);
    const prop = piece.slice(0, colon).trim();
    const val = rewriteAnimationNames(prop.toLowerCase(), collapseWs(piece.slice(colon + 1)), ctx.keyframeMap);
    decls.push(`${prop}: ${val};`);
  }
  return decls;
}

function scopeRules(css, ctx, file, indent) {
  const out = [];
  let i = 0;
  const pad = "  ".repeat(indent);
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    const open = css.indexOf("{", i);
    if (open < 0) throw new DcConvertError(`unexpected text "${collapseWs(css.slice(i, i + 40))}" in <helmet> CSS`, file, 1);
    const prelude = css.slice(i, open).trim();
    const close = matchBrace(css, open, file);
    const body = css.slice(open + 1, close);
    i = close + 1;
    if (prelude.startsWith("@")) {
      const at = /^@([A-Za-z-]+)\s*(.*)$/s.exec(prelude);
      const kind = at[1].toLowerCase();
      if (kind === "keyframes") {
        const name = at[2].trim();
        out.push(`${pad}@keyframes ${ctx.keyframeMap.get(name) ?? name} {\n${pad}  ${collapseWs(body)}\n${pad}}`);
      } else if (kind === "media" || kind === "container") {
        const inner = scopeRules(body, ctx, file, indent + 1);
        out.push(`${pad}@${kind} ${collapseWs(at[2])} {\n${inner}\n${pad}}`);
      } else {
        throw new DcConvertError(`unsupported at-rule @${kind} in <helmet> CSS`, file, 1);
      }
      continue;
    }
    const selectors = splitTop(prelude, ",").map((s) => scopeSelector(s, ctx.root, file));
    const seen = new Set();
    const outSelectors = [];
    for (const s of selectors) {
      if (seen.has(s.out)) continue;
      seen.add(s.out);
      outSelectors.push(s.out);
    }
    const decls = scopeBlockBody(body, ctx, indent, file);
    out.push(`${pad}${outSelectors.join(", ")} {\n${decls.map((d) => `${pad}  ${d}`).join("\n")}\n${pad}}`);
  }
  return out.join("\n");
}

/** Scopes helmet CSS under `.dc-<slug>`; returns { css, keyframeMap }. */
export function scopeCss(helmetCss, slug, file) {
  const root = `dc-${slug}`;
  const css = stripComments(helmetCss);
  const keyframeMap = new Map(findKeyframeNames(css).map((n) => [n, `${root}-${n}`]));
  const rules = scopeRules(css, { root, keyframeMap }, file, 1);
  return { css: rules === "" ? "" : `@layer screen {\n${rules}\n}`, keyframeMap };
}
