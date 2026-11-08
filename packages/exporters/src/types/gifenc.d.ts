/**
 * Local ambient declaration for `gifenc` 1.0.3 (the package ships no types).
 *
 * Declares only the subset the GIF exporter uses: the `GIFEncoder` factory and
 * the `quantize`/`applyPalette` helpers. Kept in `src` (no `@types/*` package,
 * no tsconfig change), matching the steering constraint.
 */
declare module "gifenc" {
  /** An RGB or RGBA palette entry. */
  export type GifPaletteColor = [number, number, number] | [number, number, number, number];
  export type GifPalette = GifPaletteColor[];

  export interface GifFrameOptions {
    /** Global/local color table for this frame. Required on the first frame. */
    palette?: GifPalette | null;
    /** Frame delay in MILLISECONDS; gifenc writes round(delay/10) centiseconds. */
    delay?: number;
    /** Whether this frame uses single-color transparency. */
    transparent?: boolean;
    /** Palette index treated as transparent when `transparent` is set. */
    transparentIndex?: number;
    /** Loop count: -1 once, 0 forever, >0 explicit. */
    repeat?: number;
    /** Bits per pixel (palette index width). */
    colorDepth?: number;
    /** Frame disposal method. */
    dispose?: number;
    /** Manual-mode first-frame marker. */
    first?: boolean;
  }

  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(opt?: { initialCapacity?: number; auto?: boolean }): GifEncoderInstance;

  /** Quantization pixel format. */
  export type GifQuantizeFormat = "rgb565" | "rgb444" | "rgba4444";

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: GifQuantizeFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number },
  ): GifPalette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: GifQuantizeFormat,
  ): Uint8Array;

  const _default: typeof GIFEncoder;
  export default _default;
}
