/**
 * Studio editor view. Extracted from App so App can switch between the landing page and the studio.
 * The editor itself is the generated Studio Editor screen, mounted by its host.
 */
import type { Store } from "./store.js";
import { StudioEditorHost } from "../wiring/hosts/studio-editor-host.js";
export function StudioView({ store, onBack }: { store: Store; onBack: () => void }) {
  return <StudioEditorHost store={store} onBack={onBack} />;
}
