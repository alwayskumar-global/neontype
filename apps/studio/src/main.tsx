import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./tokens.css";
// Design-system styles. Tokens are scoped under .ds-root and component rules are .ui-* only; the generated
// screens import this file too, so the explicit import keeps the dist guarantee independent of which are wired.
import "./ds/ds.css";
import { App } from "./shell/App.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
