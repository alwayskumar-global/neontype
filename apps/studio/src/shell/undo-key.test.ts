import { describe, it, expect } from "vitest";
import { isUndoKey, isTextEntryTarget, shouldUndo } from "./undo-key.js";

const k = (o: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, ...o });

describe("undo shortcut", () => {
  it("matches Ctrl+Z and Cmd+Z (either case) but not redo or plain z", () => {
    expect(isUndoKey(k())).toBe(true);
    expect(isUndoKey(k({ ctrlKey: false, metaKey: true, key: "Z" }))).toBe(true);
    expect(isUndoKey(k({ shiftKey: true }))).toBe(false);
    expect(isUndoKey(k({ ctrlKey: false }))).toBe(false);
    expect(isUndoKey(k({ key: "y" }))).toBe(false);
  });
  it("ignores text-entry targets so native text undo works", () => {
    for (const tagName of ["INPUT", "textarea", "SELECT"]) expect(isTextEntryTarget({ tagName })).toBe(true);
    expect(isTextEntryTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: "CANVAS" })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
  it("does nothing while the export dialog is open", () => {
    expect(shouldUndo({ ...k(), target: { tagName: "CANVAS" } }, false)).toBe(true);
    expect(shouldUndo({ ...k(), target: { tagName: "CANVAS" } }, true)).toBe(false);
    expect(shouldUndo({ ...k(), target: { tagName: "INPUT" } }, false)).toBe(false);
  });
});
