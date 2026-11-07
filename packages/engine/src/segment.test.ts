import { describe, expect, it } from "vitest";
import { segmentText } from "./segment.js";

describe("segmentText", () => {
  it('assigns charIndex, lineIndex, and text for "ab\\ncd"', () => {
    const tokens = segmentText("ab\ncd");

    expect(tokens.map((t) => t.text)).toEqual(["a", "b", "\n", "c", "d"]);
    expect(tokens.map((t) => t.charIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(tokens.map((t) => t.lineIndex)).toEqual([0, 0, 0, 1, 1]);
  });

  it("keeps a ZWJ emoji sequence as a single grapheme cluster", () => {
    // Woman technologist: U+1F469 (woman) U+200D (ZWJ) U+1F4BB (laptop).
    // Widely supported as a single cluster by Intl.Segmenter.
    const womanTechnologist = "👩‍💻";
    const tokens = segmentText(womanTechnologist);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.text).toBe(womanTechnologist);
    expect(tokens[0]?.charIndex).toBe(0);
    expect(tokens[0]?.lineIndex).toBe(0);
  });

  it("partitions the input losslessly (concatenation reproduces the source)", () => {
    const samples = [
      "ab\ncd",
      "👩‍💻",
      "வணக்கம்",
      "Hello, world!",
      "line one\nline two\n",
      "emoji 👩‍💻 and தமிழ் mixed",
      "",
    ];

    for (const sample of samples) {
      const joined = segmentText(sample)
        .map((t) => t.text)
        .join("");
      expect(joined).toBe(sample);
    }
  });

  it("increments lineIndex correctly across multiple newlines", () => {
    const tokens = segmentText("a\nb\n\nc");

    expect(tokens.map((t) => t.text)).toEqual([
      "a",
      "\n",
      "b",
      "\n",
      "\n",
      "c",
    ]);
    // a -> line0, \n -> line0, b -> line1, \n -> line1, \n -> line2, c -> line3
    expect(tokens.map((t) => t.lineIndex)).toEqual([0, 0, 1, 1, 2, 3]);
    expect(tokens.map((t) => t.charIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("assigns 0-based wordIndex and lets \\n inherit the preceding wordIndex", () => {
    const tokens = segmentText("hi\nyo");

    // "hi" is word 0, "yo" is word 1. The \n is not word-like and inherits the
    // preceding cluster's wordIndex (0).
    expect(tokens.map((t) => t.text)).toEqual(["h", "i", "\n", "y", "o"]);
    expect(tokens.map((t) => t.wordIndex)).toEqual([0, 0, 0, 1, 1]);
  });

  it("gives a leading \\n a wordIndex of 0", () => {
    const tokens = segmentText("\nword");

    expect(tokens[0]?.text).toBe("\n");
    expect(tokens[0]?.wordIndex).toBe(0);
  });
});
