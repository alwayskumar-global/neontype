/**
 * Second harness page (Requirement 18.10): loads ds.css and exposes the export-parity probe over the
 * demo project, so parity can be checked with the design-system styles present in a production-style
 * build. Unlike index.html this page imports the engine (which imports Zod), so the one allowed
 * `allowsEval` CSP probe may fire here; the Playwright spec tolerates exactly that one.
 */
import "../src/fonts/fonts.css";
import "../src/ds/ds.css";
import { whenFontsReady } from "../src/fonts/fonts.js";
import { runExportParity } from "../src/preview/export-parity-probe.js";
import { demoProject } from "../src/model/demo.js";

window.__studioExportParity = async (t = 3): Promise<number> => {
  const fonts = await whenFontsReady();
  if (!fonts.ok) return 1;
  return runExportParity(demoProject(), t);
};
