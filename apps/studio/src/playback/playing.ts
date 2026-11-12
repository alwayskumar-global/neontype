/**
 * Mirrors the playback clock's play and pause into `UiState.playing` (task 10.2), so a pure adapter can
 * read `playing` as a selector. Pass the result as the clock's `onPlayingChange`.
 */
import type { Store } from "../shell/store.js";
export function playingSink(store: Pick<Store, "setUi">): (playing: boolean) => void {
  return (playing) => store.setUi({ playing });
}
