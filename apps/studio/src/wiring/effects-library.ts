/**
 * Adapter for the generated Effects Library screen (Requirement 19.2). Pure: store snapshot plus the
 * host's library view state in, the screen's `data` out. The catalog comes from the engine's
 * `presetCatalog`; categories and slider ranges from `tables.ts`. Binding kinds are listed in the design
 * ("Binding tables"); the one inert binding is `preview`.
 */
import { presetCatalog, type Granularity, type PresetCatalogEntry, type Project } from "@studio/engine";
import type { DcProps, DcValue } from "../ds/dc-runtime.js";
import { CATEGORIES, RANGES_BY_ID, categoryOf, type Category } from "./tables.js";
import { decimals, withUnit } from "./format.js";
import type { Data } from "./types.js";
/** Values the user has staged in the library for one effect before applying it. */
export interface Staged {
  split?: Granularity;
  ease?: string;
  params?: Record<string, number>;
}
/** The library's own view state (held by the host in React state, not in the store). */
export interface EffectsLibraryView {
  open: boolean;
  query: string;
  grans: Granularity[];
  cats: Category[];
  sort: string;
  sel: string | null;
  hover: string | null;
  focusId: string | null;
  staged: Record<string, Staged>;
  toast: { id: string } | null;
}
export interface EffectsLibraryState {
  project: Project;
  selectedLayerId: string | null;
  view: EffectsLibraryView;
}
/** Everything the adapter's handlers may call. The host builds this object. */
export interface EffectsLibraryDispatchers {
  setOpen(open: boolean): void;
  setQuery(query: string): void;
  toggleGran(g: Granularity): void;
  toggleCat(c: Category): void;
  clearFilters(): void;
  setSort(sort: string): void;
  select(id: string | null): void;
  setHover(id: string | null): void;
  setFocus(id: string | null): void;
  stageSplit(id: string, g: Granularity): void;
  stageEase(id: string, ease: string): void;
  stageParam(id: string, key: string, value: number): void;
  /** Adds the effect to the selected layer with the staged values (one undo step). */
  applyEffect(id: string): void;
  undo(): void;
  dismissToast(): void;
  gridKey(event: unknown): void;
  /** Host services: the CSS-approximation thumbnail for a card, and the refs for the search box and the grid. */
  thumb(id: string): DcValue;
  searchRef: DcValue;
  gridRef: DcValue;
}
/** Binding keys that have no backing behaviour in v1 (design table, kind I). */
export const INERT_BINDINGS: readonly string[] = ["preview"];
export const EASE_OPTIONS: readonly string[] = ["linear", "easeIn", "easeOut", "easeInOut"];
const GRAN_LABEL: Record<Granularity, string> = { character: "Character", word: "Word", line: "Line" };
const GRAN_ORDER: Granularity[] = ["character", "word", "line"];
/** The sorts the adapter can honour (gap D-5): "Most used", "Newest" and "Shortest" have no data. */
export const SORT_OPTIONS = [
  { value: "catalog", label: "Catalog order" },
  { value: "az", label: "Name A–Z" },
] as const;
const entryOf = (id: string | null): PresetCatalogEntry | undefined => (id === null ? undefined : presetCatalog.find((p) => p.id === id));
/** The catalog entries the filters and the query keep, in catalog order or Name A to Z. */
export function visibleEntries(view: EffectsLibraryView): PresetCatalogEntry[] {
  const q = view.query.trim().toLowerCase();
  const kept = presetCatalog
    .filter(
      (p) =>
        (q === "" || p.displayName.toLowerCase().includes(q) || categoryOf(p).toLowerCase().includes(q)) &&
        (view.grans.length === 0 || p.supportedGranularities.some((g) => view.grans.includes(g))) &&
        (view.cats.length === 0 || view.cats.includes(categoryOf(p))),
    );
  return view.sort === "az" ? kept.sort((a, b) => a.displayName.localeCompare(b.displayName)) : kept;
}
/** The granularity and easing the library would apply for `entry`, staged value first. */
function effective(entry: PresetCatalogEntry, staged: Staged | undefined): { split: Granularity; ease: string } {
  const defEase = typeof entry.defaultParams["easing"] === "string" ? entry.defaultParams["easing"] : "linear";
  return { split: staged?.split ?? entry.supportedGranularities[0] ?? "character", ease: staged?.ease ?? defEase };
}
export function adaptEffectsLibrary(state: EffectsLibraryState, d: EffectsLibraryDispatchers): DcProps {
  const { project, selectedLayerId, view } = state;
  const layer = project.layers.find((l) => l.id === selectedLayerId);
  const layerText = layer?.text ?? "the selected layer";
  const list = visibleEntries(view);
  const selEntry = entryOf(view.sel);
  const tabId = view.focusId && list.some((p) => p.id === view.focusId) ? view.focusId : view.sel && list.some((p) => p.id === view.sel) ? view.sel : list[0]?.id;
  const onLayer = (id: string): boolean => layer?.effectInstances.some((e) => e.effectId === id) ?? false;
  const filterBits = [...view.grans.map((g) => GRAN_LABEL[g]), ...view.cats];
  const q = view.query.trim();
  const eff = selEntry ? effective(selEntry, view.staged[selEntry.id]) : null;
  const ranges = selEntry ? (RANGES_BY_ID[selEntry.id] ?? {}) : {};
  const toastEntry = entryOf(view.toast?.id ?? null);
  const cards: DcValue[] = list.map((p) => {
    const sel = view.sel === p.id;
    const hot = view.hover === p.id || view.focusId === p.id;
    const cat = categoryOf(p);
    const grans = p.supportedGranularities.map((g) => GRAN_LABEL[g]);
    const applied = onLayer(p.id);
    return {
      id: p.id,
      name: p.displayName,
      cat,
      grans,
      thumb: d.thumb(p.id),
      selected: sel,
      selAria: String(sel),
      bc: sel ? "var(--color-accent)" : "",
      bs: sel ? "var(--glow-accent)" : "",
      tab: p.id === tabId ? 0 : -1,
      fast: hot,
      showApply: hot,
      applied,
      aria: `${p.displayName}, ${cat}, splits by ${grans.join(", ")}${applied ? ", on selected layer" : ""}`,
      applyLabel: `Apply ${p.displayName} to ${layerText}`,
      select: () => d.select(p.id),
      enter: () => d.setHover(p.id),
      leave: () => d.setHover(null),
      focus: () => d.setFocus(p.id),
      // Focus moving to the card's own Apply button is not leaving the card.
      blur: (e: { currentTarget?: { contains?: (n: unknown) => boolean }; relatedTarget?: unknown }) => {
        if (!e.currentTarget?.contains?.(e.relatedTarget)) d.setFocus(null);
      },
      apply: () => d.applyEffect(p.id),
    };
  });
  const data: Data = {
    open: view.open,
    closed: !view.open,
    close: () => d.setOpen(false),
    reopen: () => d.setOpen(true),
    scrimDown: (e: { target?: unknown; currentTarget?: unknown }) => {
      if (e.target === e.currentTarget) d.setOpen(false);
    },
    searchRef: d.searchRef,
    gridRef: d.gridRef,
    query: view.query,
    hasQuery: view.query !== "",
    noQuery: view.query === "",
    onQuery: (e: { target: { value: string } }) => d.setQuery(e.target.value),
    clearQuery: () => d.setQuery(""),
    granChips: GRAN_ORDER.map((g) => ({ label: GRAN_LABEL[g], on: view.grans.includes(g), toggle: () => d.toggleGran(g) })),
    catChips: CATEGORIES.map((c) => ({ label: c, on: view.cats.includes(c), toggle: () => d.toggleCat(c) })),
    sortOptions: SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    sort: view.sort,
    onSort: (v: string) => d.setSort(v),
    countText: `${list.length} of ${presetCatalog.length}`,
    anyFilter: q !== "" || view.grans.length > 0 || view.cats.length > 0,
    clearAll: () => d.clearFilters(),
    loading: false,
    skeletons: [],
    showEmpty: list.length === 0,
    showGrid: list.length > 0,
    emptyTitle: q !== "" ? `No effects match “${q}”` : "No effects match these filters",
    emptyText: `${filterBits.length > 0 ? `Filters on: ${filterBits.join(", ")}. ` : ""}Check the spelling, or try a broader word like “fade” or “bounce”.`,
    cards,
    onGridKey: (e: unknown) => d.gridKey(e),
    hasSel: selEntry !== undefined,
    deselect: () => d.select(null),
    selName: selEntry?.displayName ?? "",
    selCat: selEntry ? categoryOf(selEntry) : "",
    selMeta: selEntry && eff ? `${GRAN_LABEL[eff.split]}${typeof selEntry.defaultParams["durationSeconds"] === "number" ? ` · ${withUnit(Number(view.staged[selEntry.id]?.params?.["durationSeconds"] ?? selEntry.defaultParams["durationSeconds"]), 0.05, "s")}` : ""}${selEntry.loop ? " · loop" : ""}` : "",
    preview: null,
    multiSplit: (selEntry?.supportedGranularities.length ?? 0) > 1,
    singleSplit: selEntry !== undefined && selEntry.supportedGranularities.length === 1,
    singleSplitText: selEntry && selEntry.supportedGranularities.length === 1 ? `This effect always splits by ${GRAN_LABEL[selEntry.supportedGranularities[0] ?? "character"]}.` : "",
    splitOpts: selEntry ? selEntry.supportedGranularities.map((g) => ({ value: g, label: GRAN_LABEL[g] })) : [],
    split: eff?.split ?? "character",
    onSplit: (v: Granularity) => {
      if (selEntry) d.stageSplit(selEntry.id, v);
    },
    paramList: selEntry
      ? Object.entries(ranges).map(([key, r]) => {
          const staged = view.staged[selEntry.id]?.params?.[key];
          const def = selEntry.defaultParams[key];
          return {
            label: r.label,
            min: r.min,
            max: r.max,
            step: r.step,
            val: staged ?? (typeof def === "number" ? def : r.min),
            fmt: (v: number) => withUnit(v, r.step, r.unit),
            set: (v: number) => d.stageParam(selEntry.id, key, Number(Number(v).toFixed(Math.max(decimals(r.step), 0)))),
          };
        })
      : [],
    easeOpts: [...EASE_OPTIONS],
    ease: eff?.ease ?? "linear",
    onEase: (v: string) => {
      if (selEntry) d.stageEase(selEntry.id, v);
    },
    applySel: () => {
      if (selEntry) d.applyEffect(selEntry.id);
    },
    applyHelp: selEntry
      ? onLayer(selEntry.id)
        ? `Already on “${layerText}”. Applying updates its parameters.`
        : `Adds ${selEntry.displayName} to “${layerText}”.`
      : "",
    hasToast: toastEntry !== undefined,
    toastTitle: toastEntry ? `Applied ${toastEntry.displayName}` : "",
    toastText: toastEntry ? `“${layerText}” · Split by ${GRAN_LABEL[effective(toastEntry, view.staged[toastEntry.id]).split]}` : "",
    toastAction: { label: "Undo", onClick: () => d.undo() },
    closeToast: () => d.dismissToast(),
  };
  return { data };
}
