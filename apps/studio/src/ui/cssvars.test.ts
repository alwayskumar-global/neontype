import { describe, it, expect } from "vitest";
import { setCssVars } from "./cssvars.js";

function fakeEl() {
  const props: Record<string, string> = {};
  return { props, el: { style: { setProperty: (n: string, v: string) => { props[n] = v; } } } };
}

describe("setCssVars", () => {
  it("writes every variable through style.setProperty as strings", () => {
    const { el, props } = fakeEl();
    setCssVars(el, { "--x": 10, "--label": "a" });
    expect(props).toEqual({ "--x": "10", "--label": "a" });
  });
  it("rejects names without -- and non-finite numbers", () => {
    const { el } = fakeEl();
    expect(() => setCssVars(el, { left: 1 })).toThrow();
    expect(() => setCssVars(el, { "--x": Number.NaN })).toThrow();
    expect(() => setCssVars(el, { "--x": Infinity })).toThrow();
  });
});
