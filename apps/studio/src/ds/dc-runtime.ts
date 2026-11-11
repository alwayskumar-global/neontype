/**
 * Runtime helpers for generated screens (Requirement 18.4). Generated components are pure
 * render functions of `data`; everything they need at render time is here.
 *
 * No `any`, no `eval`, no type assertion in this file: narrowing uses `typeof`, `Array.isArray`,
 * `Object.hasOwn` and type predicates. Dynamic geometry goes through `setCssVars` (CSSOM), never a
 * JSX `style` prop (Requirement 11.2).
 */
import { isValidElement } from "react";
import type { ReactElement, ReactNode, RefObject } from "react";
import { setCssVars } from "../ui/cssvars.js";

/**
 * A function stored in screen data. The parameter list is `never[]` so a handler with ANY narrow
 * parameter types (`(e: ChangeEvent) => void`, `(v: string) => void`) can be stored here. It is NOT
 * directly callable as an event handler; `asHandler` returns a callable wrapper.
 */
export type DcFn = (...args: never[]) => unknown;

/** What `asHandler` returns: assignable to every event-handler and callback prop. */
export type DcHandler = (...args: unknown[]) => unknown;

export type DcValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReactElement
  | DcFn
  | RefObject<HTMLElement | null>
  | readonly DcValue[]
  | { readonly [key: string]: DcValue };

export type DcData = { readonly [key: string]: DcValue };
export type DcProps = { data: DcData; backdrop?: ReactNode };
export type Scope = { readonly vars: DcData; readonly parent: Scope | null };

export function rootScope(data: DcData): Scope {
  return { vars: data, parent: null };
}

export function childScope(parent: Scope, vars: DcData): Scope {
  return { vars, parent };
}

const isRecord = (v: DcValue): v is { readonly [key: string]: DcValue } =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !isValidElement(v);

function isRefObject(v: DcValue): v is RefObject<HTMLElement | null> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !isValidElement(v) && Object.hasOwn(v, "current");
}

/**
 * Resolves `a.b.c` from the innermost scope outward. Returns `undefined` for any missing step;
 * never throws and never reads inherited properties (`constructor`, `__proto__` are undefined).
 */
export function get(scope: Scope, path: string): DcValue {
  const parts = path.split(".");
  const first = parts[0];
  if (first === undefined) return undefined;
  let cursor: Scope | null = scope;
  let value: DcValue = undefined;
  let found = false;
  while (cursor !== null) {
    if (Object.hasOwn(cursor.vars, first)) {
      value = cursor.vars[first];
      found = true;
      break;
    }
    cursor = cursor.parent;
  }
  if (!found) return undefined;
  for (let i = 1; i < parts.length; i++) {
    const key = parts[i];
    if (key === undefined) return undefined;
    if (Array.isArray(value)) {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
      value = value[Number(key)];
    } else if (isRecord(value)) {
      if (!Object.hasOwn(value, key)) return undefined;
      value = value[key];
    } else {
      return undefined;
    }
  }
  return value;
}

/** JavaScript truthiness (the strings '0' and 'false' are truthy, exactly as in JS). */
export function truthy(value: DcValue): boolean {
  return Boolean(value);
}

/** An array, or `[]` for anything else. */
export function asList(value: DcValue): readonly DcValue[] {
  return Array.isArray(value) ? value : [];
}

/** String, finite number, React element (or an array of them) render; everything else renders nothing. */
export function asNode(value: DcValue): ReactNode {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isValidElement(value)) return value;
  if (Array.isArray(value)) return value.map(asNode);
  return null;
}

/** A string, or `String(n)` for a finite number; otherwise undefined. */
export function asText(value: DcValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asString(value: DcValue): string {
  return asText(value) ?? "";
}

export function asNumber(value: DcValue): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function asBool(value: DcValue): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** For aria-hidden / -selected / -busy / -modal: a boolean or the strings "true" / "false". */
export function asBooleanish(value: DcValue): boolean | "true" | "false" | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "false") return value;
  return undefined;
}

/** For aria-checked / aria-pressed: as asBooleanish, plus "mixed". */
export function asTristate(value: DcValue): boolean | "true" | "false" | "mixed" | undefined {
  return value === "mixed" ? "mixed" : asBooleanish(value);
}

/** For aria-current: a boolean or one of the allowed tokens. */
export function asCurrent(value: DcValue): boolean | "true" | "false" | "page" | "step" | "location" | "date" | "time" | undefined {
  if (value === "page" || value === "step" || value === "location" || value === "date" || value === "time") return value;
  return asBooleanish(value);
}

/** A callable wrapper around a function value, else undefined. Never a string. */
export function asHandler(value: DcValue): DcHandler | undefined {
  if (typeof value !== "function") return undefined;
  const fn = value;
  return (...args: unknown[]) => Reflect.apply(fn, undefined, args);
}

/** A ref callback that writes `ref.current`, for a RefObject value only. */
export function asRef(value: DcValue): ((el: HTMLElement | null) => void) | undefined {
  if (!isRefObject(value)) return undefined;
  const ref = value;
  return (el) => {
    ref.current = el;
  };
}

export type DcOption = { value: string; label: string; disabled?: boolean };

/** Options for Select / SegmentedControl: strings or `{ value, label, disabled? }` objects. */
export function asOptions(value: DcValue): readonly DcOption[] {
  const out: DcOption[] = [];
  for (const item of asList(value)) {
    if (typeof item === "string") {
      out.push({ value: item, label: item });
    } else if (isRecord(item)) {
      const v = asText(item["value"]);
      if (v === undefined) continue;
      const opt: DcOption = { value: v, label: asText(item["label"]) ?? v };
      if (asBool(item["disabled"]) === true) opt.disabled = true;
      out.push(opt);
    }
  }
  return out;
}

/** A Toast action `{ label, onClick? }`. */
export function asAction(value: DcValue): { label: string; onClick?: DcHandler } | undefined {
  if (!isRecord(value)) return undefined;
  const label = asText(value["label"]);
  if (label === undefined) return undefined;
  const onClick = asHandler(value["onClick"]);
  return onClick ? { label, onClick } : { label };
}

/**
 * Returns a ref callback that applies custom properties through `setCssVars`. A finite number is
 * written as `String(value)`, a string as given; anything else removes that property. Each render
 * may create a new callback; applying is idempotent. Returns `undefined` (no cleanup function).
 */
export function dcVars(vars: Readonly<Record<string, DcValue>>): (el: HTMLElement | SVGElement | null) => void {
  return (el) => {
    if (el === null) return;
    for (const [name, value] of Object.entries(vars)) {
      if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "string") {
        setCssVars(el, { [name]: value });
      } else {
        el.style.removeProperty(name);
      }
    }
  };
}

/** Combines several ref callbacks into one (undefined entries are skipped). */
export function mergeRefs<T>(...refs: readonly (((el: T | null) => void) | undefined)[]): (el: T | null) => void {
  return (el) => {
    for (const r of refs) r?.(el);
  };
}

export const noop = (): void => undefined;
