import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import * as ds from "./index.js";
import { Button, Chip, CodeBlock, Icon, IconButton, NumberScrub, ProgressBar, SegmentedControl, Select, Slider, Toast, Toggle } from "./index.js";
import { DS_COMPONENTS } from "../../scripts/dc-convert-lib.mjs";

const html = (el: ReactElement): string => renderToStaticMarkup(el);

describe("the port surface (Requirement 18.3)", () => {
  it("exports exactly the 12 components the mockups use", () => {
    const exported = Object.keys(ds).filter((k) => typeof (ds as Record<string, unknown>)[k] === "function").sort();
    expect(exported).toEqual([...DS_COMPONENTS]);
    expect(exported).toHaveLength(12);
  });
});

describe("each component renders its ui-* root class", () => {
  const cases: [string, ReactElement, RegExp][] = [
    ["Button", <Button variant="primary" size="lg" icon="play">Go</Button>, /^<button type="button" class="ui-btn ui-btn--primary ui-btn--lg"/],
    ["Icon", <Icon name="play" />, /^<svg class="ui-icon"/],
    ["IconButton", <IconButton icon="plus" label="Add" />, /^<span class="ui-has-tip"><button type="button" aria-label="Add" class="ui-btn ui-btn--icon ui-btn--ghost"/],
    ["Chip", <Chip pressed onToggle={() => undefined}>Tag</Chip>, /^<button type="button" class="ui-chip" aria-pressed="true"/],
    ["CodeBlock", <CodeBlock code="<b>x</b>" />, /^<div class="ui-code">/],
    ["NumberScrub", <NumberScrub label="X" value={5} />, /^<div class="ui-field ui-num">/],
    ["ProgressBar", <ProgressBar value={40} label="Export" />, /^<div class="ui-progress">/],
    ["SegmentedControl", <SegmentedControl label="Mode" options={[{ value: "a", label: "A" }]} value="a" />, /^<div role="radiogroup" aria-label="Mode" class="ui-seg">/],
    ["Select", <Select label="Sort" options={["a", "b"]} value="a" />, /^<div class="ui-field ui-select">/],
    ["Slider", <Slider label="Amount" value={30} />, /^<div class="ui-slider">/],
    ["Toast", <Toast title="Saved" variant="success" />, /^<div class="ui-toast ui-toast--success" role="status">/],
    ["Toggle", <Toggle label="Loop" checked />, /^<button type="button" role="switch" aria-checked="true" class="ui-toggle">/],
  ];
  for (const [name, el, re] of cases) {
    it(`${name}`, () => {
      const out = html(el);
      expect(out).toMatch(re);
      // No style attribute is ever rendered (Requirement 11.2); dynamic values are set client-side via setCssVars.
      expect(out).not.toContain(" style=");
      expect(out).not.toContain("dangerouslySetInnerHTML");
    });
  }
});

describe("Icon", () => {
  it("is decorative without a label and an image with one", () => {
    expect(html(<Icon name="play" />)).toContain('aria-hidden="true"');
    const labelled = html(<Icon name="play" label="Play" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Play"');
    expect(labelled).not.toContain("aria-hidden");
  });
  it("renders shapes as SVG children and an unknown name as an empty svg", () => {
    expect(html(<Icon name="close" />)).toContain("<path");
    expect(html(<Icon name="copy" />)).toMatch(/<rect[^>]*rx="1.5"/);
    expect(html(<Icon name="clock" />)).toContain("<circle");
    expect(html(<Icon name="does-not-exist" />)).toMatch(/<svg[^>]*><\/svg>/);
  });
  it("forwards data-variant to its root", () => {
    expect(html(<Icon name="error" data-variant="error" />)).toContain('data-variant="error"');
  });
});

describe("accessible names and ARIA", () => {
  it("IconButton: aria-label, tooltip, shortcut, pressed", () => {
    const out = html(<IconButton icon="play" label="Play" shortcut="Space" pressed={false} />);
    expect(out).toContain('aria-label="Play"');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('role="tooltip"');
    expect(out).toContain("<kbd>Space</kbd>");
    const bare = html(<IconButton icon="play" label="Play" tooltip={false} />);
    expect(bare.startsWith("<button")).toBe(true);
    expect(bare).not.toContain("aria-pressed");
  });
  it("Chip: interactive shows the check icon; static can be removed with a named button", () => {
    expect(html(<Chip pressed>On</Chip>)).toContain("ui-chip__check");
    const stat = html(<Chip isStatic removable>Draft</Chip>);
    expect(stat.startsWith('<span class="ui-chip ui-chip--static"')).toBe(true);
    expect(stat).toContain('aria-label="Remove Draft"');
  });
  it("CodeBlock: focusable pre with a name; markup in the code is escaped, never injected", () => {
    const out = html(<CodeBlock code={'<script>alert(1)</script> <a href="x">'} label="Embed" />);
    expect(out).toContain('<pre tabindex="0" aria-label="Embed code">');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;");
    expect(out).toContain('class="t-tag"');
    expect(out).toContain('class="t-attr"');
  });
  it("NumberScrub: spinbutton with name, value, range; width becomes the ds-w class", () => {
    const out = html(<NumberScrub label="Size" value={12} min={0} max={100} precision={1} width="80px" unit="px" />);
    expect(out).toContain('role="spinbutton"');
    expect(out).toContain('aria-label="Size"');
    expect(out).toContain('aria-valuenow="12"');
    expect(out).toContain('aria-valuemin="0"');
    expect(out).toContain('aria-valuemax="100"');
    expect(out).toContain('value="12.0"');
    expect(out).toContain("ds-w");
    expect(html(<NumberScrub ariaLabel="Only aria" value={1} />)).toContain('aria-label="Only aria"');
  });
  it("ProgressBar: progressbar role, clamped value, indeterminate and paused texts", () => {
    expect(html(<ProgressBar value={150} label="L" />)).toContain('aria-valuenow="100"');
    const ind = html(<ProgressBar indeterminate label="L" />);
    expect(ind).toContain("ui-progress--indeterminate");
    expect(ind).toContain('aria-valuetext="Working"');
    expect(ind).not.toContain("aria-valuenow");
    expect(html(<ProgressBar value={30} status="paused" label="L" />)).toContain('aria-valuetext="Paused at 30%"');
    expect(html(<ProgressBar />)).toContain('aria-label="Progress"');
  });
  it("SegmentedControl: radios with aria-checked and a roving tabindex that survives a non-matching value", () => {
    const opts = [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }, { value: "c", label: "C" }];
    const checked = html(<SegmentedControl label="M" options={opts} value="c" />);
    expect(checked).toContain('role="radio" aria-checked="true" tabindex="0"');
    const none = html(<SegmentedControl label="M" options={opts} value="zzz" />);
    // The first enabled option stays reachable by keyboard (the bundle left every option at -1).
    expect(none.match(/tabindex="0"/g)).toHaveLength(1);
    expect(none.indexOf('tabindex="0"')).toBeLessThan(none.indexOf('tabindex="-1"'));
    const iconOnly = html(<SegmentedControl label="M" options={[{ value: "a", label: "Alpha", icon: "play", iconOnly: true }]} value="a" />);
    expect(iconOnly).toContain('aria-label="Alpha"');
  });
  it("Select: a labelled native select; string and object options; error state", () => {
    const out = html(<Select label="Sort" options={["x", { value: "y", label: "Why", disabled: true }]} value="x" error />);
    expect(out).toContain('aria-label="Sort"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("is-error");
    expect(out).toContain('<option value="x" selected="">x</option>');
    expect(out).toContain('disabled=""');
    expect(out).toContain("Why");
  });
  it("Slider: labelled range with aria-valuetext from format; output hidden from AT", () => {
    const out = html(<Slider label="Amount" value={25} min={0} max={50} format={(n) => `${n} px`} />);
    expect(out).toContain('type="range"');
    expect(out).toContain('aria-label="Amount"');
    expect(out).toContain('aria-valuetext="25 px"');
    expect(out).toContain('<output class="ui-slider__value" aria-hidden="true">25 px</output>');
    expect(html(<Slider label="A" value={5} min={5} max={5} />)).toContain("ui-slider"); // max === min does not divide by zero
  });
  it("Toast: error is an alert, others a status; dismiss and action are named", () => {
    expect(html(<Toast variant="error" title="Failed" />)).toContain('role="alert"');
    const t = html(<Toast variant="info" title="FYI" onClose={() => undefined} action={{ label: "Undo" }}>Body</Toast>);
    expect(t).toContain('role="status"');
    expect(t).toContain('aria-label="Dismiss notification"');
    expect(t).toContain("Undo");
    expect(t).toContain("ui-toast__text");
  });
  it("Toggle: a switch with its label, state text only when asked", () => {
    const on = html(<Toggle label="Loop" checked showState />);
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain(">On<");
    expect(html(<Toggle label="Loop" checked={false} showState />)).toContain(">Off<");
    expect(html(<Toggle label="Loop" checked={false} />)).not.toContain("ui-toggle__state");
  });
  it("Button: variant, size and state classes; an icon after the label", () => {
    const out = html(<Button variant="danger" size="sm" state="hover" iconRight="chevron-right">Delete</Button>);
    expect(out).toContain("ui-btn--danger");
    expect(out).toContain("ui-btn--sm");
    expect(out).toContain("is-hover");
    expect(out.indexOf("Delete")).toBeLessThan(out.indexOf("<svg"));
  });
});
