/**
 * Host for the generated Effects Library, used as the preset picker (Requirement 19, task 10.5). It
 * subscribes to the store, holds the library's view state, builds the dispatchers, calls the pure adapter,
 * and renders the generated screen. It also owns the modal behaviour the generated markup lacks: focus moves
 * to the search box on open and returns to the opener on close, Tab stays inside the dialog, Escape closes,
 * "/" focuses the search box, and Ctrl/Cmd+Z is held back while the library is open.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { presetCatalog, type Granularity } from "@studio/engine";
import { EffectsLibrary } from "../../generated/effects-library/EffectsLibrary.js";
import { shouldUndo } from "../../shell/undo-key.js";
import type { Store } from "../../shell/store.js";
import { useStoreState } from "../../shell/useStore.js";
import { adaptEffectsLibrary, type EffectsLibraryDispatchers, type EffectsLibraryView } from "../effects-library.js";
import type { Category } from "../tables.js";
import { effectThumb } from "./effect-thumb.js";
import "./effects-library-host.css";
const TOAST_MS = 6000;
const INITIAL_VIEW: EffectsLibraryView = {
  open: true, query: "", grans: [], cats: [], sort: "catalog", sel: null, hover: null, focusId: null, staged: {}, toast: null,
};
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
/**
 * Adds the effect to the selected layer (or updates the instance already there) with the staged values.
 * One gesture, so one undo step. Returns whether the project changed.
 */
export function applyStagedEffect(store: Store, effectId: string, view: EffectsLibraryView): boolean {
  const layerId = store.getState().ui.selectedLayerId;
  const entry = presetCatalog.find((p) => p.id === effectId);
  if (layerId === null || !entry) return false;
  const staged = view.staged[effectId];
  const instances = (): readonly { effectId: string }[] => store.getState().project.layers.find((l) => l.id === layerId)?.effectInstances ?? [];
  store.beginGesture();
  let index = instances().findIndex((e) => e.effectId === effectId);
  if (index < 0) {
    store.preview({ type: "add-effect", layerId, effectId });
    index = instances().length - 1;
  }
  if (index < 0 || instances()[index]?.effectId !== effectId) {
    store.cancelGesture();
    return false;
  }
  store.preview({ type: "set-effect-granularity", layerId, index, granularity: staged?.split ?? entry.supportedGranularities[0] ?? "character" });
  for (const [key, value] of Object.entries(staged?.params ?? {})) {
    if (typeof entry.defaultParams[key] === "number") store.preview({ type: "set-effect-param", layerId, index, key, value });
  }
  if (staged?.ease !== undefined && typeof entry.defaultParams["easing"] === "string") {
    store.preview({ type: "set-effect-param", layerId, index, key: "easing", value: staged.ease });
  }
  return store.commitGesture();
}
/** The result of an apply: the effect was added or updated, nothing needed changing, or it could not be applied. */
export type ApplyResult = "applied" | "unchanged" | "failed";
/** Applies the staged effect and says what happened. "unchanged" is an effect already on the layer with those values. */
export function applyResult(store: Store, effectId: string, view: EffectsLibraryView): ApplyResult {
  const layerId = store.getState().ui.selectedLayerId;
  const had = layerId !== null && (store.getState().project.layers.find((l) => l.id === layerId)?.effectInstances.some((e) => e.effectId === effectId) ?? false);
  if (applyStagedEffect(store, effectId, view)) return "applied";
  return had ? "unchanged" : "failed";
}
/** What the library does with an apply result: close (the effect is on the layer), or stay open with a message. */
export function applyOutcome(result: ApplyResult): { close: boolean; error: string | null } {
  return result === "failed" ? { close: false, error: "Couldn\u2019t apply this effect. Select a layer and try again." } : { close: true, error: null };
}
export function EffectsLibraryHost({ store, onClose, onApplied }: { store: Store; onClose: () => void; onApplied?: (message: string) => void }) {
  const project = useStoreState(store, (s) => s.project);
  const selectedLayerId = useStoreState(store, (s) => s.ui.selectedLayerId);
  const [view, setView] = useState<EffectsLibraryView>(INITIAL_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const patch = (p: Partial<EffectsLibraryView>): void => setView((v) => ({ ...v, ...p }));
  // Focus the search box on open; give focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => opener?.focus?.();
  }, []);
  // Modal keyboard behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (shouldUndo({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, target }, false)) {
        // The library owns focus: hold the window-level undo back.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((target?.tagName ?? "").toUpperCase())) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = rootRef.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // The "Applied" toast clears itself.
  useEffect(() => {
    if (view.toast === null) return;
    const id = setTimeout(() => setView((v) => ({ ...v, toast: null })), TOAST_MS);
    return () => clearTimeout(id);
  }, [view.toast]);
  const gridKey = (event: unknown): void => {
    const e = event as ReactKeyboardEvent<HTMLElement>;
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-idx]"));
    const cur = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (cards.length === 0 || !cur) return;
    const i = cards.indexOf(cur);
    const top0 = cards[0]?.offsetTop;
    const cols = cards.filter((c) => c.offsetTop === top0).length || 1;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    let j: number | null = null;
    if (e.key in step) j = Math.max(0, Math.min(cards.length - 1, i + (step[e.key] ?? 0)));
    if (e.key === "Home") j = 0;
    if (e.key === "End") j = cards.length - 1;
    if (j !== null) {
      e.preventDefault();
      cards[j]?.focus();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target === cur) {
      e.preventDefault();
      const id = cur.getAttribute("data-id");
      if (id) patch({ sel: id });
    }
  };
  const dispatchers: EffectsLibraryDispatchers = {
    setOpen: (open) => {
      if (!open) onClose();
    },
    setQuery: (query) => patch({ query }),
    toggleGran: (g: Granularity) => setView((v) => ({ ...v, grans: toggle(v.grans, g) })),
    toggleCat: (c: Category) => setView((v) => ({ ...v, cats: toggle(v.cats, c) })),
    clearFilters: () => patch({ query: "", grans: [], cats: [] }),
    setSort: (sort) => patch({ sort }),
    select: (id) => patch({ sel: id, error: null }),
    setHover: (id) => patch({ hover: id }),
    setFocus: (id) => patch({ focusId: id }),
    stageSplit: (id, split) => setView((v) => ({ ...v, staged: { ...v.staged, [id]: { ...v.staged[id], split } } })),
    stageEase: (id, ease) => setView((v) => ({ ...v, staged: { ...v.staged, [id]: { ...v.staged[id], ease } } })),
    stageParam: (id, key, value) => setView((v) => ({ ...v, staged: { ...v.staged, [id]: { ...v.staged[id], params: { ...v.staged[id]?.params, [key]: value } } } })),
    applyEffect: (id) => {
      const outcome = applyOutcome(applyResult(store, id, viewRef.current));
      if (!outcome.close) {
        patch({ error: outcome.error, sel: id });
        return;
      }
      const name = presetCatalog.find((p) => p.id === id)?.displayName ?? id;
      const layer = store.getState().project.layers.find((l) => l.id === store.getState().ui.selectedLayerId);
      onApplied?.(`Applied ${name} to \u201c${layer?.text.split("\n")[0] ?? "the layer"}\u201d.`);
      onClose();
    },
    undo: () => {
      store.undo();
      patch({ toast: null });
    },
    dismissToast: () => patch({ toast: null }),
    gridKey,
    thumb: (id) => effectThumb(id),
    searchRef,
    gridRef,
  };
  const props = adaptEffectsLibrary({ project, selectedLayerId, view }, dispatchers);
  return createPortal(
    <div className="lib-host" ref={rootRef}>
      <EffectsLibrary {...props} />
    </div>,
    document.body,
  );
}
