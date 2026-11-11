import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import fc from "fast-check";
import {
  asAction, asBool, asBooleanish, asCurrent, asHandler, asList, asNode, asNumber, asOptions, asRef, asString, asText, asTristate,
  childScope, dcVars, get, mergeRefs, noop, rootScope, truthy, type DcData, type DcValue,
} from "./dc-runtime.js";

const data: DcData = { a: { b: { c: 5 } }, list: [10, 20, { x: "y" }], s: "str", n: 0, t: true };

describe("get", () => {
  const scope = rootScope(data);
  it("resolves dotted paths and array indices", () => {
    expect(get(scope, "a.b.c")).toBe(5);
    expect(get(scope, "list.1")).toBe(20);
    expect(get(scope, "list.2.x")).toBe("y");
  });
  it("returns undefined for any missing step and never throws", () => {
    for (const p of ["nope", "a.x.y", "a.b.c.d", "list.9", "list.-1", "list.01", "list.length", "s.length", "n.x"]) {
      expect(get(scope, p), p).toBeUndefined();
    }
  });
  it("never reads inherited properties", () => {
    for (const p of ["constructor", "__proto__", "toString", "a.constructor", "a.__proto__", "list.constructor"]) {
      expect(get(scope, p), p).toBeUndefined();
    }
  });
  it("resolves from the innermost scope outward and shadows", () => {
    const child = childScope(scope, { s: "inner", "$index": 3 });
    expect(get(child, "s")).toBe("inner");
    expect(get(child, "a.b.c")).toBe(5);
    expect(get(child, "$index")).toBe(3);
    expect(get(scope, "$index")).toBeUndefined();
  });
  it("property: get never throws for arbitrary paths", () => {
    fc.assert(fc.property(fc.string(), (p) => { get(rootScope(data), p); }), { numRuns: 300 });
  });
});

describe("coercions", () => {
  it("truthy is JavaScript truthiness ('0' and 'false' are truthy)", () => {
    for (const v of [0, "", null, undefined, false, Number.NaN] as DcValue[]) expect(truthy(v)).toBe(false);
    for (const v of ["0", "false", 1, "x", true, [], {}] as DcValue[]) expect(truthy(v)).toBe(true);
  });
  it("asList returns [] for a non-array", () => {
    expect(asList(5)).toEqual([]);
    expect(asList({ a: 1 })).toEqual([]);
    expect(asList([1, 2])).toEqual([1, 2]);
  });
  it("asNode renders strings, finite numbers and elements; nothing else", () => {
    const el = createElement("b");
    expect(asNode("x")).toBe("x");
    expect(asNode(3)).toBe(3);
    expect(asNode(Number.NaN)).toBeNull();
    expect(asNode(el)).toBe(el);
    expect(asNode({ a: 1 })).toBeNull();
    expect(asNode(true)).toBeNull();
    expect(asNode(null)).toBeNull();
    expect(asNode([el, "t"])).toEqual([el, "t"]);
  });
  it("asText / asString / asNumber / asBool", () => {
    expect(asText("a")).toBe("a");
    expect(asText(2.5)).toBe("2.5");
    expect(asText(Infinity)).toBeUndefined();
    expect(asText(true)).toBeUndefined();
    expect(asString(undefined)).toBe("");
    expect(asNumber(4)).toBe(4);
    expect(asNumber("4.5")).toBe(4.5);
    expect(asNumber("")).toBeUndefined();
    expect(asNumber("x")).toBeUndefined();
    expect(asNumber(Number.NaN)).toBeUndefined();
    expect(asBool(true)).toBe(true);
    expect(asBool("true")).toBeUndefined();
  });
  it("aria helpers accept only their token sets", () => {
    expect(asBooleanish("true")).toBe("true");
    expect(asBooleanish(false)).toBe(false);
    expect(asBooleanish("yes")).toBeUndefined();
    expect(asTristate("mixed")).toBe("mixed");
    expect(asTristate("false")).toBe("false");
    expect(asCurrent("page")).toBe("page");
    expect(asCurrent("true")).toBe("true");
    expect(asCurrent("nope")).toBeUndefined();
  });
});

describe("asHandler", () => {
  it("returns a callable wrapper that forwards arguments and the result", () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const h = asHandler(fn);
    expect(h).toBeDefined();
    expect(h?.(2, 3)).toBe(5);
    expect(fn).toHaveBeenCalledWith(2, 3);
  });
  it("is undefined for anything that is not a function (never a string)", () => {
    for (const v of ["alert(1)", 3, null, undefined, {}, [], true] as DcValue[]) expect(asHandler(v)).toBeUndefined();
  });
  it("noop does nothing", () => {
    expect(noop()).toBeUndefined();
  });
});

describe("asRef / mergeRefs", () => {
  it("asRef writes ref.current for a RefObject only", () => {
    const ref: { current: HTMLElement | null } = { current: null };
    const cb = asRef(ref);
    const el = {} as HTMLElement;
    cb?.(el);
    expect(ref.current).toBe(el);
    cb?.(null);
    expect(ref.current).toBeNull();
    for (const v of [{ a: 1 }, [], "r", null, undefined, createElement("i")] as DcValue[]) expect(asRef(v)).toBeUndefined();
  });
  it("mergeRefs calls every defined callback", () => {
    const a = vi.fn();
    const b = vi.fn();
    mergeRefs<number>(a, undefined, b)(7);
    expect(a).toHaveBeenCalledWith(7);
    expect(b).toHaveBeenCalledWith(7);
  });
});

describe("asOptions / asAction", () => {
  it("accepts strings and {value,label,disabled} objects, numbers as values", () => {
    expect(asOptions(["a", { value: "b", label: "B" }, { value: 24, label: "24" }, { value: "d", disabled: true }, { label: "no value" }, 5])).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "B" },
      { value: "24", label: "24" },
      { value: "d", label: "d", disabled: true },
    ]);
    expect(asOptions("nope")).toEqual([]);
  });
  it("asAction needs a label; onClick is optional and wrapped", () => {
    expect(asAction({ onClick: () => 1 })).toBeUndefined();
    expect(asAction({ label: "Undo" })).toEqual({ label: "Undo" });
    const act = asAction({ label: "Undo", onClick: () => 9 });
    expect(act?.label).toBe("Undo");
    expect(act?.onClick?.()).toBe(9);
  });
});

describe("dcVars", () => {
  function fakeEl() {
    const props = new Map<string, string>();
    return {
      props,
      el: {
        style: {
          setProperty: (n: string, v: string) => void props.set(n, v),
          removeProperty: (n: string) => void props.delete(n),
        },
      } as unknown as HTMLElement,
    };
  }
  it("writes finite numbers and strings, removes anything else", () => {
    const { el, props } = fakeEl();
    dcVars({ "--a": 3, "--b": "33.3%", "--c": 1 })(el);
    expect([...props.entries()]).toEqual([["--a", "3"], ["--b", "33.3%"], ["--c", "1"]]);
    dcVars({ "--a": undefined, "--b": Number.NaN, "--c": Infinity, "--d": true, "--e": null, "--f": { x: 1 } })(el);
    expect(props.has("--a") || props.has("--c")).toBe(false);
  });
  it("ignores the null call React makes on ref swap and returns nothing", () => {
    expect(dcVars({ "--a": 1 })(null)).toBeUndefined();
  });
  it("rejects a name without -- through setCssVars", () => {
    const { el } = fakeEl();
    expect(() => dcVars({ left: 1 })(el)).toThrow();
  });
});
