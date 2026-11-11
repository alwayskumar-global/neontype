/**
 * Design-source converter (Requirement 17): `convertDc(source, options)` turns one design-tool
 * `.dc.html` screen into a typed React component + scoped CSS. PURE: no file system, no clock,
 * no randomness. Node >= 20 built-ins only (node:crypto), no dependency.
 *
 * Deterministic: identical input gives byte-identical output (stable ordering, LF, no dates or
 * paths; class names come from a hash of the compiled declaration text).
 *
 * Stages: (a) read+hash, (b) tokenize+tree, (c) structure pass, (d) bindings, (e) style compiler,
 * (f) CSS scoper, (g) JSX emitter, (h) assets, (i) file writer + output rules.
 */
import { createHash } from "node:crypto";
import { DcConvertError, normalizeText, parseHtml, structurePass } from "./dc-parse.mjs";
import { createStyleRegistry, scopeCss } from "./dc-css.mjs";
import { createAssetRegistry, emitJsx, pascalCase, slugOf, DS_COMPONENTS } from "./dc-emit.mjs";

export { DcConvertError, DS_COMPONENTS, slugOf, pascalCase };

const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Output invariants that are NOT configurable. */
const INVARIANTS = [
  { text: "style=", why: 'a style="..." attribute or prop' },
  { text: "dangerouslySetInnerHTML", why: "a raw HTML sink" },
  { text: "<script", why: "a <script> element" },
  { text: "<style", why: "a <style> element" },
];

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Applies invariants and forbid rules to a generated text file; throws on a match. */
function checkOutput(path, text, forbid) {
  for (const inv of INVARIANTS) {
    const at = text.indexOf(inv.text);
    if (at >= 0) throw new DcConvertError(`generated output contains ${inv.why} (${path})`, path, lineOf(text, at));
  }
  for (const rule of forbid) {
    if (rule.text !== undefined) {
      const at = text.indexOf(rule.text);
      if (at >= 0) throw new DcConvertError(`forbidden text ${JSON.stringify(rule.text)} in generated output (${path})`, path, lineOf(text, at));
    } else if (rule.regex !== undefined) {
      const m = new RegExp(rule.regex, "u").exec(text);
      if (m) throw new DcConvertError(`forbidden pattern /${rule.regex}/ in generated output (${path})`, path, lineOf(text, m.index));
    } else {
      throw new DcConvertError(`forbid rule needs "text" or "regex": ${JSON.stringify(rule)}`, path, 1);
    }
  }
}

/** Escapes a string for use in a generated line comment (single line, no markers that trip the audits). */
const oneLine = (s) => s.replace(/[\r\n]+/g, " ");

/**
 * @param {string | Uint8Array} source  the .dc.html bytes or text
 * @param {{
 *   fileName: string,
 *   rules?: { omitIf?: object[], replaceText?: {from: string, to: string, expect: number}[], forbid?: object[] },
 *   forbid?: object[],
 *   assets?: Record<string, Uint8Array>,
 * }} options
 * @returns {{ slug: string, componentName: string, files: {path: string, content: string | Uint8Array}[],
 *            bindings: string[], keyframes: Record<string, string>, dropped: string[] }}
 */
export function convertDc(source, options) {
  const fileName = options.fileName;
  const rules = options.rules ?? {};
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;

  // (a) read + hash
  const sha = sha256Bytes(bytes);
  let text;
  try {
    text = normalizeText(typeof source === "string" ? source : decoder.decode(bytes));
  } catch {
    throw new DcConvertError("input is not valid UTF-8", fileName, 1);
  }
  for (const r of rules.replaceText ?? []) {
    if (typeof r.from !== "string" || r.from === "" || typeof r.to !== "string" || !Number.isInteger(r.expect)) {
      throw new DcConvertError(`invalid replaceText rule ${JSON.stringify(r)}`, fileName, 1);
    }
    const parts = text.split(r.from);
    const count = parts.length - 1;
    if (count !== r.expect) {
      throw new DcConvertError(`replaceText ${JSON.stringify(r.from)} matched ${count} time(s), expected ${r.expect}`, fileName, 1);
    }
    text = parts.join(r.to);
  }

  const base = fileName.replace(/\.dc\.html$/i, "");
  const slug = slugOf(base);
  const Name = pascalCase(base);
  if (!slug || !Name || !/^[A-Z]/.test(Name)) throw new DcConvertError(`cannot derive a component name from "${fileName}"`, fileName, 1);
  const CONST = slug.toUpperCase().replace(/-/g, "_");

  // (b) (c)
  const tree = parseHtml(text, fileName);
  const structure = structurePass(tree, fileName, rules.omitIf ?? []);

  // (f) CSS scoper (before styles so keyframe names are known)
  const scoped = scopeCss(structure.helmetCss, slug, fileName);

  // (e) (g) (h)
  const styles = createStyleRegistry(slug, scoped.keyframeMap);
  const assets = createAssetRegistry(options.assets ?? {});
  const emitted = emitJsx(structure.root, { file: fileName, slug, styles, assets });

  // ---- CSS file
  const cssParts = [
    `/* GENERATED by scripts/dc-convert.mjs from "${oneLine(fileName)}". Do not edit. */`,
    scoped.css,
    styles.render(),
  ].filter((p) => p !== "");
  const css = cssParts.join("\n\n") + "\n";

  // ---- TSX file
  const runtime = [...emitted.usedRuntime, "rootScope", "type DcProps"].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const ds = [...emitted.usedDs].sort();
  const importLines = [];
  importLines.push('import type { JSX } from "react";');
  if (emitted.usedFragment) importLines.push('import { Fragment } from "react";');
  if (ds.length) importLines.push(`import { ${ds.join(", ")} } from "../../ds/index.js";`);
  importLines.push(`import { ${runtime.join(", ")} } from "../../ds/dc-runtime.js";`);
  for (const [ident, path] of [...emitted.imports].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    importLines.push(`import ${ident} from ${JSON.stringify(path)};`);
  }
  importLines.push('import "../../ds/ds.css";');
  importLines.push(`import "./${slug}.css";`);

  const bindingsSorted = [...emitted.bindings].sort();
  const kfEntries = [...scoped.keyframeMap].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const header = [
    "// GENERATED by scripts/dc-convert.mjs. Do not edit; regenerate with `pnpm --filter @studio/app dc:convert`.",
    `// Source: ${oneLine(fileName)}`,
    `// sha256: ${sha}`,
  ];
  if (emitted.notForwarded.size) header.push(`// Not forwarded: dc-import props (${[...emitted.notForwarded].sort().join(", ")})`);
  if (emitted.notApplied.size) header.push(`// Not applied: ${[...emitted.notApplied].sort().join(", ")}`);

  const scopeLine = emitted.jsx.includes("scope") ? "  const scope = rootScope(data);\n" : "";
  const params = emitted.backdropUsed ? "{ data, backdrop }" : "{ data }";
  const tsx = [
    header.join("\n"),
    importLines.join("\n"),
    `export const ${CONST}_BINDINGS: readonly string[] = ${JSON.stringify(bindingsSorted)};\n` +
      `export const ${CONST}_KEYFRAMES: Readonly<Record<string, string>> = ${kfEntries.length ? `{ ${kfEntries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }` : "{}"};`,
    `export function ${Name}(${params}: DcProps): JSX.Element {\n${scopeLine}  return (\n    ${emitted.jsx}\n  );\n}`,
  ].join("\n\n") + "\n";

  const files = [
    { path: `${slug}/${slug}.css`, content: css },
    { path: `${slug}/${Name}.tsx`, content: tsx },
  ];
  for (const a of assets.list()) files.push({ path: `${slug}/assets/${a.base}`, content: a.bytes });

  // (i) output rules (text files only; assets are not scanned)
  const forbid = [...(options.forbid ?? []), ...(rules.forbid ?? [])];
  for (const f of files) if (typeof f.content === "string") checkOutput(f.path, f.content, forbid);

  return {
    slug,
    componentName: Name,
    files,
    bindings: bindingsSorted,
    keyframes: Object.fromEntries(kfEntries),
    dropped: structure.dropped,
  };
}
