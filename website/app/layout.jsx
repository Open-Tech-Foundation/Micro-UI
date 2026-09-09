export const metadata = {
  titleTemplate: "%s — Micro-UI",
  description:
    "A tiny, fault-tolerant UI runtime for AI-generated micro-apps.",
  openGraph: {
    siteName: "Micro-UI",
    type: "website",
  },
};

export default function WebsiteLayout({ children }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Micro-UI home">
          <span className="brand-mark" aria-hidden="true">
            μ
          </span>
          <span>Micro-UI</span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#why">Why Micro-UI</a>
          <a href="#demo">Live demo</a>
          <a href="https://github.com/Open-Tech-Foundation/Micro-UI" target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
        <a className="header-cta" href="#start">
          Get started <span aria-hidden="true">→</span>
        </a>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div>
          <div className="brand brand--footer">
            <span className="brand-mark" aria-hidden="true">
              μ
            </span>
            <span>Micro-UI</span>
          </div>
          <p>Small runtime. Serious interactions.</p>
        </div>
        <div className="footer-links">
          <a href="https://opentechf.org/" target="_blank" rel="noreferrer">
            Open Tech Foundation ↗
          </a>
          <a href="https://github.com/Open-Tech-Foundation/Micro-UI" target="_blank" rel="noreferrer">
            Source code ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
