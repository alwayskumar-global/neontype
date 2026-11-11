/**
 * Pure helpers for the Ctrl/Cmd+Z shortcut (Requirement 16). Structural types so
 * they are testable in Node without a DOM.
 */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Ctrl/Cmd+Z without Shift. Redo is out of scope and is not matched. */
export function isUndoKey(e: KeyLike): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
}

/** True for targets that own their own text undo (inputs, textareas, selects, contenteditable). */
export function isTextEntryTarget(t: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!t) return false;
  const tag = (t.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable === true;
}

/**
 * Whether the window-level handler should run the undo: the key matches, the
 * target is not a text field, and no export dialog is open (it owns focus).
 */
export function shouldUndo(
  e: KeyLike & { target: { tagName?: string; isContentEditable?: boolean } | null },
  exportOpen: boolean,
): boolean {
  return isUndoKey(e) && !isTextEntryTarget(e.target) && !exportOpen;
}
