/**
 * Binding-coverage and purity tests for the screen adapters (Requirement 19.2, 19.3). Every key of the
 * generated screen's `*_BINDINGS` list is present, none is extra, every handler either calls a documented
 * dispatcher or is a listed inert one, and building the data calls no dispatcher.
 */
import { describe, it, expect } from "vitest";
import { demoProject } from "../model/demo.js";
import { newProject } from "../model/project.js";
import { readStudioText } from "../../scripts/dc-io.mjs";
import { EFFECTS_LIBRARY_BINDINGS } from "../generated/effects-library/EffectsLibrary.js";
import { EXPORT_FLOW_BINDINGS } from "../generated/export-flow/ExportFlow.js";
import { adaptEffectsLibrary, INERT_BINDINGS as LIB_INERT } from "./effects-library.js";
import { adaptExportFlow, INERT_BINDINGS as EXP_INERT, TRY_NEXT } from "./export-flow.js";
import { ALL_ERROR_CODES, EXPORT_VIEWS, effectsSpy, exportRuns, exportSpy, exportState, libraryState } from "./fixtures.js";
import { INERT } from "./types.js";
import type { DcProps, DcValue } from "../ds/dc-runtime.js";
interface Built {
  props: DcProps;
  calls: string[];
}
interface Screen {
  name: string;
  bindings: readonly string[];
  inert: readonly string[];
  /** One build per fixture state, so handlers that depend on state (a selection, a run) are all reachable. */
  builds: () => Built[];
  /** Nested function paths that are pure formatters, not handlers. */
  pure: RegExp;
}
const projects = [newProject(), demoProject()];
const SCREENS: Screen[] = [
  {
    name: "Effects Library",
    bindings: EFFECTS_LIBRARY_BINDINGS,
    inert: LIB_INERT,
    pure: /\.fmt$/,
    builds: () =>
      projects.flatMap((p) =>
        [
          {},
          { sel: "typewriter", hover: "typewriter", toast: { id: "typewriter" } },
          { sel: "wave", staged: { wave: { split: "word" as const, ease: "easeIn", params: { amplitude: 30 } } }, query: "w", cats: ["Looping" as const], grans: ["word" as const] },
          { query: "zzz-no-match" },
        ].map((view) => {
          const s = effectsSpy();
          return { props: adaptEffectsLibrary(libraryState(p, view), s.d), calls: s.calls };
        }),
      ),
  },
  {
    name: "Export Flow",
    bindings: EXPORT_FLOW_BINDINGS,
    inert: EXP_INERT,
    pure: /\.$/,
    builds: () =>
      projects.flatMap((p) =>
        exportRuns().flatMap((run) =>
          EXPORT_VIEWS.map((view) => {
            const s = exportSpy();
            return { props: adaptExportFlow(exportState(p, run, view), s.d), calls: s.calls };
          }),
        ),
      ),
  },
];
/** Every function in `value` with its path (arrays and plain objects only). */
function functions(value: DcValue, path: string, out: { path: string; fn: (...a: unknown[]) => unknown }[] = []): { path: string; fn: (...a: unknown[]) => unknown }[] {
  if (typeof value === "function") out.push({ path, fn: value as (...a: unknown[]) => unknown });
  else if (Array.isArray(value)) value.forEach((v, i) => functions(v, `${path}[${i}]`, out));
  else if (typeof value === "object" && value !== null && !("$$typeof" in value) && !("current" in value)) {
    for (const [k, v] of Object.entries(value)) functions(v as DcValue, path === "" ? k : `${path}.${k}`, out);
  }
  return out;
}
const topKey = (path: string): string => path.split(/[.[]/)[0] ?? path;
/** An event-like argument that satisfies every handler's use of it. */
function eventArg(): Record<string, unknown> {
  const el = { value: "x" };
  return { target: el, currentTarget: el, value: "x", stopPropagation: () => undefined, key: "ArrowRight" };
}
describe.each(SCREENS)("$name adapter", (screen) => {
  it("returns every binding key and no other", () => {
    for (const b of screen.builds()) {
      expect(Object.keys(b.props.data).sort()).toEqual([...screen.bindings].sort());
    }
  });
  it("lists only real binding keys as inert, without duplicates", () => {
    expect(new Set(screen.inert).size).toBe(screen.inert.length);
    for (const k of screen.inert) expect(screen.bindings, k).toContain(k);
  });
  it("every handler calls a documented dispatcher in some state, or is a listed inert one that calls none", () => {
    // A handler may do nothing in a state where it does not apply (applying with no selection). It must
    // call its dispatcher in at least one fixture state; otherwise it is an unlisted inert handler.
    const everCalled = new Map<string, boolean>();
    for (const b of screen.builds()) {
      for (const { path, fn } of functions(b.props.data, "")) {
        if (screen.pure.test(path)) continue;
        const general = path.replace(/\[\d+\]/g, "[]");
        const before = b.calls.length;
        fn(eventArg());
        const called = b.calls.length - before;
        if (fn === INERT) {
          expect(screen.inert, `${path} is INERT but not listed`).toContain(topKey(path));
          expect(called, `${path} (inert) must call nothing`).toBe(0);
        } else {
          expect(screen.inert, `${path} is listed inert but is a live handler`).not.toContain(topKey(path));
          everCalled.set(general, (everCalled.get(general) ?? false) || called > 0);
        }
      }
    }
    expect(everCalled.size).toBeGreaterThanOrEqual(7);
    const dead = [...everCalled].filter(([, ok]) => !ok).map(([p]) => p);
    expect(dead, "handlers that never call a dispatcher and are not listed inert").toEqual([]);
  });
  it("building the data calls no dispatcher", () => {
    for (const b of screen.builds()) expect(b.calls).toEqual([]);
  });
  it("detects a missing and an extra key (guard against a vacuous test)", () => {
    const keys = Object.keys(screen.builds()[0]!.props.data);
    expect(keys.filter((k) => k !== screen.bindings[0]).sort()).not.toEqual([...screen.bindings].sort());
    expect([...keys, "unlistedKey"].sort()).not.toEqual([...screen.bindings].sort());
  });
});
describe("the inert counts match the design tables", () => {
  it("Export Flow lists 27 and Effects Library lists 1", () => {
    expect(EXP_INERT.length).toBe(27);
    expect(LIB_INERT.length).toBe(1);
  });
  it("Frame rate and Duration are read-only: their handlers are inert and never edit the project", () => {
    const s = exportSpy();
    const { data } = adaptExportFlow(exportState(projects[0]!, exportRuns()[1]!, EXPORT_VIEWS[1]!), s.d);
    expect(data["onFps"]).toBe(INERT);
    expect(data["onDur"]).toBe(INERT);
    expect(data["fps"]).toBe(projects[0]!.canvas.fps);
    expect(data["dur"]).toBe(projects[0]!.canvas.durationSeconds);
  });
  it("every ErrorCode has at least one suggestion", () => {
    for (const code of ALL_ERROR_CODES) expect(TRY_NEXT[code].length, code).toBeGreaterThan(0);
  });
});
describe("adapter sources are pure (static audit)", () => {
  const FILES = ["effects-library.ts", "export-flow.ts", "format.ts", "tables.ts", "types.ts"];
  for (const f of FILES) {
    const src = readStudioText(`src/wiring/${f}`);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    it(`${f} imports no React runtime, engine render function, or exporter runtime`, () => {
      expect(code).not.toMatch(/from "react"/);
      expect(code).not.toMatch(/\b(computeFrameState|renderFrame|drawFrame)\b/);
      expect(code).not.toMatch(/import (?!type)[^;]*from "@studio\/exporters"/);
    });
    it(`${f} reads no DOM, clock, or random source`, () => {
      expect(code).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\b/);
      expect(code).not.toMatch(/\bDate\b|performance\.now|Math\.random/);
    });
  }
});
