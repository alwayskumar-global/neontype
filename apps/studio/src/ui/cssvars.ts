/**
 * Applies dynamic geometry through CSS custom properties (Requirement 11.2).
 * `el.style.setProperty` is CSSOM, which the strict CSP (`style-src 'self'`, no
 * `unsafe-inline`) allows; a `style` attribute or inline `<style>` is not. The
 * static rules that read the variables live in the bundled stylesheet.
 *
 * The parameter is a minimal structural type so tests can pass a fake element.
 */
export function setCssVars(
  el: { style: { setProperty(name: string, value: string): void } },
  vars: Record<string, string | number>,
): void {
  for (const [name, value] of Object.entries(vars)) {
    if (!name.startsWith("--")) throw new Error(`CSS custom property must start with "--": ${name}`);
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`CSS custom property ${name} must be finite`);
    }
    el.style.setProperty(name, String(value));
  }
}
