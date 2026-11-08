/**
 * Landing page (first screen). Rebuilt from design/Landing Page.dc.html as a
 * visual/copy reference only — no markup/styles/scripts copied, design/ not
 * linked/served/bundled. Class-based CSS (landing.css) over tokens.css; strict
 * CSP (no inline styles/scripts). Copy claims ONLY what the app does.
 */
import { useEffect } from "react";

import { PRODUCT_NAME } from "../shell/product.js";
import { LoopingPreview } from "./LoopingPreview.js";
import { demoProject, galleryProject } from "../model/demo.js";
import "./landing.css";

const GALLERY = [
  { id: "fade-slide" as const, text: "Fade" },
  { id: "kinetic-pop" as const, text: "Pop" },
  { id: "typewriter" as const, text: "Type" },
];

export function Landing({ onOpenStudio }: { onOpenStudio: (demo: boolean) => void }) {
  useEffect(() => {
    document.title = `${PRODUCT_NAME} - animated titles in your browser`;
  }, []);

  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Primary">
        <span className="brand">{PRODUCT_NAME}</span>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#exports">Exports</a>
          <a href="#examples">Examples</a>
          <a href="#privacy">Privacy</a>
        </div>
        <button type="button" className="cta" onClick={() => onOpenStudio(true)}>Open the studio</button>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <h1>Animated titles, made in your browser.</h1>
          <p className="subcopy">
            Type your text, pick from 12 preset effects, tune the layers, and export
            an MP4, PNG sequence, or GIF. Everything runs locally - nothing is uploaded.
          </p>
          <div className="hero-actions">
            <button type="button" className="cta" onClick={() => onOpenStudio(true)}>Open the studio</button>
            <button type="button" className="cta-secondary" onClick={() => onOpenStudio(false)}>Start blank</button>
            <a className="link" href="#examples">See examples</a>
          </div>
        </div>
        <div className="hero-preview">
          <LoopingPreview project={demoProject()} className="preview-16x9" label="Demo animation preview" />
        </div>
      </header>

      <section id="how" className="section" aria-labelledby="how-title">
        <h2 id="how-title">Type, animate, export</h2>
        <ol className="steps">
          <li><h3>Type</h3><p>Add text layers and set each layer's font, size, weight, colour, alignment, and position.</p></li>
          <li><h3>Animate</h3><p>Apply any of the 12 preset effects per layer and adjust their parameters live on the canvas.</p></li>
          <li><h3>Export</h3><p>Render an MP4, a PNG sequence, or a GIF - entirely in the browser.</p></li>
        </ol>
      </section>

      <section id="exports" className="section" aria-labelledby="exports-title">
        <h2 id="exports-title">Export for where it's going</h2>
        <div className="cards">
          <article className="card"><h3>MP4</h3><p>H.264 video for social and the web.</p></article>
          <article className="card"><h3>PNG sequence</h3><p>A ZIP of numbered PNG frames for editing tools.</p></article>
          <article className="card"><h3>GIF</h3><p>A looping animated GIF with up to 256 colours.</p></article>
        </div>
      </section>

      <section id="examples" className="section" aria-labelledby="examples-title">
        <h2 id="examples-title">Made with the built-in effects</h2>
        <div className="gallery">
          {GALLERY.map((g) => (
            <LoopingPreview key={g.id} project={galleryProject(g.id, g.text)} className="preview-tile" label={`${g.id} example`} />
          ))}
        </div>
      </section>

      <section id="privacy" className="section" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Runs entirely in your browser. Nothing is uploaded.</h2>
        <p className="subcopy">
          There is no account and no server. Your project never leaves your device -
          rendering and export happen locally. Latin and Tamil fonts are bundled and
          self-hosted. You can save your project to a JSON file and open it again later.
        </p>
      </section>

      <footer className="landing-footer">
        <span>{PRODUCT_NAME}</span>
        <span>Built with Kiro</span>
        <a className="link" href="https://github.com/alwayskumar-global/neontype">GitHub repo</a>
      </footer>
    </div>
  );
}
