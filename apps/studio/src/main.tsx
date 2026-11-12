import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./tokens.css";
import { App } from "./shell/App.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
