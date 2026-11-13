/**
 * The kind of each param of an effect, read from the engine's own param schema (through the public registry):
 * a `z.number()` is a number, a `z.enum([...])` is an enum with its values as options (a union of named literals and
 * curve objects, the easing type, is an enum of its named literals). Any other type (a boolean)
 * has no control in the editor and is left out. Defaults and optional wrappers are looked through.
 */
import { builtinRegistry } from "@studio/engine";
export type ParamKind = { kind: "number" } | { kind: "enum"; options: string[] };
/** Looks through default / optional / nullable wrappers of a Zod schema (structurally; the studio does not import Zod). */
function inner(schema: unknown): { def?: { type?: string; innerType?: unknown }; options?: unknown } | undefined {
  let cur = schema as { def?: { type?: string; innerType?: unknown } } | undefined;
  for (let i = 0; i < 6; i++) {
    const t = cur?.def?.type;
    if ((t === "default" || t === "optional" || t === "nullable") && cur?.def?.innerType !== undefined) cur = cur.def.innerType as typeof cur;
    else break;
  }
  return cur as { def?: { type?: string }; options?: unknown } | undefined;
}
/** The params of `effectId` that have a control, in the schema's key order. */
export function paramKinds(effectId: string): [key: string, kind: ParamKind][] {
  const shape = (builtinRegistry.get(effectId)?.paramSchema as { shape?: Record<string, unknown> } | undefined)?.shape;
  if (shape === undefined) return [];
  const out: [string, ParamKind][] = [];
  for (const [key, field] of Object.entries(shape)) {
    const f = inner(field);
    const type = f?.def?.type;
    if (type === "number") out.push([key, { kind: "number" }]);
    else if (type === "enum" && Array.isArray(f?.options)) out.push([key, { kind: "enum", options: (f.options as unknown[]).map(String) }]);
    else if (type === "union") {
      // An easing is a union of named literals and curve objects; the editor offers the named ones.
      const members = ((f?.def as { options?: unknown[] } | undefined)?.options ?? []) as { def?: { type?: string; values?: unknown[] } }[];
      const names = members.filter((m) => m.def?.type === "literal").flatMap((m) => (m.def?.values ?? []).map(String));
      if (names.length > 0) out.push([key, { kind: "enum", options: names }]);
    }
  }
  return out;
}
