/**
 * Typed stub for the DEFERRED format (WebM-with-alpha; deferred by owner decision).
 *
 * Not shipped in this release (see the README "Not in this release" section). The
 * public entry point exists with its real option type so callers compile against a
 * stable surface, but it always returns a typed `browser-unsupported` failure and
 * starts no encode. No encoder, muxer, or extra dependency is pulled in for it.
 */

import type { Project } from "@studio/engine";

import type { ExportResult, WebmAlphaOptions } from "../types.js";
import { fail } from "../errors.js";

const WEBM_MESSAGE =
  "WebM with alpha (VP9) export is not available in this release. Use WebM-alpha-capable builds in a future release, or export a PNG sequence for an alpha-preserving result.";


/** Deferred: always returns a typed browser-unsupported failure. Never throws. */
export function runWebmAlphaExport(
  project: Project,
  options: WebmAlphaOptions,
): Promise<ExportResult> {
  void project;
  void options;
  return Promise.resolve(fail("browser-unsupported", WEBM_MESSAGE));
}


