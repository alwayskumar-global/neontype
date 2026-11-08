/**
 * React binding for the store: subscribe to state via useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import type { Store } from "./store.js";

export function useStoreState<T>(store: Store, select: (s: ReturnType<Store["getState"]>) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
