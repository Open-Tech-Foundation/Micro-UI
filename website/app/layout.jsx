import { Navbar } from "@opentf/web-docs";
import config from "../otfw.config.js";

export const metadata = {
  titleTemplate: "%s — Micro-UI",
  description:
    "A small, fault-tolerant UI runtime for AI-generated micro-apps.",
  openGraph: {
    siteName: "Micro-UI",
    type: "website",
  },
};

export default function WebsiteLayout({ children }) {
  return (
    <div className="site-shell">
      <Navbar config={config.docs} />

      <main>{children}</main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-org">
            <a className="site-footer-org-link" href="https://opentechf.org/" target="_blank" rel="noreferrer">
              <img src="/otf-logo.svg" alt="" width="24" height="24" />
              <span>© Open Tech Foundation</span>
            </a>
            <span className="site-footer-license">— MIT</span>
          </div>
          <a className="site-footer-badge" href="https://web.opentechf.org/" target="_blank" rel="noreferrer" aria-label="Built with OTF Web">
            <svg className="site-footer-badge-mark" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <rect width="22" height="22" rx="6" fill="rgba(255,133,27,.12)" />
              <path d="M6.5 6.5h3.75v9H6.5v-9zm5.25 0H15.5v9h-3.75v-9z" fill="none" stroke="#ff851b" strokeWidth="1.35" strokeLinejoin="round" />
              <path d="M10.25 6.5v9M6.5 9.25h3.75M11.75 9.25H15.5M6.5 12h3.75M11.75 12H15.5" fill="none" stroke="#ff851b" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
            </svg>
            <span className="site-footer-badge-copy">
              <span className="site-footer-badge-muted">Built with</span>
              <span className="site-footer-badge-brand"><span>OTF</span> Web</span>
            </span>
          </a>
        </div>
      </footer>
    </div>
  );
}
