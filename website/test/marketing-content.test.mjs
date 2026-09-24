import { test, expect } from "runtime:test";
import { file } from "runtime:fs";
import { dirname, resolve, fromFileURL } from "runtime:path";

const siteRoot = resolve(dirname(fromFileURL(import.meta.url)), "..");
const read = (path) => file(resolve(siteRoot, path)).text();

test("the marketing homepage presents Micro-UI and the live app", async () => {
  const page = await read("app/page.jsx");
  const showcase = await read("app/components/MicroUiShowcase.jsx");
  const styles = await read("app/global.css");

  expect(page).toContain("MicroAppsGallery");
  expect(page).toContain("Build micro apps that feel");
  expect(page).toContain("a small functional runtime");
  expect(page).not.toContain("a tiny functional runtime");
  expect(showcase).toContain('const MICRO_UI_CDN = "https://esm.sh/@opentf/micro-ui?min";');
  expect(showcase).toContain("await import(MICRO_UI_CDN)");
  expect(showcase).toContain("x-micro-ui-kanban");
  expect(showcase).toContain("x-micro-ui-canvas-pad");
  expect(showcase).toContain("x-micro-ui-gradient-mixer");
  expect(showcase).toContain("x-micro-ui-gravity-lab");
  expect(showcase).toContain("x-micro-ui-hero-preview");
  expect(showcase).not.toContain("x-micro-ui-focus-timer");
  expect(showcase).not.toContain("x-micro-ui-motion-lab");
  expect(showcase).toContain("hero-mini-app");
  expect(showcase).toContain("Kanban");
  expect(showcase).toContain("kanban-cols");
  expect(showcase).toContain("moveCard");
  expect(showcase).toContain("01 / Kanban");
  expect(showcase).toContain("Micro-UI micro-app · live preview");
  expect(showcase).toContain("toggleTask");
  expect(showcase).toContain("Sketchpad");
  expect(showcase).toContain("Gradient mixer");
  expect(showcase).toContain("brushSize");
  expect(showcase).toContain("key=${card.id}");
  expect(showcase).toContain("Gravity lab");
  expect(showcase).toContain("gravity-canvas");
  expect(showcase).toContain("stepWorld");
  expect(showcase).toContain("Poll board");
  expect(showcase).toContain("poll-track");
  expect(showcase).toContain("castVote");
  expect(showcase).toContain("05 / Poll board");
  expect(showcase).toContain("os-window");
  expect(showcase).toContain("os-window-title");
  expect(showcase).toContain("04 / Gravity lab");
  expect(showcase).not.toContain("Easing lab");
  expect(showcase).not.toContain("Focus timer");
  expect(page).toContain("Five small apps");
  expect(styles).toContain(".os-window-bar");
  expect(styles).toContain(".micro-app-card--physics");
  expect(styles).toContain(".micro-app-card--poll");
  expect(styles).toContain(".micro-app-card--kanban");
  expect(styles).not.toContain(".motion-speed");
  expect(styles).not.toContain(".timer-face");
});

test("the homepage links to dedicated docs and does not show the old source CTA", async () => {
  const page = await read("app/page.jsx");
  const layout = await read("app/layout.jsx");
  const docs = await read("app/docs/page.mdx");
  const installation = await read("app/docs/getting-started/installation/page.mdx");
  const installationTabs = await read("app/components/InstallationTabs.jsx");
  const docsMeta = await read("app/docs/_meta.js");
  const docsLayout = await read("app/docs/layout.jsx");
  const styles = await read("app/global.css");
  const index = await read("index.html");
  const config = await read("otfw.config.js");

  expect(page).toContain('href="/docs"');
  expect(page).toContain("> Alpha</div>");
  expect(page).not.toContain("Open Tech Foundation</div>");
  expect(page).not.toContain("Read the source");
  expect(page).not.toContain("Start with one file");
  expect(page).not.toContain("Make the first version real.");
  expect(layout).toContain('from "@opentf/web-docs"');
  expect(layout).toContain("<Navbar config={config.docs}");
  expect(docs).toContain("## Features");
  expect(installation).toContain("@opentf/micro-ui");
  expect(installation).toContain('import InstallationTabs from "../../../components/InstallationTabs.jsx";');
  expect(installation).toContain("<InstallationTabs />");
  expect(installationTabs).toContain('import { CodeBlock, Tabs } from "@opentf/web-docs";');
  expect(installationTabs).toContain('label: "pnpm"');
  expect(installationTabs).toContain('label: "npm"');
  expect(installationTabs).toContain('label: "yarn"');
  expect(installationTabs).toContain('label: "bun"');
  expect(installationTabs).toContain('code="pnpm add @opentf/micro-ui"');
  expect(docsMeta).toContain('"getting-started": "Getting started"');
  expect(docsLayout).toContain('from "@opentf/web-docs"');
  expect(docsLayout).toContain("<DocsLayout");
  expect(styles).toContain("position: fixed !important");
  expect(styles).toContain("padding-top: var(--otfw-navbar-height)");
  expect(styles).toContain(".site-shell { min-height: 100vh; overflow: clip; }");
  expect(styles).not.toContain(".site-shell { min-height: 100vh; overflow: hidden; }");
  expect(styles).toContain('@import "@opentf/web-docs/theme"');
  expect(styles).toContain('[data-theme="dark"]');
  expect(styles).toContain("micro-app-card--canvas");
  expect(index).toContain('localStorage.getItem("theme")');
  expect(config).not.toContain('label: "Live Apps"');
  expect(config).not.toContain('logo: "/favicon.svg"');
  expect(layout).toContain('src="/otf-logo.svg"');
  expect(layout).toContain("© Open Tech Foundation");
  expect(layout).toContain("Built with");
  expect(layout).toContain("site-footer-badge-mark");
  expect(layout).not.toContain("Last updated on September 9, 2026");
  expect(config).toContain('from "@opentf/web-docs/config"');
});

test("the standalone website uses the OTF Web toolchain", async () => {
  const pkg = JSON.parse(await read("package.json"));
  expect(pkg.dependencies["@opentf/web"]).toBe("latest");
  expect(pkg.dependencies["@opentf/web-docs"]).toBe("latest");
  expect(pkg.devDependencies["@opentf/web-cli"]).toBe("latest");
  expect(pkg.dependencies["@opentf/micro-ui"]).toBe(undefined);
  expect(pkg.scripts.build).toBe("otfw build --ssg");
  expect(pkg.scripts.dev).toBe(undefined);
  expect(pkg.scripts.test).toBe(undefined);
  expect(pkg.scripts["test:e2e"]).toBe(undefined);
  expect(pkg.scripts["build:ssg"]).toBe(undefined);
});

test("the public shell declares its favicon", async () => {
  const index = await read("index.html");
  const favicon = await read("public/favicon.svg");

  expect(index).toContain('href="/favicon.svg"');
  expect(favicon).toContain("Open Tech Foundation logo");
  expect(favicon).toContain("rgb(255,133,27)");
});
