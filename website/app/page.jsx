import MicroAppsGallery from "./components/MicroUiShowcase.jsx";

export const metadata = {
  title: { absolute: "Micro-UI — Small apps, shipped fast" },
  description:
    "A small, functional UI runtime for AI-generated micro-apps that stay close to the DOM.",
  canonical: "/",
};

const features = [
  {
    number: "01",
    title: "Small enough to hold in your head",
    text: "A focused API built around templates, custom elements, and explicit updates. No compiler ceremony required.",
  },
  {
    number: "02",
    title: "Stable when lists get real",
    text: "Keyed reconciliation keeps input values, focus, and component identity intact while rows move, change, and disappear.",
  },
  {
    number: "03",
    title: "A safe place for generated UI",
    text: "Interpolated content is text by default, errors stay local, and the browser remains the platform your app can trust.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Alpha</div>
          <h1>Build micro apps that feel <em>surprisingly complete.</em></h1>
          <p className="hero-lede">
            Micro-UI is a small functional runtime for interactive tools, prototypes, and AI-generated apps — with the DOM kept close and the API kept clear.
          </p>
          <div className="hero-actions">
            <a className="button button--primary" href="#demo">Try the live app <span>↓</span></a>
            <a className="button button--quiet" href="/docs">Read the docs <span>→</span></a>
          </div>
          <div className="hero-note"><span>⌘</span> No build step required for the core</div>
        </div>
        <div className="hero-art" role="img" aria-label="Micro-UI build queue micro-app preview">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="orbit orbit--three" />
          <x-micro-ui-hero-preview />
          <div className="code-chip code-chip--top">html<span>`...`</span></div>
          <div className="code-chip code-chip--right">update<span>(el)</span></div>
          <div className="code-chip code-chip--bottom">define<span>(tag)</span></div>
        </div>
      </section>

      <section className="proof-strip">
        <div className="wrap proof-grid">
          <div><strong>7.1 KB</strong><span>core, gzipped</span></div>
          <div><strong>0</strong><span>dependencies</span></div>
          <div><strong>native</strong><span>custom elements</span></div>
          <div><strong>safe</strong><span>text interpolation</span></div>
        </div>
      </section>

      <section className="section wrap" id="demo">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Six small apps</div>
            <h2>One library. Many useful shapes.</h2>
          </div>
          <p>These are real Micro-UI custom elements living inside this OTF Web site. Try each one to see how a small runtime can handle very different product surfaces.</p>
        </div>
        <MicroAppsGallery />
      </section>

      <section className="section section--muted" id="why">
        <div className="wrap">
          <div className="section-heading section-heading--center">
            <div>
              <div className="eyebrow">Designed for momentum</div>
              <h2>Everything you need.<br /><em>Nothing you need to fight.</em></h2>
            </div>
            <p>Micro-UI gives small teams and coding agents a direct path from an idea to a working interface.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
