import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { presetCatalog } from "@studio/engine";
import { arbProject } from "../model/__testing/arb-project.js";
import { EFFECTS_LIBRARY_BINDINGS } from "../generated/effects-library/EffectsLibrary.js";
import { EXPORT_FLOW_BINDINGS } from "../generated/export-flow/ExportFlow.js";
import { STUDIO_EDITOR_BINDINGS } from "../generated/studio-editor/StudioEditor.js";
import { adaptEffectsLibrary, type EffectsLibraryView } from "./effects-library.js";
import { adaptExportFlow, FORMAT_CARDS, type ExportFlowView } from "./export-flow.js";
import { adaptStudioEditor, type StudioEditorView } from "./studio-editor.js";
import { ALL_ERROR_CODES, effectsSpy, exportRuns, exportSpy, exportState, libraryState, studioSpy, studioState } from "./fixtures.js";
import { CATEGORIES } from "./tables.js";
import type { DcData } from "../ds/dc-runtime.js";
/**
 * Properties 13 and 14 (Requirement 19.2, 19.3): for arbitrary projects and view states, an adapter's
 * data keys equal its screen's binding list exactly, and building the data is pure and deterministic.
 */
const ids = presetCatalog.map((p) => p.id);
const arbStaged = fc.record(
  {
    split: fc.constantFrom("character" as const, "word" as const, "line" as const),
    ease: fc.constantFrom("linear", "easeIn", "easeOut", "easeInOut"),
    params: fc.dictionary(fc.constantFrom("startDelay", "durationSeconds", "amplitude", "bogus"), fc.double({ min: -5, max: 500, noNaN: true })),
  },
  { requiredKeys: [] },
);
const arbLibraryView: fc.Arbitrary<EffectsLibraryView> = fc.record({
  open: fc.boolean(),
  query: fc.string({ maxLength: 8 }),
  grans: fc.subarray(["character", "word", "line"] as const),
  cats: fc.subarray([...CATEGORIES]),
  sort: fc.constantFrom("az", "other"),
  sel: fc.option(fc.constantFrom(...ids, "no-such-effect"), { nil: null }),
  hover: fc.option(fc.constantFrom(...ids), { nil: null }),
  focusId: fc.option(fc.constantFrom(...ids), { nil: null }),
  staged: fc.dictionary(fc.constantFrom(...ids), arbStaged),
  toast: fc.option(fc.record({ id: fc.constantFrom(...ids) }), { nil: null }),
});
const arbExportView: fc.Arbitrary<ExportFlowView> = fc.record({
  step: fc.constantFrom(1 as const, 2 as const),
  format: fc.constantFrom(...FORMAT_CARDS.map((c) => c.id), "gone"),
  resolution: fc.option(fc.constantFrom("640 × 360", "1280 × 720", "nonsense"), { nil: null }),
});
const arbEditorView: fc.Arbitrary<StudioEditorView> = fc.record({
  checker: fc.boolean(),
  safe: fc.boolean(),
  settingsError: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
});
/** The editor's UI state around an arbitrary project: any layer (or none), playhead, flags. */
const arbEditorPatch = (layerIds: string[]) =>
  fc.record({
    selectedLayerId: fc.option(fc.constantFrom(...layerIds, "gone"), { nil: null }),
    playhead: fc.double({ min: -1, max: 700, noNaN: true }),
    loop: fc.boolean(),
    playing: fc.boolean(),
    canUndo: fc.boolean(),
    view: arbEditorView,
  });
const arbRun = fc.constantFrom(...ALL_ERROR_CODES).chain((code) => fc.constantFrom(...exportRuns(code)));
/** Structural form of data: functions compared by type, so two builds can be compared. */
const shape = (data: DcData): string => JSON.stringify(data, (_k, v: unknown) => (typeof v === "function" ? "[fn]" : v));
// Feature: studio, Property 13: Adapter binding coverage
describe("Property 13: adapter binding coverage", () => {
  it("Effects Library data keys equal EFFECTS_LIBRARY_BINDINGS for any project and view", () => {
    fc.assert(
      fc.property(arbProject, arbLibraryView, (project, view) => {
        const keys = Object.keys(adaptEffectsLibrary(libraryState(project, view), effectsSpy().d).data).sort();
        expect(keys).toEqual([...EFFECTS_LIBRARY_BINDINGS].sort());
      }),
      { numRuns: 150 },
    );
  });
  it("Export Flow data keys equal EXPORT_FLOW_BINDINGS for any project, run, and view", () => {
    fc.assert(
      fc.property(arbProject, arbRun, arbExportView, (project, run, view) => {
        const keys = Object.keys(adaptExportFlow(exportState(project, run, view), exportSpy().d).data).sort();
        expect(keys).toEqual([...EXPORT_FLOW_BINDINGS].sort());
      }),
      { numRuns: 150 },
    );
  });
});
// Feature: studio, Property 13 (Studio Editor)
describe("Property 13: Studio Editor binding coverage", () => {
  it("Studio Editor data keys equal STUDIO_EDITOR_BINDINGS for any project and editor state", () => {
    fc.assert(
      fc.property(
        arbProject.chain((project) => arbEditorPatch(project.layers.map((l) => l.id)).map((patch) => ({ project, patch }))),
        ({ project, patch }) => {
          const keys = Object.keys(adaptStudioEditor(studioState(project, patch), studioSpy().d).data).sort();
          expect(keys).toEqual([...STUDIO_EDITOR_BINDINGS].sort());
        },
      ),
      { numRuns: 150 },
    );
  });
});
// Feature: studio, Property 14: Adapter construction is pure and deterministic
describe("Property 14: adapter construction is pure and deterministic", () => {
  it("Effects Library: two builds are structurally equal, call no dispatcher, and do not mutate the state", () => {
    fc.assert(
      fc.property(arbProject, arbLibraryView, (project, view) => {
        const state = libraryState(project, view);
        const before = JSON.stringify(state);
        const a = effectsSpy();
        const b = effectsSpy();
        const first = adaptEffectsLibrary(state, a.d).data;
        const second = adaptEffectsLibrary(state, b.d).data;
        expect(shape(first)).toBe(shape(second));
        expect(a.calls).toEqual([]);
        expect(b.calls).toEqual([]);
        expect(JSON.stringify(state)).toBe(before);
      }),
      { numRuns: 150 },
    );
  });
  it("Export Flow: two builds are structurally equal, call no dispatcher, and do not mutate the state", () => {
    fc.assert(
      fc.property(arbProject, arbRun, arbExportView, (project, run, view) => {
        const state = exportState(project, run, view);
        const before = JSON.stringify(state);
        const a = exportSpy();
        const b = exportSpy();
        const first = adaptExportFlow(state, a.d).data;
        const second = adaptExportFlow(state, b.d).data;
        expect(shape(first)).toBe(shape(second));
        expect(a.calls).toEqual([]);
        expect(b.calls).toEqual([]);
        expect(JSON.stringify(state)).toBe(before);
      }),
      { numRuns: 150 },
    );
  });
});
// Feature: studio, Property 14 (Studio Editor)
describe("Property 14: Studio Editor construction is pure and deterministic", () => {
  it("two builds are structurally equal, call no dispatcher, and do not mutate the state", () => {
    fc.assert(
      fc.property(
        arbProject.chain((project) => arbEditorPatch(project.layers.map((l) => l.id)).map((patch) => ({ project, patch }))),
        ({ project, patch }) => {
          const state = studioState(project, patch);
          const before = JSON.stringify(state);
          const a = studioSpy();
          const b = studioSpy();
          expect(shape(adaptStudioEditor(state, a.d).data)).toBe(shape(adaptStudioEditor(state, b.d).data));
          expect(a.calls).toEqual([]);
          expect(b.calls).toEqual([]);
          expect(JSON.stringify(state)).toBe(before);
        },
      ),
      { numRuns: 150 },
    );
  });
});
