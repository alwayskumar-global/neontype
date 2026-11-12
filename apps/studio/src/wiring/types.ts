/**
 * Shared types for the screen adapters (Requirement 19; design, "Generated-screen wiring").
 *
 * An adapter is a PURE function `(state, dispatchers) => DcProps`: it reads a plain-data snapshot of the
 * store and the host's view state, and returns the data object a generated screen renders. It calls no
 * dispatcher while it builds that object; handlers in the data are closures over `dispatchers`.
 * Adapters import no React runtime, no engine render function, no exporter, no DOM, and no clock.
 */
import type { DcFn, DcValue } from "../ds/dc-runtime.js";
/**
 * The marker for a handler binding that is "inert in v1" (design table, kind I). It is ONE shared
 * function so a test can recognise it by identity; it does nothing, by design, and every adapter lists
 * the keys it is used for in `INERT_BINDINGS`.
 */
export const INERT: DcFn = () => undefined;
/** A list of binding keys, as exported by a generated screen (`*_BINDINGS`). */
export type BindingKeys = readonly string[];
/** Option shape the design-system selects and segmented controls read (`asOptions`). */
export interface Option {
  readonly value: string | number;
  readonly label: string;
}
/** Builds the data object for one screen: every binding key, nothing else. */
export type Data = { readonly [key: string]: DcValue };
