/**
 * Minimal external store (Requirement 10): the single Project source of truth
 * plus separate UI state (selection, playhead, loop). No dependency; React
 * subscribes via useSyncExternalStore. Project transitions go through the pure
 * model reducer; UI state is set directly.
 */
import type { Project } from "@studio/engine";
import { applyAction } from "../model/transitions.js";
import type { Action } from "../model/actions.js";
import { newProject } from "../model/project.js";

export interface UiState {
  selectedLayerId: string | null;
  playhead: number;
  loop: boolean;
}

interface State {
  project: Project;
  ui: UiState;
}

type Listener = () => void;

export class Store {
  private state: State;
  private readonly listeners = new Set<Listener>();

  constructor(project: Project = newProject()) {
    this.state = { project, ui: { selectedLayerId: project.layers[0]?.id ?? null, playhead: 0, loop: true } };
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

  /** Dispatch and report whether the action was accepted (true) or rejected. */
  dispatchGuarded(action: Action): boolean {
    const next = applyAction(this.state.project, action);
    if (next !== this.state.project) {
      this.state = { ...this.state, project: next };
      this.emit();
      return true;
    }
    return false;
  }

  /** Replace the whole project (save/load). */
  setProject(project: Project): void {
    this.state = { project, ui: { selectedLayerId: project.layers[0]?.id ?? null, playhead: 0, loop: this.state.ui.loop } };
    this.emit();
  }

  setUi(patch: Partial<UiState>): void {
    this.state = { ...this.state, ui: { ...this.state.ui, ...patch } };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
