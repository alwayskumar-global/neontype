/**
 * Deterministic exporter-local blur (Req 8.2, 8.4, 8.6).
 *
 * A three-pass separable box blur approximating a Gaussian of standard
 * deviation `sigma = N` (the engine's blur radius in px). The blur runs in
 * PREMULTIPLIED alpha: RGB is scaled by alpha before blurring and divided back
 * out afterwards. This is required for correctness against transparent pixels.
 * A canvas leaves the RGB of fully transparent pixels at (0,0,0); blurring
 * straight (non-premultiplied) RGBA would average that black into the glyph's
 * anti-aliased fringe and darken it (a dark halo). In premultiplied space a
 * transparent pixel contributes (0,0,0,0) to every channel, so the fringe keeps
 * its colour — matching the browser's native `ctx.filter = "blur(Npx)"`, which
 * also blurs in premultiplied space.
 *
 * Edges outside the image are treated as TRANSPARENT BLACK (zero in
 * premultiplied space), not clamped: clamping would re-introduce edge
 * contamination at the canvas border and is wrong once we premultiply.
 *
 * Large radii: cost is bounded by a deterministic downsample -> blur ->
 * upsample. BOTH resamples run in premultiplied-float space: the downsample
 * AREA-AVERAGES (conserving alpha mass, so an extreme blur does not collapse a
 * thin glyph to zero alpha the way point-sampling would), and the upsample is
 * BILINEAR (smooth, no blocky nearest-neighbour steps). Both are pure float
 * math with no runtime-varying inputs, so they are deterministic.
 *
 * No `Math.random`, no clock, no platform-specific math — identical output for
 * identical input in any runtime. Radius is clamped to the engine's `[0, 1000]`
 * bound.
 *
 * Operates on a plain RGBA buffer (`{ data, width, height }`) so it is testable
 * in Node without a canvas; the browser path wraps canvas `ImageData`.
 */

/** The engine's blur bound (Req 8 / drawFrame hardening). */
export const BLUR_MAX = 1000;

/** Above this sigma, downsample by an integer factor before blurring. */
export const DOWNSAMPLE_THRESHOLD = 100;

/** A plain RGBA image buffer. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** A premultiplied-alpha float image: RGB already scaled by alpha, A in [0,255]. */
export interface PremultImage {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * The three box-blur radii that approximate a Gaussian of a given sigma, per
 * the standard three-box approximation (Kovesi / "Fast Almost-Gaussian
 * Filtering"). Deterministic integer radii.
 */
export function boxRadiiForSigma(sigma: number, passes = 3): number[] {
  if (sigma <= 0) return new Array(passes).fill(0);
  const n = passes;
  // Ideal averaging filter width.
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl -= 1;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = i < m ? wl : wu;
    radii.push((w - 1) / 2);
  }
  return radii;
}

/**
 * One horizontal box pass over a Float32 premultiplied buffer, edges treated
 * as transparent black (zero). Writes into `dst`.
 */
function boxBlurH(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
  if (radius <= 0) {
    dst.set(src);
    return;
  }
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      // Prime the window: samples left of 0 are transparent black (0).
      for (let k = 0; k <= radius; k++) {
        acc += src[row + k * 4 + c];
      }
      for (let x = 0; x < width; x++) {
        dst[row + x * 4 + c] = acc / window;
        const xOut = x - radius;
        const xIn = x + radius + 1;
        if (xIn < width) acc += src[row + xIn * 4 + c];
        if (xOut >= 0) acc -= src[row + xOut * 4 + c];
      }
    }
  }
}

/**
 * One vertical box pass over a Float32 premultiplied buffer, edges treated as
 * transparent black (zero). Writes into `dst`.
 */
function boxBlurV(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
  if (radius <= 0) {
    dst.set(src);
    return;
  }
  const window = radius * 2 + 1;
  for (let x = 0; x < width; x++) {
    const col = x * 4;
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let k = 0; k <= radius; k++) {
        acc += src[k * width * 4 + col + c];
      }
      for (let y = 0; y < height; y++) {
        dst[y * width * 4 + col + c] = acc / window;
        const yOut = y - radius;
        const yIn = y + radius + 1;
        if (yIn < height) acc += src[yIn * width * 4 + col + c];
        if (yOut >= 0) acc -= src[yOut * width * 4 + col + c];
      }
    }
  }
}

/** Builds a premultiplied Float32 image from an 8-bit straight-alpha image. */
function toPremultiplied(image: RgbaImage): PremultImage {
  const length = image.data.length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 4) {
    const a = image.data[i + 3];
    const af = a / 255;
    out[i] = image.data[i] * af;
    out[i + 1] = image.data[i + 1] * af;
    out[i + 2] = image.data[i + 2] * af;
    out[i + 3] = a;
  }
  return { data: out, width: image.width, height: image.height };
}

/** Unpremultiplies a blurred premultiplied image back into an 8-bit RGBA image. */
function fromPremultiplied(src: PremultImage): RgbaImage {
  const length = src.data.length;
  const out = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i += 4) {
    const a = src.data[i + 3];
    out[i + 3] = Math.round(a);
    if (a > 0) {
      const inv = 255 / a;
      out[i] = Math.round(src.data[i] * inv);
      out[i + 1] = Math.round(src.data[i + 1] * inv);
      out[i + 2] = Math.round(src.data[i + 2] * inv);
    } else {
      // Fully transparent: RGB is undefined; leave as transparent black.
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
    }
  }
  return { data: out, width: src.width, height: src.height };
}

/** Sum of the premultiplied alpha channel (for conservation checks/tests). */
export function premultipliedAlphaSum(image: PremultImage): number {
  let sum = 0;
  for (let i = 3; i < image.data.length; i += 4) sum += image.data[i];
  return sum;
}

/** Three separable box passes (H,V) in place over a premultiplied buffer. */
function blurPremultiplied(image: PremultImage, sigma: number): void {
  const radii = boxRadiiForSigma(sigma, 3);
  // `a` is the live buffer (image.data); `b` is scratch. Each pass writes H into
  // scratch then V back into the live buffer, so the result ends up in `a`.
  const a = image.data;
  const b = new Float32Array(a.length);
  for (const r of radii) {
    boxBlurH(a, b, image.width, image.height, r);
    boxBlurV(b, a, image.width, image.height, r);
  }
}

/**
 * Area-averaging downsample by an integer `factor`, in premultiplied-float
 * space. Each destination pixel is the MEAN of the `factor x factor` source
 * pixels it covers (fewer at the right/bottom edge), so the mean premultiplied
 * alpha DENSITY (sum / pixel-count) is preserved — a thin glyph's alpha is not
 * point-sampled away to zero the way nearest-neighbour sampling drops most
 * partial-alpha pixels.
 */
export function areaDownsamplePremultiplied(image: PremultImage, factor: number): PremultImage {
  const w = Math.max(1, Math.ceil(image.width / factor));
  const h = Math.max(1, Math.ceil(image.height / factor));
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = y * factor;
    const sy1 = Math.min(image.height, sy0 + factor);
    for (let x = 0; x < w; x++) {
      const sx0 = x * factor;
      const sx1 = Math.min(image.width, sx0 + factor);
      let r = 0;
      let g = 0;
      let bl = 0;
      let al = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sy * image.width + sx) * 4;
          r += image.data[si];
          g += image.data[si + 1];
          bl += image.data[si + 2];
          al += image.data[si + 3];
          count++;
        }
      }
      const di = (y * w + x) * 4;
      // True area average: divide by the ACTUAL number of covered source pixels
      // (edge cells cover fewer), so this is a mean over the cell. Mean alpha
      // DENSITY (sum / pixel-count) is preserved across the resample, so a thin
      // glyph's alpha is not point-sampled away to zero the way nearest-neighbour
      // sampling would drop most partial-alpha pixels.
      const inv = count > 0 ? 1 / count : 0;
      data[di] = r * inv;
      data[di + 1] = g * inv;
      data[di + 2] = bl * inv;
      data[di + 3] = al * inv;
    }
  }
  return { data, width: w, height: h };
}

/**
 * Bilinear upsample of a premultiplied-float image to `targetW x targetH`.
 * Samples are taken at pixel centres mapped back into the source; out-of-range
 * neighbours are clamped. Smooth and deterministic.
 */
export function bilinearUpsamplePremultiplied(
  image: PremultImage,
  targetW: number,
  targetH: number,
): PremultImage {
  const data = new Float32Array(targetW * targetH * 4);
  const sw = image.width;
  const sh = image.height;
  const scaleX = sw / targetW;
  const scaleY = sh / targetH;
  for (let y = 0; y < targetH; y++) {
    // Pixel-centre mapping.
    const fy = (y + 0.5) * scaleY - 0.5;
    let y0 = Math.floor(fy);
    const wy = fy - y0;
    let y1 = y0 + 1;
    if (y0 < 0) y0 = 0;
    if (y1 < 0) y1 = 0;
    if (y0 > sh - 1) y0 = sh - 1;
    if (y1 > sh - 1) y1 = sh - 1;
    for (let x = 0; x < targetW; x++) {
      const fx = (x + 0.5) * scaleX - 0.5;
      let x0 = Math.floor(fx);
      const wx = fx - x0;
      let x1 = x0 + 1;
      if (x0 < 0) x0 = 0;
      if (x1 < 0) x1 = 0;
      if (x0 > sw - 1) x0 = sw - 1;
      if (x1 > sw - 1) x1 = sw - 1;
      const i00 = (y0 * sw + x0) * 4;
      const i01 = (y0 * sw + x1) * 4;
      const i10 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const di = (y * targetW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = image.data[i00 + c] * (1 - wx) + image.data[i01 + c] * wx;
        const bot = image.data[i10 + c] * (1 - wx) + image.data[i11 + c] * wx;
        data[di + c] = top * (1 - wy) + bot * wy;
      }
    }
  }
  return { data, width: targetW, height: targetH };
}

/**
 * Blurs an RGBA image, returning a new buffer, deterministically.
 * `sigmaPx` is clamped to `[0, 1000]`. At `sigma <= 0` the input is returned
 * unchanged. The blur runs in premultiplied alpha (three separable H,V passes
 * per the box radii for the sigma) so transparent pixels never darken the
 * blurred fringe. Above the downsample threshold the work is bounded by an
 * area-averaging downsample and a bilinear upsample, both in premultiplied
 * space (conserving alpha mass).
 */
export function blurImage(image: RgbaImage, sigmaPx: number): RgbaImage {
  const sigma = Math.max(0, Math.min(BLUR_MAX, sigmaPx));
  if (sigma <= 0 || image.width === 0 || image.height === 0) {
    return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
  }

  const premult = toPremultiplied(image);

  if (sigma > DOWNSAMPLE_THRESHOLD) {
    const factor = Math.max(2, Math.floor(sigma / DOWNSAMPLE_THRESHOLD) + 1);
    const small = areaDownsamplePremultiplied(premult, factor);
    blurPremultiplied(small, sigma / factor);
    const restored = bilinearUpsamplePremultiplied(small, image.width, image.height);
    return fromPremultiplied(restored);
  }

  blurPremultiplied(premult, sigma);
  return fromPremultiplied(premult);
}
