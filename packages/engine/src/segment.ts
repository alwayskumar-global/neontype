/**
 * Grapheme-cluster segmentation.
 *
 * The engine renders text one user-perceived character (grapheme cluster) at a
 * time. A single cluster may span several Unicode codepoints — a Tamil akshara
 * such as "ண" plus a vowel sign, or an emoji built from a ZWJ sequence like a
 * family glyph — and must never be split across segments. `segmentText` walks
 * the input with `Intl.Segmenter` at grapheme granularity and emits one
 * `SegmentToken` per cluster, in order.
 *
 * Determinism: `Intl.Segmenter` is a deterministic, DOM-free API, so this module
 * stays pure and safe to call from `computeFrameState` in Node. No `Math.random`,
 * `Date.now`, `performance.now`, DOM, or network access occurs here.
 *
 * Lossless partition: concatenating every `token.text` in order reproduces the
 * original input exactly — grapheme segmentation partitions the string with no
 * loss or duplication. This underpins the segmentation property test (Property
 * 11 / Requirement 11.12), which asserts the engine's segments match the
 * clusters produced by `Intl.Segmenter` over `layer.text`.
 */

/**
 * A single grapheme cluster with its positional indices within the layer text.
 *
 * - `text`: the grapheme cluster string (may be multiple codepoints).
 * - `charIndex`: 0-based running index of clusters, incremented for every
 *   cluster including the `\n` cluster.
 * - `wordIndex`: 0-based word index (see `segmentText` for the exact rule).
 * - `lineIndex`: 0-based line index. The `\n` cluster takes the index of the
 *   line it terminates; clusters after it are on the next line.
 */
export interface SegmentToken {
  text: string;
  charIndex: number;
  wordIndex: number;
  lineIndex: number;
}

/**
 * Segments `text` into grapheme clusters, assigning each a `charIndex`,
 * `wordIndex`, and `lineIndex`.
 *
 * Locale: the segmenter is created with `undefined` (the default/root locale)
 * rather than a hardcoded locale such as `"en"`. Grapheme-cluster boundaries are
 * effectively locale-independent, and the engine must handle scripts like Tamil,
 * so no locale is pinned.
 *
 * charIndex rule: starts at 0 and increments by 1 for every cluster, including
 * the `\n` cluster — it is simply the running cluster index.
 *
 * lineIndex rule: starts at 0. A `\n` cluster takes the *current* lineIndex
 * (the line it terminates); lineIndex is incremented *after* the `\n` token is
 * emitted, so subsequent clusters fall on the next line. For `"ab\ncd"` this
 * yields `[0, 0, 0, 1, 1]`.
 *
 * wordIndex rule: a second `Intl.Segmenter` pass at `granularity: "word"`
 * establishes word boundaries. Word segments reported with `isWordLike === true`
 * are counted in order (0-based). Each grapheme cluster is assigned the index of
 * the word-like segment it falls within, tracked by the cluster's start offset
 * in the original string. A cluster that is not inside a word-like segment — a
 * space, punctuation, or `\n` — inherits the wordIndex of the preceding cluster,
 * or `0` if it is the first cluster. This satisfies the constraint that `\n`
 * "inherits the preceding wordIndex or 0" and never splits a grapheme cluster.
 */
export function segmentText(text: string): SegmentToken[] {
  const graphemeSegmenter = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  });
  const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

  // Map each string offset that begins a word-like segment to its 0-based
  // word index, so a grapheme cluster can look up which word it belongs to.
  const wordIndexByOffset = new Map<number, number>();
  let wordCounter = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike === true) {
      wordIndexByOffset.set(segment.index, wordCounter);
      wordCounter += 1;
    }
  }

  const tokens: SegmentToken[] = [];
  let charIndex = 0;
  let lineIndex = 0;
  let currentWordIndex = 0;

  for (const segment of graphemeSegmenter.segment(text)) {
    const mappedWordIndex = wordIndexByOffset.get(segment.index);
    if (mappedWordIndex !== undefined) {
      currentWordIndex = mappedWordIndex;
    }

    tokens.push({
      text: segment.segment,
      charIndex,
      wordIndex: currentWordIndex,
      lineIndex,
    });

    charIndex += 1;
    if (segment.segment === "\n") {
      lineIndex += 1;
    }
  }

  return tokens;
}
