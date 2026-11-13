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
import { STUDIO_EDITOR_BINDINGS } from "../generated/studio-editor/StudioEditor.js";
import { adaptEffectsLibrary, INERT_BINDINGS as LIB_INERT } from "./effects-library.js";
import { applyOutcome, applyResult } from "./hosts/effects-library-host.js";
import { Store } from "../shell/store.js";
import { adaptExportFlow, INERT_BINDINGS as EXP_INERT, supportsAlpha, TRY_NEXT, type ExportFormat } from "./export-flow.js";
import { ALL_ERROR_CODES, EXPORT_VIEWS, effectsSpy, exportRuns, exportSpy, exportState, libraryState } from "./fixtures.js";
import { adaptStudioEditor, INERT_BINDINGS as ED_INERT, SIZE_PRESETS } from "./studio-editor.js";
import { studioSpy, studioState } from "./fixtures.js";
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
  /** Fewest distinct live handler paths the screen has (a floor, so the walk cannot go vacuous). */
  minHandlers: number;
  /** A better argument than the generic event for a handler that takes a specific value. */
  argFor?: (path: string, data: DcProps["data"]) => unknown;
}
const projects = [newProject(), demoProject()];
const SCREENS: Screen[] = [
  {
    name: "Effects Library",
    bindings: EFFECTS_LIBRARY_BINDINGS,
    inert: LIB_INERT,
    pure: /\.fmt$/,
    minHandlers: 7,
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
    minHandlers: 8,
    argFor: (path, data) => (path === "onRes" ? (data["resOpts"] as string[])[0] : undefined),
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
  {
    name: "Studio Editor",
    bindings: STUDIO_EDITOR_BINDINGS,
    inert: ED_INERT,
    pure: /\.$/,
    minHandlers: 30,
    argFor: (path, data) => {
      if (/onCanvasPreset$/.test(path)) return SIZE_PRESETS[2]!.value;
      if (/onFont$/.test(path)) return "Noto Sans Tamil";
      if (/onWeight$/.test(path)) return "700";
      if (/onFill$|onBackground$/.test(path)) return "#112233";
      if (/onLayerText$/.test(path)) return "hello";
      const m = /^effects\[(\d+)\]\.onSplit$/.exec(path);
      if (m) return ((data["effects"] as { splitOpts: { value: string }[] }[])[Number(m[1])]!.splitOpts[0]!.value);
      return "5";
    },
    builds: () =>
      projects.flatMap((p) => {
        const second = p.layers[1]?.id ?? null;
        return [{}, { selectedLayerId: null }, { selectedLayerId: second, playing: true, loop: false, canUndo: false }, { view: { checker: true, safe: false, settingsError: "Bad width.", paramErrors: {} } }].map((patch) => {
          const s = studioSpy();
          return { props: adaptStudioEditor(studioState(p, patch), s.d), calls: s.calls };
        });
      }),
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
        fn(screen.argFor?.(path, b.props.data) ?? eventArg());
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
    expect(everCalled.size).toBeGreaterThanOrEqual(screen.minHandlers);
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
  it("Export Flow, Effects Library and Studio Editor list no inert binding", () => {
    expect(EXP_INERT.length).toBe(0);
    expect(LIB_INERT.length).toBe(0);
    expect(ED_INERT.length).toBe(0);
  });
  it("Frame rate and Duration are text read from the project; there is no handler to edit them", () => {
    const s = exportSpy();
    const { data } = adaptExportFlow(exportState(projects[0]!, exportRuns()[1]!, EXPORT_VIEWS[1]!), s.d);
    expect(data["fps"]).toBe(`${projects[0]!.canvas.fps} fps`);
    expect(data["dur"]).toBe(`${projects[0]!.canvas.durationSeconds.toFixed(2)} s`);
    expect(data).not.toHaveProperty("onFps");
    expect(data).not.toHaveProperty("onDur");
  });
  it("thumbAspect comes from the canvas, not a constant", () => {
    for (const p of projects) {
      const { data } = adaptExportFlow(exportState(p, exportRuns()[1]!, EXPORT_VIEWS[0]!), exportSpy().d);
      expect(data["thumbAspect"]).toBe(`${p.canvas.width} / ${p.canvas.height}`);
    }
    const tall = { ...projects[0]!, canvas: { ...projects[0]!.canvas, width: 1080, height: 1920 } };
    expect(adaptExportFlow(exportState(tall, exportRuns()[1]!, EXPORT_VIEWS[0]!), exportSpy().d).data["thumbAspect"]).toBe("1080 / 1920");
  });
  it("WebM with alpha is a limited card with a reason, and picking it calls nothing", () => {
    const s = exportSpy();
    const { data } = adaptExportFlow(exportState(projects[0]!, exportRuns()[1]!, EXPORT_VIEWS[0]!), s.d);
    const webm = (data["destCards"] as { id: string; limited: boolean; limitedReason: string; pick: () => void }[]).find((c) => c.id === "webm")!;
    expect(webm.limited).toBe(true);
    expect(webm.limitedReason).not.toBe("");
    webm.pick();
    expect(s.calls).toEqual([]);
  });
  it("the size options are scales of the project and onRes maps a label back to its size", () => {
    const s = exportSpy();
    const { data } = adaptExportFlow(exportState(projects[1]!, exportRuns()[1]!, EXPORT_VIEWS[0]!), s.d);
    expect(data["resOpts"]).toEqual(["0.5× · 640 × 360", "1× · 1280 × 720", "2× · 2560 × 1440"]);
    expect(data["res"]).toBe("1× · 1280 × 720");
    (data["onRes"] as (v: string) => void)("2× · 2560 × 1440");
    expect(s.calls).toEqual(["setResolution"]);
  });
  it("every ErrorCode has at least one suggestion", () => {
    for (const code of ALL_ERROR_CODES) expect(TRY_NEXT[code].length, code).toBeGreaterThan(0);
  });
});
describe("adapter sources are pure (static audit)", () => {
  const FILES = ["effects-library.ts", "export-flow.ts", "studio-editor.ts", "format.ts", "tables.ts", "types.ts"];
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

describe("Studio Editor adapter details", () => {
  const demo = projects[1]!;
  const build = (patch = {}, p = demo) => {
    const s = studioSpy();
    return { data: adaptStudioEditor(studioState(p, patch), s.d).data, calls: s.calls };
  };
  const ev = (value: string) => ({ target: { value } });
  it("anchor is shown as a fraction of the canvas and written back in pixels", () => {
    const layer = demo.layers[0]!;
    const { data } = build();
    expect(data["anchorX"]).toBeCloseTo(layer.anchor.x / demo.canvas.width, 3);
    const s = studioSpy();
    const d2 = adaptStudioEditor(studioState(demo), s.d).data;
    let got: unknown[] = [];
    const spy = { ...s.d, setAnchor: (...a: unknown[]) => void (got = a) };
    const d3 = adaptStudioEditor(studioState(demo), spy as typeof s.d).data;
    (d3["onAnchorX"] as (e: unknown) => void)(ev("0.25"));
    expect(got).toEqual([layer.id, 0.25 * demo.canvas.width, layer.anchor.y]);
    expect(d2["onAnchorX"]).toBeTypeOf("function");
  });
  it("layer duration is end minus start and writing it keeps the start", () => {
    const layer = demo.layers[1]!;
    let got: unknown[] = [];
    const s = studioSpy();
    const spy = { ...s.d, setLayerTiming: (...a: unknown[]) => void (got = a) };
    const data = adaptStudioEditor(studioState(demo, { selectedLayerId: layer.id }), spy as typeof s.d).data;
    expect(data["layerDuration"]).toBeCloseTo(layer.endSeconds - layer.startSeconds, 3);
    (data["onLayerDuration"] as (e: unknown) => void)(ev("2"));
    expect(got).toEqual([layer.id, layer.startSeconds, layer.startSeconds + 2]);
  });
  it("a value that does not parse calls nothing", () => {
    const { data, calls } = build();
    for (const k of ["onCanvasWidth", "onCanvasHeight", "onFps", "onDuration", "onSize", "onAnchorX", "onAnchorY", "onLayerStart", "onLayerDuration"]) (data[k] as (e: unknown) => void)(ev(""));
    (data["onFont"] as (e: unknown) => void)(ev("Comic Sans"));
    (data["onCanvasPreset"] as (e: unknown) => void)(ev("custom"));
    expect(calls).toEqual([]);
  });
  it("the size preset is custom when no preset matches, and 1280 × 720 is HD", () => {
    expect(build().data["canvasPreset"]).toBe("hd");
    const odd = { ...demo, canvas: { ...demo.canvas, width: 1000, height: 500 } };
    expect(build({}, odd).data["canvasPreset"]).toBe("custom");
    expect(build({}, odd).data["stageAspect"]).toBe("1000 / 500");
  });
  it("with no layer selected the inspector fields are empty and the effects list is empty", () => {
    const { data } = build({ selectedLayerId: null });
    expect(data["hasLayer"]).toBe(false);
    expect(data["effects"]).toEqual([]);
    expect(data["layerText"]).toBe("");
  });
  it("effect rows list the effect's number params (with their slider ranges) and enum params (with options)", () => {
    const { data } = build();
    const fx = (data["effects"] as { name: string; params: { label: string; isNumber: boolean; isEnum: boolean; min: number; max: number; step: number }[] }[])[0]!;
    expect(fx.name).toBe("Kinetic Pop");
    const duration = fx.params.find((p) => p.label === "Duration")!;
    expect([duration.isNumber, duration.isEnum, duration.min, duration.max, duration.step]).toEqual([true, false, 0.05, 5, 0.05]);
    const typewriter = { ...demo, layers: [{ ...demo.layers[0]!, effectInstances: [{ effectId: "typewriter", granularity: "character" as const, params: { startDelay: 0, delayPerCharacter: 0.05, direction: "forward" } }] }] };
    const rows = (build({}, typewriter).data["effects"] as { params: { label: string; isNumber: boolean; isEnum: boolean; opts: { value: string }[]; val: unknown }[] }[])[0]!.params;
    expect(rows.map((p) => [p.label, p.isNumber, p.isEnum])).toEqual([["Start delay", true, false], ["Per character", true, false], ["Direction", false, true]]);
    expect(rows[2]!.opts.map((o) => o.value)).toEqual(["forward", "backward"]);
    expect(rows[2]!.val).toBe("forward");
  });
  describe("typed effect params are validated against the effect's schema", () => {
    const typewriter = { ...demo, layers: [{ ...demo.layers[0]!, effectInstances: [{ effectId: "typewriter", granularity: "character" as const, params: { startDelay: 0, delayPerCharacter: 0.05, direction: "forward" } }] }] };
    const setter = (patch = {}) => {
      const s = studioSpy();
      const calls: unknown[][] = [];
      const spy = { ...s.d, setEffectParam: (...a: unknown[]) => void calls.push(["set", ...a]), rejectEffectParam: (...a: unknown[]) => void calls.push(["reject", ...a]) };
      const data = adaptStudioEditor(studioState(typewriter, patch), spy as typeof s.d).data;
      const rows = (data["effects"] as { params: { label: string; set: (e: unknown) => void; val: unknown; err: string; hasErr: boolean }[] }[])[0]!.params;
      return { rows, calls };
    };
    it("commits a value the schema accepts, even outside the slider range (3 for a slider that ends at 1)", () => {
      const { rows, calls } = setter();
      rows[1]!.set(ev("3"));
      expect(calls).toEqual([["set", typewriter.layers[0]!.id, 0, "delayPerCharacter", 3]]);
    });
    it("rejects a value the schema refuses: nothing is committed, the message names the key", () => {
      const { rows, calls } = setter();
      rows[1]!.set(ev("-1"));
      expect(calls).toHaveLength(1);
      expect(calls[0]!.slice(0, 1)).toEqual(["reject"]);
      expect(calls[0]!.slice(2, 5)).toEqual([0, "delayPerCharacter", "-1"]);
      expect(String(calls[0]![5])).toContain("delayPerCharacter");
    });
    it("rejects empty and non-numeric text, and an enum value that is not an option", () => {
      const { rows, calls } = setter();
      rows[1]!.set(ev(""));
      rows[1]!.set(ev("abc"));
      rows[1]!.set(ev("  "));
      rows[2]!.set(ev("sideways"));
      expect(calls.map((c) => c[0])).toEqual(["reject", "reject", "reject", "reject"]);
    });
    it("commits a valid enum value", () => {
      const { rows, calls } = setter();
      rows[2]!.set(ev("backward"));
      expect(calls).toEqual([["set", typewriter.layers[0]!.id, 0, "direction", "backward"]]);
    });
    it("shows the typed text and the message while an error is recorded", () => {
      const key = `${typewriter.layers[0]!.id}:0:delayPerCharacter`;
      const { rows } = setter({ view: { checker: false, safe: true, settingsError: null, paramErrors: { [key]: { value: "-1", message: "delayPerCharacter: Too small" } } } });
      expect([rows[1]!.val, rows[1]!.err, rows[1]!.hasErr]).toEqual(["-1", "delayPerCharacter: Too small", true]);
      expect([rows[0]!.hasErr, rows[0]!.err]).toEqual([false, ""]);
    });
  });
  it("the back control calls the host's back", () => {
    const { data, calls } = build();
    (data["onBack"] as () => void)();
    expect(calls).toEqual(["back"]);
  });
  it("playing, loop, checker and safe drive the paired flags", () => {
    const { data } = build({ playing: true, loop: false, view: { checker: true, safe: false, settingsError: null, paramErrors: {} } });
    expect([data["playing"], data["paused"], data["loop"], data["noLoop"], data["checker"], data["noChecker"], data["safe"], data["noSafe"]]).toEqual([true, false, false, true, true, false, false, true]);
    expect([data["checkerAria"], data["safeAria"]]).toEqual(["true", "false"]);
  });
  it("the settings error shows only when the host sets one", () => {
    expect(build().data["hasSettingsError"]).toBe(false);
    const withErr = build({ view: { checker: false, safe: true, settingsError: "Bad width.", paramErrors: {} } }).data;
    expect([withErr["hasSettingsError"], withErr["settingsError"]]).toEqual([true, "Bad width."]);
  });
});

describe("supportsAlpha and the transparency note", () => {
  it("only MP4 cannot carry transparency", () => {
    const expected: Record<ExportFormat, boolean> = { mp4: false, "png-sequence": true, gif: true, webp: true, "webm-alpha": true };
    for (const [format, alpha] of Object.entries(expected)) expect(supportsAlpha(format as ExportFormat), format).toBe(alpha);
  });
  const transparent = { ...projects[0]!, background: "transparent" };
  const note = (project: typeof transparent, format: string, run = exportRuns()[1]!) => {
    const { data } = adaptExportFlow(exportState(project, run, { step: 2, format, resolution: null }), exportSpy().d);
    return { warn: data["alphaWarn"], text: data["alphaWarnText"] };
  };
  it("warns for MP4 on a transparent project, with the Options text", () => {
    expect(note(transparent, "mp4")).toEqual({ warn: true, text: "MP4 has no transparency — the background will be black." });
  });
  it("shows the Done text on the Done step", () => {
    const done = exportRuns().find((r) => r.status === "done")!;
    expect(note(transparent, "mp4", done)).toEqual({ warn: true, text: "Exported without transparency." });
  });
  it("does not warn for formats that keep transparency, or for an opaque project", () => {
    // The idle run offers every card, so each format is the selected one.
    const idle = exportRuns()[0]!;
    for (const id of ["png", "gif", "webp"]) expect(note(transparent, id, idle).warn, id).toBe(false);
    expect(note(projects[0]!, "mp4", idle).warn).toBe(false);
    expect(note(transparent, "mp4", idle).warn).toBe(true);
  });
});
describe("the Effects Library apply outcome", () => {
  it("closes after an applied or unchanged effect and stays open with a message after a failure", () => {
    expect(applyOutcome("applied")).toEqual({ close: true, error: null });
    expect(applyOutcome("unchanged")).toEqual({ close: true, error: null });
    const failed = applyOutcome("failed");
    expect(failed.close).toBe(false);
    expect(failed.error).toMatch(/apply/);
  });
  const view = { open: true, query: "", grans: [], cats: [], sort: "catalog", sel: null, hover: null, focusId: null, staged: {}, toast: null } as const;
  it("applyResult: applied for a new effect, unchanged for the same effect again, failed with no layer selected", () => {
    const store = new Store(newProject());
    expect(applyResult(store, "wave", { ...view, grans: [], cats: [] })).toBe("applied");
    expect(applyResult(store, "wave", { ...view, grans: [], cats: [] })).toBe("unchanged");
    store.setUi({ selectedLayerId: null });
    expect(applyResult(store, "typewriter", { ...view, grans: [], cats: [] })).toBe("failed");
    expect(store.canUndo()).toBe(true);
  });
  it("a failed apply shows the message in the help line", () => {
    const s = effectsSpy();
    const { data } = adaptEffectsLibrary(libraryState(projects[0]!, { sel: "wave", error: "nope" }), s.d);
    expect(data["applyHelp"]).toBe("nope");
  });
});
