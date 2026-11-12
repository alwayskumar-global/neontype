/**
 * UiState.playing mirrors the playback clock (task 10.2): starting and stopping the clock updates it, and
 * it is UI state only: it never touches the project, the undo history, or a saved file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeProject } from "@studio/engine";
import { newProject } from "../model/project.js";
import { Store } from "../shell/store.js";
import { PlaybackClock } from "./clock.js";
import { playingSink } from "./playing.js";
beforeEach(() => {
  // The clock reads requestAnimationFrame and performance.now; a test double stands in for both.
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function wired(store: Store): PlaybackClock {
  return new PlaybackClock({
    onTick: () => undefined,
    getDuration: () => store.getState().project.canvas.durationSeconds,
    getLoop: () => store.getState().ui.loop,
    onPlayingChange: playingSink(store),
  });
}
describe("UiState.playing", () => {
  it("starts false", () => {
    expect(new Store().getState().ui.playing).toBe(false);
  });
  it("follows the clock: play sets it, pause clears it", () => {
    const store = new Store();
    const clock = wired(store);
    clock.play();
    expect(store.getState().ui.playing).toBe(true);
    expect(clock.isPlaying).toBe(true);
    clock.pause();
    expect(store.getState().ui.playing).toBe(false);
    expect(clock.isPlaying).toBe(false);
  });
  it("notifies subscribers once per change, not on a repeated play or pause", () => {
    const store = new Store();
    const clock = wired(store);
    let notified = 0;
    store.subscribe(() => notified++);
    clock.play();
    clock.play();
    clock.pause();
    clock.pause();
    expect(notified).toBe(2);
  });
  it("disposing the clock while it plays clears it", () => {
    const store = new Store();
    const clock = wired(store);
    clock.play();
    clock.dispose();
    expect(store.getState().ui.playing).toBe(false);
  });
  it("survives replacing the project and a loop toggle", () => {
    const store = new Store();
    const clock = wired(store);
    clock.play();
    store.setProject(newProject());
    expect(store.getState().ui.playing).toBe(true);
    store.setUi({ loop: false });
    expect(store.getState().ui.playing).toBe(true);
  });
  it("is not part of the project, the undo history, or a saved file", () => {
    const store = new Store();
    const project = store.getState().project;
    const saved = serializeProject(project);
    const clock = wired(store);
    clock.play();
    clock.pause();
    expect(store.getState().project).toBe(project);
    expect(store.historyLength()).toBe(0);
    expect(store.canUndo()).toBe(false);
    expect(serializeProject(store.getState().project)).toBe(saved);
    expect(saved).not.toMatch(/playing/);
  });
});
