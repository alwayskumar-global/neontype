/**
 * Trivial echo worker for the Group-1 CSP/worker smoke test. Replies "pong" to
 * "ping". Not part of the product; proves the strict CSP permits a module worker
 * built from a bundler URL.
 */
self.addEventListener("message", (e) => {
  if ((e as MessageEvent).data === "ping") {
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage("pong");
  }
});
export {};
