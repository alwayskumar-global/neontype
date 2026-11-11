/**
 * Dev-only smoke harness (Requirement 17.10): mounts the GENERATED Studio Editor with a static
 * fixture, under the same strict CSP as production. Not a production route and never part of dist/.
 * Imports no engine code, so a clean run has ZERO CSP violations.
 */
import { createRoot } from "react-dom/client";
import "./harness.css";
import { StudioEditor } from "../src/generated/studio-editor/StudioEditor.js";
import { STUDIO_EDITOR_FIXTURE } from "./fixture.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
createRoot(rootEl).render(<StudioEditor data={STUDIO_EDITOR_FIXTURE} />);
