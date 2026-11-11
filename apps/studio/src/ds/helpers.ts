/**
 * Pure helpers for the design-system components (Requirement 18.3), kept out of `index.tsx` so
 * they run in Node tests without a DOM. No clock, no randomness.
 */

/** Modifier keys that scale a keyboard / scrub step. */
export interface StepMods {
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/**
 * The next NumberScrub value after one step: `value + direction * step * k`, where k is 10 with
 * Shift, 0.1 with Alt, else 1; rounded to `precision` decimals, then clamped to `min..max`.
 * Same arithmetic as the bundle's NumberScrub.
 */
export function stepNumber(
  value: number,
  direction: 1 | -1,
  step: number,
  mods: StepMods,
  min: number,
  max: number,
  precision: number,
): number {
  const k = mods.shift ? 10 : mods.alt ? 0.1 : 1;
  const next = value + direction * step * k;
  return Math.min(max, Math.max(min, Number(next.toFixed(precision))));
}

/** Clamps and rounds a typed value the same way a step does. */
export function clampRound(value: number, min: number, max: number, precision: number): number {
  return Math.min(max, Math.max(min, Number(value.toFixed(precision))));
}

export type CodeTokenKind = "text" | "com" | "tag" | "attr" | "str";
export type CodeToken = { readonly kind: CodeTokenKind; readonly text: string };

/**
 * Splits `code` into highlight tokens. Lossless: joining every token's `text` gives back `code`.
 * Left to right: `<!-- ... -->` is one `com` token (atomic); `<` or `</` followed by a lowercase tag
 * name gives a text token then a `tag` token; whitespace followed by `name="value"` gives a text
 * token, an `attr` token, a text `=` and a `str` token (quotes included). Everything else is text.
 * (The bundle re-highlights tags inside a comment; this port leaves a comment atomic.)
 */
export function tokenizeCode(code: string): readonly CodeToken[] {
  const out: { kind: CodeTokenKind; text: string }[] = [];
  const push = (kind: CodeTokenKind, text: string): void => {
    if (text === "") return;
    const last = out[out.length - 1];
    if (kind === "text" && last !== undefined && last.kind === "text") last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    if (rest.startsWith("<!--")) {
      const end = rest.indexOf("-->");
      const len = end === -1 ? rest.length : end + 3;
      push("com", rest.slice(0, len));
      i += len;
      continue;
    }
    const tag = /^(<\/?)([a-z][\w-]*)/.exec(rest);
    if (tag && tag[1] !== undefined && tag[2] !== undefined) {
      push("text", tag[1]);
      push("tag", tag[2]);
      i += tag[0].length;
      continue;
    }
    const attr = /^(\s)([a-z-]+)=("[^"]*")/.exec(rest);
    if (attr && attr[1] !== undefined && attr[2] !== undefined && attr[3] !== undefined) {
      push("text", attr[1]);
      push("attr", attr[2]);
      push("text", "=");
      push("str", attr[3]);
      i += attr[0].length;
      continue;
    }
    push("text", code.charAt(i));
    i += 1;
  }
  return out;
}
