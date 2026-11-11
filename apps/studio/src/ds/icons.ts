/**
 * Icon shapes for the design-system port (Requirement 18.3).
 *
 * Hand-derived from the ICONS table in the design-system export (20x20 grid, 1.5px stroke, round
 * caps and joins, currentColor). The bundle stores SVG inner-markup strings and renders them with
 * dangerouslySetInnerHTML; this port stores typed shape data instead, so `Icon` renders React SVG
 * children and no HTML is ever injected. Only the 27 icons the mockups reach (plus the three the
 * ported components use internally: check, minus, chevron-down) are carried.
 */

export type IconShape =
  | { readonly tag: "path"; readonly d: string }
  | { readonly tag: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx?: number }
  | { readonly tag: "circle"; readonly cx: number; readonly cy: number; readonly r: number };

export type IconName =
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "close"
  | "code"
  | "copy"
  | "download"
  | "effect"
  | "error"
  | "export"
  | "eye"
  | "grid"
  | "image"
  | "info"
  | "layers"
  | "lock"
  | "minus"
  | "play"
  | "plus"
  | "redo"
  | "search"
  | "success"
  | "text"
  | "trash"
  | "warning";

export const ICONS: Readonly<Record<IconName, readonly IconShape[]>> = {
  "check": [
    { tag: "path", d: "m4.5 10.5 3.5 3.5 7.5-8" },
  ],
  "chevron-down": [
    { tag: "path", d: "m5.5 8 4.5 4.5L14.5 8" },
  ],
  "chevron-left": [
    { tag: "path", d: "M12 5.5 7.5 10l4.5 4.5" },
  ],
  "chevron-right": [
    { tag: "path", d: "M8 5.5l4.5 4.5L8 14.5" },
  ],
  "clock": [
    { tag: "circle", cx: 10, cy: 10, r: 7 },
    { tag: "path", d: "M10 6v4l2.5 2" },
  ],
  "close": [
    { tag: "path", d: "m5 5 10 10M15 5 5 15" },
  ],
  "code": [
    { tag: "path", d: "M7 6 3 10l4 4M13 6l4 4-4 4" },
  ],
  "copy": [
    { tag: "rect", x: 7, y: 7, width: 9.5, height: 9.5, rx: 1.5 },
    { tag: "path", d: "M13 7V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v6.5A1.5 1.5 0 0 0 5 13h2" },
  ],
  "download": [
    { tag: "path", d: "M10 3.5v9" },
    { tag: "path", d: "M6.5 9 10 12.5 13.5 9" },
    { tag: "path", d: "M4 14.5V15a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15v-.5" },
  ],
  "effect": [
    { tag: "path", d: "M9 2.5c.5 3.3 1.7 4.5 5 5-3.3.5-4.5 1.7-5 5-.5-3.3-1.7-4.5-5-5 3.3-.5 4.5-1.7 5-5z" },
    { tag: "path", d: "M15 12v5M12.5 14.5h5" },
  ],
  "error": [
    { tag: "circle", cx: 10, cy: 10, r: 7 },
    { tag: "path", d: "m7.75 7.75 4.5 4.5M12.25 7.75l-4.5 4.5" },
  ],
  "export": [
    { tag: "path", d: "M10 12.5v-9" },
    { tag: "path", d: "M6.5 7 10 3.5 13.5 7" },
    { tag: "path", d: "M4 11.5V15a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15v-3.5" },
  ],
  "eye": [
    { tag: "path", d: "M2.5 10S5.25 5 10 5s7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z" },
    { tag: "circle", cx: 10, cy: 10, r: 2.25 },
  ],
  "grid": [
    { tag: "rect", x: 3.5, y: 3.5, width: 13, height: 13, rx: 1.5 },
    { tag: "path", d: "M3.5 10h13M10 3.5v13" },
  ],
  "image": [
    { tag: "rect", x: 3, y: 4, width: 14, height: 12, rx: 1.5 },
    { tag: "circle", cx: 7.5, cy: 8, r: 1.25 },
    { tag: "path", d: "m3.5 14.5 4-4 3 3 2-2 4 4" },
  ],
  "info": [
    { tag: "circle", cx: 10, cy: 10, r: 7 },
    { tag: "path", d: "M10 9.25v4.25" },
    { tag: "path", d: "M10 6.5h.01" },
  ],
  "layers": [
    { tag: "path", d: "M10 3 17 6.75 10 10.5 3 6.75z" },
    { tag: "path", d: "M3 10.25 10 14l7-3.75" },
    { tag: "path", d: "M3 13.75 10 17.5l7-3.75" },
  ],
  "lock": [
    { tag: "rect", x: 4.5, y: 9, width: 11, height: 8, rx: 1.5 },
    { tag: "path", d: "M7 9V6.5a3 3 0 0 1 6 0V9" },
  ],
  "minus": [
    { tag: "path", d: "M4 10h12" },
  ],
  "play": [
    { tag: "path", d: "M6.5 4.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L7.4 4.1a.6.6 0 0 0-.9.5z" },
  ],
  "plus": [
    { tag: "path", d: "M10 4v12M4 10h12" },
  ],
  "redo": [
    { tag: "path", d: "M13 4.5 16.5 8 13 11.5" },
    { tag: "path", d: "M16.5 8H7.75a4.25 4.25 0 0 0 0 8.5H12" },
  ],
  "search": [
    { tag: "circle", cx: 8.5, cy: 8.5, r: 5 },
    { tag: "path", d: "m12.25 12.25 4.25 4.25" },
  ],
  "success": [
    { tag: "circle", cx: 10, cy: 10, r: 7 },
    { tag: "path", d: "m7 10.25 2 2 4-4.25" },
  ],
  "text": [
    { tag: "path", d: "M4.5 6V4h11v2" },
    { tag: "path", d: "M10 4v12" },
    { tag: "path", d: "M7.5 16h5" },
  ],
  "trash": [
    { tag: "path", d: "M3.5 5.5h13" },
    { tag: "path", d: "M8 5.5V4h4v1.5" },
    { tag: "path", d: "m5 5.5.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5" },
    { tag: "path", d: "M8.5 8.5v5M11.5 8.5v5" },
  ],
  "warning": [
    { tag: "path", d: "M8.7 4.2a1.5 1.5 0 0 1 2.6 0l5.9 10.3a1.5 1.5 0 0 1-1.3 2.25H4.1a1.5 1.5 0 0 1-1.3-2.25z" },
    { tag: "path", d: "M10 8.5v3" },
    { tag: "path", d: "M10 14.25h.01" },
  ],
};

export const ICON_NAMES: readonly IconName[] = (Object.keys(ICONS) as IconName[]).sort();

/** True when `name` is a ported icon. */
export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}
