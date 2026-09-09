import { Navbar } from "@opentf/web-docs";
import config from "../otfw.config.js";

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
      <Navbar config={config.docs} />

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
