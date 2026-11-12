/**
 * Host for the generated Studio Editor (Requirement 19). Owns what the screen cannot: the live preview
 * canvas and the live timeline (mounted into its two slots), the playback clock calls, the editor view
 * state (checkerboard, safe area, the settings message), the Open file input, and the two dialogs
 * (Effects Library, Export). Every edit goes through the store; the adapter turns state into the
 * screen's data.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Granularity } from "@studio/engine";
import { StudioEditor } from "../../generated/studio-editor/StudioEditor.js";
import type { Store } from "../../shell/store.js";
import { PreviewCanvas, getClock } from "../../preview/PreviewCanvas.js";
import { Timeline } from "../../timeline/Timeline.js";
import { ExportDialog } from "../../export/dialog.js";
import { shouldUndo } from "../../shell/undo-key.js";
import { downloadProject } from "../../io/save.js";
import { loadProjectFromFile } from "../../io/load.js";
import { demoProject } from "../../model/demo.js";
import { newProject } from "../../model/project.js";
import { EffectsLibraryHost } from "./effects-library-host.js";
import { adaptStudioEditor, type StudioEditorDispatchers, type StudioEditorView } from "../studio-editor.js";
import "./studio-editor-host.css";
/** Roles that Space activates. */
const SPACE_ROLES = new Set(["button", "switch", "radio", "checkbox", "option", "menuitem", "tab", "link"]);
/** True when the event target handles `key` itself: a text field, select or editable content for every key, and a button or link for Space. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  const el = target as HTMLElement | null;
  if (el === null || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  const role = el.getAttribute("role");
  if (key === " ") return tag === "BUTTON" || tag === "A" || (role !== null && SPACE_ROLES.has(role));
  return false;
}
export function StudioEditorHost({ store }: { store: Store }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [view, setView] = useState<StudioEditorView>({ checker: false, safe: true, settingsError: null });
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const exportOpenRef = useRef(false);
  exportOpenRef.current = exportOpen;
  // Ctrl/Cmd+Z: undo one step (cancels an open gesture first). Ignored in text fields and while the export dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (!shouldUndo({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, target }, exportOpenRef.current)) return;
      e.preventDefault();
      store.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
  // Keyboard shortcuts promised by the design's tooltips: Space plays or pauses, Home goes to the first frame, End to
  // the last. One listener, ignored while focus is in a field or on a control that owns the key, and while a dialog is open.
  const shortcuts = useRef<{ togglePlay(): void; toStart(): void; toEnd(): void; blocked(): boolean }>({ togglePlay: () => undefined, toStart: () => undefined, toEnd: () => undefined, blocked: () => false });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== " " && e.key !== "Home" && e.key !== "End") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented || shortcuts.current.blocked()) return;
      if (ownsKey(e.target, e.key)) return;
      e.preventDefault();
      if (e.key === " ") shortcuts.current.togglePlay();
      else if (e.key === "Home") shortcuts.current.toStart();
      else shortcuts.current.toEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const stage = useMemo(
    () => (
      <div className="seh-stage" data-checker={view.checker}>
        <PreviewCanvas store={store} canvasRef={canvasRef} />
      </div>
    ),
    [store, view.checker],
  );
  const timeline = useMemo(() => <Timeline store={store} canvasRef={canvasRef} />, [store]);
  const dispatchers: StudioEditorDispatchers = {
    newProject: () => {
      store.setProject(newProject());
      setLoadError(null);
      setView((v) => ({ ...v, settingsError: null }));
    },
    loadDemo: () => {
      store.setProject(demoProject());
      setLoadError(null);
      setView((v) => ({ ...v, settingsError: null }));
    },
    save: () => downloadProject(store.getState().project),
    open: () => fileRef.current?.click(),
    exportProject: () => setExportOpen(true),
    undo: () => void store.undo(),
    setCanvasSize: (width, height) => {
      const ok = store.dispatchGuarded({ type: "set-canvas-size", width, height });
      setView((v) => ({ ...v, settingsError: ok ? null : "That size is not allowed." }));
    },
    setWidth: (width) => {
      const ok = store.dispatchGuarded({ type: "set-canvas-size", width, height: store.getState().project.canvas.height });
      setView((v) => ({ ...v, settingsError: ok ? null : "Width must be an integer in 1-7680." }));
    },
    setHeight: (height) => {
      const ok = store.dispatchGuarded({ type: "set-canvas-size", width: store.getState().project.canvas.width, height });
      setView((v) => ({ ...v, settingsError: ok ? null : "Height must be an integer in 1-4320." }));
    },
    setFps: (fps) => {
      const ok = store.dispatchGuarded({ type: "set-fps", fps });
      setView((v) => ({ ...v, settingsError: ok ? null : "FPS must be in 1-120." }));
    },
    setDuration: (durationSeconds) => {
      const ok = store.dispatchGuarded({ type: "set-duration", durationSeconds });
      setView((v) => ({ ...v, settingsError: ok ? null : "Duration must be in 0.1-600s." }));
    },
    setBackground: (background) => store.dispatch({ type: "set-background", background }),
    setTransparent: (transparent) => store.dispatch({ type: "set-transparent", transparent }),
    addLayer: () => store.dispatch({ type: "add-layer" }),
    selectLayer: (id) => store.setUi({ selectedLayerId: id }),
    moveLayer: (id, toIndex) => store.dispatch({ type: "reorder-layer", id, toIndex }),
    deleteLayer: (id) => store.dispatch({ type: "delete-layer", id }),
    setText: (id, text) => store.dispatch({ type: "set-text", id, text }),
    setFont: (id, fontFamily) => store.dispatch({ type: "set-font-family", id, fontFamily }),
    setWeight: (id, fontWeight) => store.dispatch({ type: "set-font-weight", id, fontWeight }),
    setSize: (id, fontSize) => store.dispatch({ type: "set-font-size", id, fontSize }),
    setFill: (id, fill) => store.dispatch({ type: "set-fill", id, fill }),
    setAlign: (id, align) => store.dispatch({ type: "set-align", id, align }),
    setAnchor: (id, x, y) => store.dispatch({ type: "set-anchor", id, x, y }),
    setLayerTiming: (id, startSeconds, endSeconds) => store.dispatch({ type: "set-layer-timing", id, startSeconds, endSeconds }),
    setEffectGranularity: (layerId, index, granularity: Granularity) => store.dispatch({ type: "set-effect-granularity", layerId, index, granularity }),
    setEffectParam: (layerId, index, key, value) => store.dispatchGuarded({ type: "set-effect-param", layerId, index, key, value }),
    removeEffect: (layerId, index) => store.dispatch({ type: "remove-effect", layerId, index }),
    openLibrary: () => setLibraryOpen(true),
    togglePlay: () => {
      const clock = getClock(canvasRef.current);
      if (clock?.isPlaying) clock.pause();
      else clock?.play();
    },
    toStart: () => getClock(canvasRef.current)?.seek(0),
    toEnd: () => {
      const { project } = store.getState();
      const clock = getClock(canvasRef.current);
      clock?.pause();
      clock?.seek(Math.max(0, project.canvas.durationSeconds - 1 / project.canvas.fps));
    },
    toggleLoop: () => store.setUi({ loop: !store.getState().ui.loop }),
    toggleChecker: () => setView((v) => ({ ...v, checker: !v.checker })),
    toggleSafe: () => setView((v) => ({ ...v, safe: !v.safe })),
    stage,
    timeline,
  };
  shortcuts.current = { togglePlay: dispatchers.togglePlay, toStart: dispatchers.toStart, toEnd: dispatchers.toEnd, blocked: () => exportOpen || libraryOpen };
  const { data } = adaptStudioEditor(
    {
      project: state.project,
      selectedLayerId: state.ui.selectedLayerId,
      playhead: state.ui.playhead,
      loop: state.ui.loop,
      playing: state.ui.playing,
      canUndo: store.canUndo(),
      view,
    },
    dispatchers,
  );
  return (
    <>
      <StudioEditor data={data} />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        aria-label="Open project file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const res = await loadProjectFromFile(file);
          if (res.ok) {
            store.setProject(res.project);
            setLoadError(null);
          } else setLoadError(res.message);
        }}
      />
      {loadError && (
        <p className="seh-alert" role="alert">
          {loadError}
        </p>
      )}
      {libraryOpen && <EffectsLibraryHost store={store} onClose={() => setLibraryOpen(false)} />}
      {exportOpen && <ExportDialog store={store} onClose={() => setExportOpen(false)} />}
    </>
  );
}
