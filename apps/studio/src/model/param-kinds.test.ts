import { describe, it, expect } from "vitest";
import { presetCatalog } from "@studio/engine";
import { paramKinds } from "./param-kinds.js";
describe("paramKinds reads each effect's param schema", () => {
  it("maps numeric defaults to number and string defaults to enum, and leaves other types out", () => {
    for (const p of presetCatalog) {
      const kinds = Object.fromEntries(paramKinds(p.id));
      for (const [key, value] of Object.entries(p.defaultParams)) {
        if (typeof value === "number") expect(kinds[key], `${p.id}.${key}`).toEqual({ kind: "number" });
        else if (typeof value === "string") {
          const k = kinds[key];
          expect(k?.kind, `${p.id}.${key}`).toBe("enum");
          expect(k?.kind === "enum" && k.options.includes(value), `${p.id}.${key} default is one of the options`).toBe(true);
        } else expect(kinds[key], `${p.id}.${key} has no control`).toBeUndefined();
      }
    }
  });
  it("lists the typewriter params in schema order with the direction options", () => {
    expect(paramKinds("typewriter")).toEqual([
      ["startDelay", { kind: "number" }],
      ["delayPerCharacter", { kind: "number" }],
      ["direction", { kind: "enum", options: ["forward", "backward"] }],
    ]);
  });
  it("returns nothing for an unknown effect", () => {
    expect(paramKinds("no-such-effect")).toEqual([]);
  });
});
