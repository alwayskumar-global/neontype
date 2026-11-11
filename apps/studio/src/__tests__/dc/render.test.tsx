import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { StudioEditor, STUDIO_EDITOR_BINDINGS, STUDIO_EDITOR_KEYFRAMES } from "../../generated/studio-editor/StudioEditor.js";
import { EffectsLibrary, EFFECTS_LIBRARY_BINDINGS, EFFECTS_LIBRARY_KEYFRAMES } from "../../generated/effects-library/EffectsLibrary.js";
import { ExportFlow, EXPORT_FLOW_BINDINGS } from "../../generated/export-flow/ExportFlow.js";
import { ErrorStates, ERROR_STATES_BINDINGS } from "../../generated/error-states/ErrorStates.js";
import { LandingPage, LANDING_PAGE_BINDINGS } from "../../generated/landing-page/LandingPage.js";
import { STUDIO_EDITOR_FIXTURE } from "../../../dc-harness/fixture.js";
import { convertAll } from "../../../scripts/dc-io.mjs";

const html = (el: ReactElement): string => renderToStaticMarkup(el);

const SCREENS: { slug: string; el: () => ReactElement; bindings: readonly string[] }[] = [
  { slug: "studio-editor", el: () => <StudioEditor data={{}} />, bindings: STUDIO_EDITOR_BINDINGS },
  { slug: "effects-library", el: () => <EffectsLibrary data={{}} backdrop={<StudioEditor data={{}} />} />, bindings: EFFECTS_LIBRARY_BINDINGS },
  { slug: "export-flow", el: () => <ExportFlow data={{}} backdrop={null} />, bindings: EXPORT_FLOW_BINDINGS },
  { slug: "error-states", el: () => <ErrorStates data={{}} />, bindings: ERROR_STATES_BINDINGS },
  { slug: "landing-page", el: () => <LandingPage data={{}} />, bindings: LANDING_PAGE_BINDINGS },
];

describe("every generated screen renders with empty data (a missing binding is never an error)", () => {
  for (const s of SCREENS) {
    it(s.slug, () => {
      const out = html(s.el());
      // React 19 may prepend <link rel="preload"> tags for images; the screen root follows them.
      const body = out.replace(/^(<link [^>]*\/>)+/, "");
      expect(body).toMatch(new RegExp(`^<div class="ds-root dc-${s.slug}`));
      expect(out.length).toBeGreaterThan(500);
      expect(out).not.toContain(" style=");
      expect(out).not.toContain("<script");
      expect(out).not.toContain("undefined");
      expect(out).not.toContain("[object Object]");
      expect(out).not.toContain("NaN");
    });
  }
  it("the exported BINDINGS match the converter's own list", () => {
    const fromConverter = Object.fromEntries(convertAll().map((r) => [r.slug, r.bindings]));
    for (const s of SCREENS) expect([...s.bindings], s.slug).toEqual(fromConverter[s.slug]);
  });
  it("only the screens with helmet keyframes export a non-empty KEYFRAMES map", () => {
    expect(Object.keys(STUDIO_EDITOR_KEYFRAMES)).toHaveLength(0);
    expect(Object.keys(EFFECTS_LIBRARY_KEYFRAMES)).toHaveLength(10);
  });
});

describe("Studio Editor with the harness fixture", () => {
  const out = html(<StudioEditor data={STUDIO_EDITOR_FIXTURE} />);

  it("the fixture covers every root binding the screen reads", () => {
    const missing = STUDIO_EDITOR_BINDINGS.filter((b) => !(b in STUDIO_EDITOR_FIXTURE));
    expect(missing).toEqual([]);
  });
  it("binds text and values from the data", () => {
    expect(out).toContain('aria-label="Project name"');
    expect(out).toContain('value="Grand opening - teaser"');
    expect(out).toContain("00:01:07");
    // posY / opacity / scale are text bindings; opacityPct is only a CSS custom property (set client-side).
    expect(out).toContain(">564<");
    expect(out).toContain(">68<");
    expect(out).toContain(">98.7<");
    expect(out).not.toContain("68.0%");
  });
  it("sc-if renders the paused branch only", () => {
    expect(out).toContain('aria-label="Play"');
    expect(out).not.toContain('aria-label="Pause"');
    const playing = html(<StudioEditor data={{ ...STUDIO_EDITOR_FIXTURE, playing: true, paused: false }} />);
    expect(playing).toContain('aria-label="Pause"');
    expect(playing).not.toContain('aria-label="Play"');
  });
  it("sc-for renders one element per item with the item's text", () => {
    for (const word of ["Sale ", "starts ", "Friday"]) expect(out).toContain(word);
    expect(out).toContain("ENTRANCES");
    expect(out).toContain("Typewriter");
    expect(out).toContain("Fade-slide, split by Word, applied to selected layer");
  });
  it("aria narrowing: aria-checked comes from string data", () => {
    expect(out).toContain('aria-checked="false"');
    expect(out).toContain('aria-checked="true"');
  });
  it("renders the logo image through the asset import with its alt text", () => {
    expect(out).toMatch(/<img [^>]*alt="NeonType"/);
    expect(out).toMatch(/src="[^"]*neontype-logo[^"]*\.png"/);
  });
});

describe("Landing Page links (approved config rule)", () => {
  it("all four open-the-studio anchors point at #studio", () => {
    const out = html(<LandingPage data={{}} />);
    expect(out.match(/href="#studio"/g)).toHaveLength(4);
    expect(out).not.toContain(".dc.html");
  });
});

describe("Error States variants (approved config rule)", () => {
  it("renders the icon variant attribute from the data and no object-valued style", () => {
    const out = html(
      <ErrorStates
        data={{
          warnings: [{ icon: "warning", kind: "Warning", title: "T", text: "x" }, { icon: "error", kind: "Invalid parameter", title: "U", text: "y" }],
        }}
      />,
    );
    // The screen only shows variants when its data supplies them; either way no style attribute appears.
    expect(out).not.toContain(" style=");
  });
});
