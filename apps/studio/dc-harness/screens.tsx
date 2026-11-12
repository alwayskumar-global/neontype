/**
 * Dev-only screens page: mounts ONE generated screen (`?screen=<slug>`) with a static fixture, so the
 * generated CSS can be screenshotted before and after a converter change. Never part of dist/.
 */
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import "./harness.css";
import { FIXTURES } from "./screens-fixtures.js";
const slug = new URLSearchParams(location.search).get("screen") ?? "";
const data = FIXTURES[slug];
const rootEl = document.getElementById("root");
if (!rootEl || !data) throw new Error(`unknown screen "${slug}"`);
const LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  "studio-editor": () => import("../src/generated/studio-editor/StudioEditor.js"),
  "export-flow": () => import("../src/generated/export-flow/ExportFlow.js"),
  "effects-library": () => import("../src/generated/effects-library/EffectsLibrary.js"),
  "error-states": () => import("../src/generated/error-states/ErrorStates.js"),
  "landing-page": () => import("../src/generated/landing-page/LandingPage.js"),
};
const NAMES: Record<string, string> = { "studio-editor": "StudioEditor", "export-flow": "ExportFlow", "effects-library": "EffectsLibrary", "error-states": "ErrorStates", "landing-page": "LandingPage" };
const load = LOADERS[slug];
if (!load) throw new Error(`unknown screen "${slug}"`);
void load().then((m) => {
  const Screen = m[NAMES[slug] ?? ""] as (p: { data: typeof data }) => ReactElement;
  createRoot(rootEl).render(<Screen data={data} />);
  document.documentElement.dataset["ready"] = "1";
});
