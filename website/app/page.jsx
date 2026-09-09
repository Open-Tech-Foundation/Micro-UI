import MicroUiShowcase from "./components/MicroUiShowcase.jsx";

export const metadata = {
  title: { absolute: "Micro-UI — Small apps, shipped fast" },
  description:
    "A tiny, functional UI runtime for AI-generated micro-apps that stay close to the DOM.",
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
          <div className="eyebrow"><span className="eyebrow-dot" /> Open Tech Foundation</div>
          <h1>Build small apps that feel <em>surprisingly complete.</em></h1>
          <p className="hero-lede">
            Micro-UI is a tiny functional runtime for interactive tools, prototypes, and AI-generated apps — with the DOM kept close and the API kept clear.
          </p>
          <div className="hero-actions">
            <a className="button button--primary" href="#demo">Try the live app <span>↓</span></a>
            <a className="button button--quiet" href="https://github.com/Open-Tech-Foundation/Micro-UI" target="_blank" rel="noreferrer">Read the source <span>↗</span></a>
          </div>
          <div className="hero-note"><span>⌘</span> No build step required for the core</div>
        </div>
        <div className="hero-art" aria-label="Micro-UI runtime illustration">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="orbit orbit--three" />
          <div className="hero-orb"><span>μ</span></div>
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
            <div className="eyebrow">The useful middle</div>
            <h2>Not a toy. Not a platform.</h2>
          </div>
          <p>Here is a complete little interaction built with Micro-UI: local state, keyed rows, filtering, form handling, and updates that stay explicit.</p>
        </div>
        <div className="demo-layout">
          <MicroUiShowcase />
          <div className="demo-explanation">
            <span className="line-label">01 / Micro-app pattern</span>
            <h3>Keep the moving parts visible.</h3>
            <p>The demo is a native custom element. Its state is ordinary JavaScript, its view is a tagged template, and its updates happen where the event occurs.</p>
            <div className="code-block" aria-label="Micro-UI code example">
              <code><span className="syntax-purple">define</span>(<span className="syntax-green">&quot;x-build-queue&quot;</span>, (el) =&gt; {'{'}<br />&nbsp;&nbsp;<span className="syntax-purple">return</span> () =&gt; <span className="syntax-purple">html</span><span className="syntax-green">&#96;&lt;ul&gt;...&#96;</span>;<br />{'}'});</code>
            </div>
            <a className="text-link" href="https://github.com/Open-Tech-Foundation/Micro-UI#quick-start" target="_blank" rel="noreferrer">See the quick start <span>→</span></a>
          </div>
        </div>
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

      <section className="section wrap start-section" id="start">
        <div className="start-card">
          <div>
            <div className="eyebrow">Start with one file</div>
            <h2>Make the first version real.</h2>
            <p>Install Micro-UI, define a custom element, and ship an interaction before the architecture meeting starts.</p>
          </div>
          <div className="install-block">
            <span className="install-prompt">$</span>
            <code>npm i @opentf/micro-ui</code>
            <button type="button" aria-label="Copy install command" onclick={() => navigator.clipboard?.writeText("npm i @opentf/micro-ui")}>Copy</button>
          </div>
        </div>
      </section>
    </>
  );
}
