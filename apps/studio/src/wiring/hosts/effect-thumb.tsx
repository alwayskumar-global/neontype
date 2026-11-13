/**
 * Card thumbnails for the Effects Library: a short sample word per effect, animated with CSS keyframes in a
 * continuous loop, whether or not the card is hovered or focused (owner decision, replacing the hover-only rule
 * of gap D-5). Under prefers-reduced-motion the loop is off and the text shows its final frame. The animation is
 * CSS only (no JS clock), so the browser composites it and pauses it off-screen. These are APPROXIMATIONS of the
 * effects, not engine output. Per-letter delays go through the `--i` custom property (CSSOM, CSP-safe); no
 * `style` prop.
 */
import type { ReactElement } from "react";
import { setCssVars } from "../../ui/cssvars.js";
import "./effects-library-host.css";
/** Sample text and the class that animates it, per catalog effect id. */
const THUMBS: Record<string, { cls: string; sample: string }> = {
  typewriter: { cls: "fx fx--type", sample: "Hello" },
  "fade-slide": { cls: "fx fx--rise", sample: "Sale today" },
  "blur-in": { cls: "fx fx--blur", sample: "Dream" },
  "kinetic-pop": { cls: "fx fx--pop", sample: "Boom" },
  wave: { cls: "fx fx--wave lib-tamil", sample: "வணக்கம்" },
  "glitch-reveal": { cls: "fx lib-fx lib-fx--glitch", sample: "Glitch" },
  "neon-flicker": { cls: "fx lib-fx lib-fx--flicker", sample: "OPEN" },
  spotlight: { cls: "fx lib-fx lib-fx--spot", sample: "Spotlight" },
  "scale-bounce": { cls: "fx lib-fx lib-fx--bounce", sample: "Big news" },
  "rotate-drop": { cls: "fx lib-fx lib-fx--rotdrop", sample: "Drop" },
  "letter-spread": { cls: "fx lib-fx lib-fx--spread", sample: "Goodbye" },
  "line-wipe": { cls: "fx lib-fx lib-fx--wipe", sample: "New menu" },
};
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
/** Splits into user-perceived characters so Tamil and emoji never break apart. */
function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}
export function effectThumb(effectId: string): ReactElement | null {
  const t = THUMBS[effectId];
  if (!t) return null;
  return (
    <span className={`lib-thumb is-playing ${t.cls}`} aria-hidden="true" data-effect={effectId}>
      {graphemes(t.sample).map((g, i) => (
        <span key={i} ref={(el) => { if (el) setCssVars(el, { "--i": i }); }}>
          {g}
        </span>
      ))}
    </span>
  );
}
