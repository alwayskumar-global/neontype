#!/usr/bin/env node
/**
 * CLI: converts the five design screens into apps/studio/src/generated/ (committed output).
 *
 *   pnpm --filter @studio/app dc:convert [--out <dir relative to apps/studio>]
 *
 * Reads design/ as INPUT only. Exits non-zero with `file:line: message` on any unsupported construct.
 */
import { DcConvertError } from "./dc-convert-lib.mjs";
import { writeAll } from "./dc-io.mjs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
try {
  const written = writeAll(out);
  console.log(`dc-convert: wrote ${written.length} files`);
  for (const p of written) console.log(`  ${p}`);
} catch (e) {
  if (e instanceof DcConvertError) {
    console.error(`dc-convert: ${e.message}`);
    process.exit(1);
  }
  throw e;
}
