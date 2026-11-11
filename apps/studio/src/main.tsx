import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./tokens.css";
// Design-system styles: tokens are scoped under .ds-root and component rules are .ui-* only, so this
// restyles nothing in the live studio (verified by the export-parity and Playwright suites).
import "./ds/ds.css";
import { App } from "./shell/App.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
