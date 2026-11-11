import { describe, it, expect } from "vitest";
import { ICONS, ICON_NAMES, isIconName } from "./icons.js";
import { readTree } from "../../scripts/dc-io.mjs";

/** The exact set of icons the mockups reach, plus the three used inside ported components. */
const STATIC_NAMES = [
  "check", "chevron-left", "chevron-right", "close", "code", "copy", "download", "effect", "error", "export", "eye",
  "image", "info", "lock", "play", "plus", "redo", "search", "success", "text", "trash", "warning",
];
/** `icon: '...'` literals inside the design tool's data scripts (tests never read design/). */
const DATA_SCRIPT_NAMES = ["clock", "grid", "layers", "minus"];
const COMPONENT_INTERNAL = ["chevron-down"];
export const REFERENCED_ICONS = [...new Set([...STATIC_NAMES, ...DATA_SCRIPT_NAMES, ...COMPONENT_INTERNAL])].sort();

describe("icons", () => {
  it("ports exactly the 27 referenced icons, nothing extra", () => {
    expect(REFERENCED_ICONS).toHaveLength(27);
    expect([...ICON_NAMES]).toEqual(REFERENCED_ICONS);
  });

  it("every shape has finite numbers / a non-empty path", () => {
    for (const name of ICON_NAMES) {
      const shapes = ICONS[name];
      expect(shapes.length, name).toBeGreaterThan(0);
      for (const s of shapes) {
        if (s.tag === "path") expect(s.d.length, name).toBeGreaterThan(0);
        else if (s.tag === "rect") for (const n of [s.x, s.y, s.width, s.height, s.rx ?? 0]) expect(Number.isFinite(n), name).toBe(true);
        else for (const n of [s.cx, s.cy, s.r]) expect(Number.isFinite(n), name).toBe(true);
      }
    }
  });

  it("isIconName accepts ported names only (not inherited keys)", () => {
    expect(isIconName("play")).toBe(true);
    expect(isIconName("constructor")).toBe(false);
    expect(isIconName("viewport")).toBe(false);
  });

  it("every static name= / icon= / icon-right= literal in the generated screens is a ported icon", () => {
    const tree = readTree("src/generated");
    const used = new Set<string>();
    for (const [path, content] of Object.entries(tree)) {
      if (!path.endsWith(".tsx") || typeof content !== "string") continue;
      for (const m of content.matchAll(/<Icon\b[^>]*?\bname="([a-z-]+)"/g)) if (m[1]) used.add(m[1]);
      for (const m of content.matchAll(/<(?:Button|IconButton)\b[^>]*?\b(?:icon|iconRight)="([a-z-]+)"/g)) if (m[1]) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(5);
    for (const name of used) expect(isIconName(name), name).toBe(true);
  });
});
