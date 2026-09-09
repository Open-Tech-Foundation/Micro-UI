import { defineDocsConfig } from "@opentf/web-docs/config";

export default defineDocsConfig({
  site: {
    url: "https://micro-ui.opentechf.org",
  },
  docs: {
    title: "Micro-UI",
    version: "v0.11.0",
    github: "https://github.com/Open-Tech-Foundation/Micro-UI",
    nav: [
      { label: "Home", href: "/" },
      { label: "Docs", href: "/docs" },
    ],
  },
});
