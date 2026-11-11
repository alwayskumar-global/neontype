/**
 * Structural equality for plain JSON values (objects, arrays, string, number,
 * boolean, null). Pure, no dependency. Used by the model to detect "this action
 * changed nothing" so the SAME Project reference is returned (undo history then
 * records no step) and unchanged subtrees stay shared.
 *
 * Key order is ignored; a key holding `undefined` is NOT the same as a missing
 * key (values here come from schema-validated JSON, which has no `undefined`).
 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!deepEqualJson(x[i], y[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  if (ak.length !== Object.keys(bo).length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqualJson(ao[k], bo[k])) return false;
  }
  return true;
}
