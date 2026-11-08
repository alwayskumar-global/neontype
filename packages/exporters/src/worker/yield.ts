/**
 * Cooperative macrotask yield for the worker export loop (Req 9.5).
 *
 * The worker's `runExport` loop is otherwise synchronous, so a posted `abort`
 * message (a macrotask) is never delivered mid-loop. `frameCountYield` returns a
 * per-frame hook that actually yields to the macrotask queue at most once every
 * `interval` frames (default 4), so abort latency stays within one yield
 * interval while the per-frame cost is amortised. The yield is a `MessageChannel`
 * round-trip (a real macrotask, cheaper and more predictable than
 * `setTimeout(0)` clamping). No wall-clock is read: the cadence is a pure frame
 * count, which keeps this usable from the frame path under the `Date.now`/
 * `performance.now` lint ban.
 */

/** Yields to the macrotask queue once via a `MessageChannel` round-trip. */
export function macrotaskYield(): Promise<void> {
  // `MessageChannel` exists in both window and worker scopes. Each call makes a
  // fresh channel so there is no shared state to leak between frames.
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (): void => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/**
 * Builds a per-frame `yieldControl` that performs a real macrotask yield at most
 * once every `interval` frames; the other frames resolve synchronously (an
 * already-resolved promise), so the loop is not slowed four-fold. Abort is seen
 * within one yield interval.
 */
export function frameCountYield(interval = 4): () => Promise<void> {
  let sinceYield = 0;
  return (): Promise<void> => {
    sinceYield += 1;
    if (sinceYield >= interval) {
      sinceYield = 0;
      return macrotaskYield();
    }
    return Promise.resolve();
  };
}
