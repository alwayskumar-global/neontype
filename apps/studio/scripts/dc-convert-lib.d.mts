export class DcConvertError extends Error {
  readonly file: string;
  readonly line: number;
  constructor(message: string, file: string, line: number);
}
export const DS_COMPONENTS: string[];
export function slugOf(name: string): string;
export function pascalCase(name: string): string;
export interface ConvertRules {
  omitIf?: object[];
  replaceText?: { from: string; to: string; expect: number }[];
  forbid?: object[];
}
export interface ConvertOptions {
  fileName: string;
  rules?: ConvertRules;
  forbid?: object[];
  assets?: Record<string, Uint8Array>;
}
export interface ConvertResult {
  slug: string;
  componentName: string;
  files: { path: string; content: string | Uint8Array }[];
  bindings: string[];
  keyframes: Record<string, string>;
  dropped: string[];
}
export function convertDc(source: string | Uint8Array, options: ConvertOptions): ConvertResult;
