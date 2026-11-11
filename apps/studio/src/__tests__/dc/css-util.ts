/**
 * A tiny, independent CSS reader for tests (it is NOT the converter's scoper, so it can check it).
 * Handles comments, nested @media/@container blocks and balanced braces.
 */
export interface CssRule {
  /** Text before the opening brace, e.g. `.a, .b` or `@media (x)`. */
  prelude: string;
  /** Text between the braces. */
  body: string;
  /** Parsed children when `prelude` is a grouping at-rule (@media / @container). */
  children: CssRule[];
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Throws on unbalanced braces. */
export function parseCss(css: string): CssRule[] {
  const text = stripComments(css);
  const rules: CssRule[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text.charAt(i))) i++;
    if (i >= text.length) break;
    const open = text.indexOf("{", i);
    if (open < 0) throw new Error(`stray text without a block: ${text.slice(i, i + 40)}`);
    let depth = 0;
    let k = open;
    for (; k < text.length; k++) {
      const ch = text.charAt(k);
      if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) break;
    }
    if (depth !== 0) throw new Error("unbalanced braces");
    const prelude = text.slice(i, open).trim();
    const body = text.slice(open + 1, k);
    const grouping = /^@(media|container)\b/.test(prelude);
    rules.push({ prelude, body, children: grouping ? parseCss(body) : [] });
    i = k + 1;
  }
  return rules;
}

/** Splits a selector list on top-level commas. */
export function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of prelude) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/** Every leaf (non-grouping) rule, flattened out of @media / @container. */
export function leafRules(rules: readonly CssRule[]): CssRule[] {
  return rules.flatMap((r) => (r.children.length || /^@(media|container)\b/.test(r.prelude) ? leafRules(r.children) : [r]));
}
