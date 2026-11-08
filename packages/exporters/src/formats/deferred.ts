/**
 * Typed stubs for the DEFERRED formats (WebM-with-alpha, animated WebP).
 *
 * These formats are not shipped in this release (see the README "Not in this
 * release" section). The public entry points exist with their real option types
 * so callers compile against a stable surface, but each always returns a typed
 * `browser-unsupported` failure and starts no encode. No encoder, muxer, or
 * extra dependency is pulled in for them.
 */

import type { Project } from "@studio/engine";

import type { ExportResult, WebmAlphaOptions, WebpOptions } from "../types.js";
import { fail } from "../errors.js";

const WEBM_MESSAGE =
  "WebM with alpha (VP9) export is not available in this release. Use WebM-alpha-capable builds in a future release, or export a PNG sequence for an alpha-preserving result.";

const WEBP_MESSAGE =
  "Animated WebP export is not available in this release. Use GIF for an animated raster export, or MP4 for video.";

/** Deferred: always returns a typed browser-unsupported failure. Never throws. */
export function runWebmAlphaExport(
  project: Project,
  options: WebmAlphaOptions,
): Promise<ExportResult> {
  void project;
  void options;
  return Promise.resolve(fail("browser-unsupported", WEBM_MESSAGE));
}

/** Deferred: always returns a typed browser-unsupported failure. Never throws. */
export function runWebpExport(project: Project, options: WebpOptions): Promise<ExportResult> {
  void project;
  void options;
  return Promise.resolve(fail("browser-unsupported", WEBP_MESSAGE));
}
