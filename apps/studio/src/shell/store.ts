/**
 * Minimal external store (Requirement 10, 16): the single Project source of
 * truth plus separate UI state (selection, playhead, loop), a linear undo
 * history of PROJECT states, and a gesture API so a pointer drag is ONE undo
 * step. No dependency; React subscribes via useSyncExternalStore. Project
 * transitions go through the pure model reducer; UI state is set directly.
 *
 * Project values are immutable and structurally shared, so the history stores
 * references (no deep copies). A transition that changes nothing returns the same
 * reference, which is how "unchanged" is detected (`!==`) and why a no-op adds no step.
 */
import type { Project } from "@studio/engine";
import { applyAction } from "../model/transitions.js";
import type { Action } from "../model/actions.js";
import { newProject } from "../model/project.js";

export interface UiState {
  selectedLayerId: string | null;
  playhead: number;
  loop: boolean;
  /** Whether the preview clock is playing (mirrors the clock; UI state, never saved or in history). */
  playing: boolean;
}

interface State {
  project: Project;
  ui: UiState;
}

type Listener = () => void;

/** Maximum number of undo steps kept; the oldest is dropped above this. */
export const HISTORY_CAP = 100;

export class Store {
  private state: State;
  private readonly listeners = new Set<Listener>();
  private history: Project[] = [];
  /** The project at `beginGesture`, or null when no gesture is open. */
  private gestureBase: Project | null = null;

  constructor(project: Project = newProject()) {
    this.state = { project, ui: { selectedLayerId: project.layers[0]?.id ?? null, playhead: 0, loop: true, playing: false } };
  }

  getState = (): State => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Dispatch a pure model action (replaces the project). */
  dispatch(action: Action): void {
    this.dispatchGuarded(action);
  }

  /** Dispatch and report whether the action was accepted (true) or rejected/unchanged. */
  dispatchGuarded(action: Action): boolean {
    // A discrete edit while a gesture is open closes that gesture first.
    if (this.gestureBase !== null) this.commitGesture();
    const prev = this.state.project;
    const next = applyAction(prev, action);
    if (next === prev) return false;
    this.pushHistory(prev);
    this.state = { ...this.state, project: next };
    this.emit();
    return true;
  }

  /** Opens a gesture: remembers the current project as its base. */
  beginGesture(): void {
    if (this.gestureBase !== null) this.commitGesture();
    this.gestureBase = this.state.project;
  }

  /** Applies an action live during a gesture WITHOUT touching history. */
  preview(action: Action): boolean {
    if (this.gestureBase === null) return false;
    const prev = this.state.project;
    const next = applyAction(prev, action);
    if (next === prev) return false;
    this.state = { ...this.state, project: next };
    this.emit();
    return true;
  }

  /** Closes the gesture; pushes the base ONCE iff the project changed. */
  commitGesture(): boolean {
    const base = this.gestureBase;
    if (base === null) return false;
    this.gestureBase = null;
    if (this.state.project === base) return false;
    this.pushHistory(base);
    return true;
  }

  /** Closes the gesture and restores its base project; history is unchanged. */
  cancelGesture(): void {
    const base = this.gestureBase;
    if (base === null) return;
    this.gestureBase = null;
    this.restore(base);
  }

  /** Whether an undo step (or an open gesture to cancel) is available. */
  canUndo(): boolean {
    return this.gestureBase !== null || this.history.length > 0;
  }

  /** Number of undo steps currently held (for tests and UI). */
  historyLength(): number {
    return this.history.length;
  }

  /**
   * Undo. During an open gesture this CANCELS it (no extra step). Otherwise pops
   * one step. With nothing to undo it returns false and changes nothing (same
   * project reference).
   */
  undo(): boolean {
    if (this.gestureBase !== null) {
      this.cancelGesture();
      return true;
    }
    const prev = this.history.pop();
    if (prev === undefined) return false;
    this.restore(prev);
    return true;
  }

  /** Replace the whole project (open / New / demo): history is cleared. */
  setProject(project: Project): void {
    this.history = [];
    this.gestureBase = null;
    this.state = { project, ui: { selectedLayerId: project.layers[0]?.id ?? null, playhead: 0, loop: this.state.ui.loop, playing: this.state.ui.playing } };
    this.emit();
  }

  setUi(patch: Partial<UiState>): void {
    this.state = { ...this.state, ui: { ...this.state.ui, ...patch } };
    this.emit();
  }

  private pushHistory(p: Project): void {
    this.history.push(p);
    if (this.history.length > HISTORY_CAP) this.history.shift();
  }

  /** Restores a project and repairs selection and playhead against it. */
  private restore(project: Project): void {
    const ui = this.state.ui;
    const selected = project.layers.some((l) => l.id === ui.selectedLayerId)
      ? ui.selectedLayerId
      : (project.layers[0]?.id ?? null);
    const playhead = Math.max(0, Math.min(ui.playhead, project.canvas.durationSeconds));
    this.state = { project, ui: { ...ui, selectedLayerId: selected, playhead } };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
