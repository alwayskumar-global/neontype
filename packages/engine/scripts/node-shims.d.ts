/**
 * Minimal ambient type declarations for the Node built-ins used by
 * `generate-schemas.ts` (Task 11.1).
 *
 * The engine package intentionally does not depend on `@types/node` (see the
 * fixture-read note in `src/migrate.test.ts`), yet the schema-generation script
 * must write files to disk. Rather than add a dependency or change `tsconfig`,
 * this file declares only the exact Node surface the script uses. `tsx`
 * provides the real implementations at runtime.
 *
 * This is a global (non-module) declaration file — it contains no top-level
 * `import`/`export`, so the `declare module "node:*"` blocks are ambient module
 * declarations, not augmentations. It lives under `scripts/` and is not part of
 * the engine's public `src` surface. ESLint runs on `src` only, so no lint
 * directives are involved.
 */

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module "node:fs" {
  export function mkdirSync(path: string, options: { recursive: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}

declare const process: { argv: string[] };
