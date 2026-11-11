export const STUDIO_DIR: string;
export interface DcConfigFile { source: string; omitIf: object[]; replaceText: { from: string; to: string; expect: number }[]; forbid: object[] }
export interface DcConfig { version: number; designDir: string; outDir: string; forbid: object[]; files: DcConfigFile[] }
export function loadConfig(): DcConfig;
export interface DcResult {
  slug: string;
  componentName: string;
  files: { path: string; content: string | Uint8Array }[];
  bindings: string[];
  keyframes: Record<string, string>;
  dropped: string[];
}
export function convertAll(): DcResult[];
export function convertAllToMap(): Record<string, string | Uint8Array>;
export function writeAll(outDir?: string): string[];
export function readTree(dirRel: string): Record<string, string | Uint8Array>;
export function readStudioText(fileRel: string): string;
export function listStudioFiles(dirRel: string, exts: readonly string[]): string[];
export function readDesignAsset(nameRel: string): Uint8Array;
