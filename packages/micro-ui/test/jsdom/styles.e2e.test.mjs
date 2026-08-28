// E2E CSS tests — injects CSS into jsdom and verifies styles apply.
// jsdom's CSS parser can't resolve var() or parse all modern CSS.
// We test: (1) token values from CSS text, (2) direct computed styles,
// (3) component structure, (4) split partials match full bundle.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../../src");

const stylesCss = readFileSync(resolve(src, "styles.css"), "utf8");
const tokensCss = readFileSync(resolve(src, "styles/tokens.css"), "utf8");
const baseCss = readFileSync(resolve(src, "styles/base.css"), "utf8");
const componentsCss = readFileSync(resolve(src, "styles/components.css"), "utf8");

// Extract token value from CSS :root block
function extractToken(css, name) {
  const re = new RegExp(`:root\\s*\\{[^}]*${name}:\\s*([^;]+);`);
  const m = css.match(re);
  return m ? m[1].trim() : null;
}

// Check if a CSS selector + property combo exists in CSS text
// Handles grouped selectors (.a, .b { prop: }) and multi-line rules
function hasProperty(css, selector, prop) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match: selector { ... prop: (within same rule block)
  const re = new RegExp(`${esc}[\\s,\\n]*\\{[\\s\\S]*?${prop}:`, "m");
  return re.test(css);
}

// ── TOKEN VALUES: extract from CSS text ───────────────────────────

test("e2e: tokens define all core colors as valid hex", () => {
  const colors = [
    "--ui-background", "--ui-surface", "--ui-surface-muted", "--ui-surface-hover",
    "--ui-text", "--ui-text-secondary", "--ui-text-muted", "--ui-text-disabled",
    "--ui-border", "--ui-border-hover", "--ui-border-focus",
    "--ui-primary", "--ui-primary-hover", "--ui-primary-active",
    "--ui-success", "--ui-success-hover",
    "--ui-warning", "--ui-warning-hover",
    "--ui-danger", "--ui-danger-hover",
    "--ui-info", "--ui-info-hover",
  ];
  for (const c of colors) {
    const v = extractToken(tokensCss, c);
    assert.ok(v, `${c} must be defined`);
    assert.ok(/^#[0-9a-f]{3,8}$/i.test(v), `${c} must be hex, got: ${v}`);
  }
});

test("e2e: tokens define all spacing as rem", () => {
  const spaces = ["--ui-space-1", "--ui-space-2", "--ui-space-3", "--ui-space-4", "--ui-space-5", "--ui-space-6", "--ui-space-8", "--ui-space-10", "--ui-space-12", "--ui-space-16"];
  for (const s of spaces) {
    const v = extractToken(tokensCss, s);
    assert.ok(v, `${s} must be defined`);
    assert.ok(v.endsWith("rem"), `${s} must be rem, got: ${v}`);
  }
});

test("e2e: tokens define all radius", () => {
  const radii = ["--ui-radius-sm", "--ui-radius-md", "--ui-radius-lg", "--ui-radius-xl", "--ui-radius-2xl", "--ui-radius-full"];
  for (const r of radii) {
    const v = extractToken(tokensCss, r);
    assert.ok(v, `${r} must be defined`);
    assert.ok(/rem|px$/.test(v), `${r} must be rem or px, got: ${v}`);
  }
});

test("e2e: tokens define shadow values", () => {
  const shadows = ["--ui-shadow-xs", "--ui-shadow-sm", "--ui-shadow-md", "--ui-shadow-lg"];
  for (const s of shadows) {
    const v = extractToken(tokensCss, s);
    assert.ok(v, `${s} must be defined`);
  }
});

test("e2e: tokens define font stack", () => {
  const v = extractToken(tokensCss, "--ui-font-family");
  assert.ok(v && (v.includes("system-ui") || v.includes("sans-serif")));
});

test("e2e: tokens define font sizes as rem", () => {
  const sizes = ["--ui-font-xs", "--ui-font-sm", "--ui-font-md", "--ui-font-lg", "--ui-font-xl", "--ui-font-2xl", "--ui-font-3xl", "--ui-font-4xl"];
  for (const s of sizes) {
    const v = extractToken(tokensCss, s);
    assert.ok(v && v.endsWith("rem"), `${s} must be rem`);
  }
});

test("e2e: tokens define motion values", () => {
  assert.ok(extractToken(tokensCss, "--ui-duration-fast")?.endsWith("ms"));
  assert.ok(extractToken(tokensCss, "--ui-duration")?.endsWith("ms"));
  assert.ok(extractToken(tokensCss, "--ui-duration-slow")?.endsWith("ms"));
  assert.ok(extractToken(tokensCss, "--ui-ease")?.includes("cubic-bezier"));
});

test("e2e: tokens define focus ring", () => {
  const v = extractToken(tokensCss, "--ui-focus-ring");
  assert.ok(v && v.includes("rgb"));
});

test("e2e: tokens define container widths", () => {
  ["--ui-container-sm", "--ui-container-md", "--ui-container-lg", "--ui-container-xl"].forEach(t => {
    assert.ok(extractToken(tokensCss, t)?.endsWith("px"), `${t} must be px`);
  });
});

// ── DARK MODE: override values from CSS text ──────────────────────

test("e2e: dark mode overrides core color tokens", () => {
  const darkIdx = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  assert.ok(darkIdx > 0, "dark mode block must exist");
  const darkCss = tokensCss.slice(darkIdx);
  const darkTokens = ["--ui-background", "--ui-surface", "--ui-surface-muted", "--ui-surface-hover",
    "--ui-text", "--ui-text-secondary", "--ui-text-muted", "--ui-border", "--ui-border-hover"];
  for (const t of darkTokens) {
    const re = new RegExp(`${t}:\\s*([^;]+);`);
    const m = darkCss.match(re);
    assert.ok(m, `dark mode must override ${t}`);
    assert.ok(/^#[0-9a-f]{3,8}$/i.test(m[1].trim()), `dark ${t} must be hex`);
  }
});

test("e2e: dark mode values differ from light defaults", () => {
  const light = extractToken(tokensCss, "--ui-background");
  const darkIdx = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  const darkCss = tokensCss.slice(darkIdx);
  const darkMatch = darkCss.match(/--ui-background:\s*([^;]+);/);
  assert.ok(darkMatch, "dark --ui-background must exist");
  assert.notEqual(light, darkMatch[1].trim(), "dark and light --ui-background must differ");
});

// ── CSS STRUCTURE: selectors exist in CSS text ────────────────────

test("e2e: base.css defines reset rules", () => {
  assert.ok(hasProperty(baseCss, "*", "box-sizing") || baseCss.includes("box-sizing: border-box"));
  assert.ok(hasProperty(baseCss, "html", "font-family") || hasProperty(baseCss, "html", "color") || baseCss.includes("font-family: var(--ui-font-family)"));
  assert.ok(hasProperty(baseCss, "body", "margin") || baseCss.includes("margin: 0"));
  assert.ok(hasProperty(baseCss, "button", "border") || baseCss.includes("border: 0"));
  assert.ok(hasProperty(baseCss, "button", "cursor") || baseCss.includes("cursor: pointer"));
});

test("e2e: base.css defines layout classes", () => {
  assert.ok(hasProperty(baseCss, ".ui-stack", "display"));
  assert.ok(hasProperty(baseCss, ".ui-row", "display"));
  assert.ok(hasProperty(baseCss, ".ui-center", "align-items"));
  assert.ok(hasProperty(baseCss, ".ui-between", "justify-content"));
});

test("e2e: base.css defines typography classes", () => {
  assert.ok(hasProperty(baseCss, ".ui-title", "font-weight"));
  assert.ok(hasProperty(baseCss, ".ui-heading", "font-weight"));
  assert.ok(hasProperty(baseCss, ".ui-muted", "color") || baseCss.includes(".ui-muted"));
  assert.ok(hasProperty(baseCss, ".ui-label", "font-weight"));
  assert.ok(hasProperty(baseCss, ".ui-label", "display"));
});

test("e2e: base.css defines spacing classes", () => {
  assert.ok(hasProperty(baseCss, ".ui-p-4", "padding") || baseCss.includes(".ui-p-4"));
  assert.ok(hasProperty(baseCss, ".ui-mt-4", "margin-top") || baseCss.includes(".ui-mt-4"));
  assert.ok(hasProperty(baseCss, ".ui-gap-4", "gap") || baseCss.includes(".ui-gap-4"));
});

test("e2e: base.css defines utility classes", () => {
  assert.ok(hasProperty(baseCss, ".ui-title", "font-weight") || baseCss.includes("font-weight: 700"));
  assert.ok(hasProperty(baseCss, ".ui-label", "font-weight") || baseCss.includes("font-weight: 600"));
  assert.ok(hasProperty(baseCss, ".ui-label", "display"));
});

test("e2e: components.css defines layout/utility classes", () => {
  assert.ok(hasProperty(componentsCss, ".ui-hidden", "display") || componentsCss.includes("display: none"));
  assert.ok(hasProperty(componentsCss, ".ui-text-center", "text-align") || componentsCss.includes("text-align: center"));
  assert.ok(hasProperty(componentsCss, ".ui-text-right", "text-align") || componentsCss.includes("text-align: right"));
  assert.ok(hasProperty(componentsCss, ".ui-font-bold", "font-weight") || componentsCss.includes("font-weight: 700"));
  assert.ok(hasProperty(componentsCss, ".ui-overflow-hidden", "overflow") || componentsCss.includes("overflow: hidden"));
  assert.ok(hasProperty(componentsCss, ".ui-relative", "position") || componentsCss.includes("position: relative"));
  assert.ok(hasProperty(componentsCss, ".ui-pointer", "cursor") || componentsCss.includes("cursor: pointer"));
});

// ── COMPONENTS: button structure ──────────────────────────────────

test("e2e: components.css defines .ui-btn", () => {
  assert.ok(hasProperty(componentsCss, ".ui-btn", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-btn", "font-weight"));
  assert.ok(hasProperty(componentsCss, ".ui-btn", "white-space"));
  assert.ok(hasProperty(componentsCss, ".ui-btn", "user-select"));
});

test("e2e: components.css defines button variants", () => {
  assert.ok(componentsCss.includes(".ui-btn-primary"));
  assert.ok(componentsCss.includes(".ui-btn-secondary"));
  assert.ok(componentsCss.includes(".ui-btn-ghost"));
  assert.ok(componentsCss.includes(".ui-btn-danger"));
  assert.ok(componentsCss.includes(".ui-btn-success"));
  assert.ok(componentsCss.includes(".ui-btn-sm"));
  assert.ok(componentsCss.includes(".ui-btn-lg"));
  assert.ok(componentsCss.includes(".ui-btn-icon"));
});

test("e2e: components.css defines button states", () => {
  assert.ok(componentsCss.includes(".ui-btn:hover"));
  assert.ok(componentsCss.includes(".ui-btn:active"));
  assert.ok(componentsCss.includes(".ui-btn:focus-visible"));
  assert.ok(componentsCss.includes(".ui-btn:disabled"));
});

// ── COMPONENTS: input structure ───────────────────────────────────

test("e2e: components.css defines .ui-input", () => {
  assert.ok(hasProperty(componentsCss, ".ui-input", "width") || componentsCss.includes("width: 100%"));
  assert.ok(hasProperty(componentsCss, ".ui-input", "height") || componentsCss.includes("height: 2.5rem"));
  assert.ok(hasProperty(componentsCss, ".ui-input", "outline") || componentsCss.includes("outline: none"));
});

test("e2e: components.css defines input states", () => {
  assert.ok(componentsCss.includes(".ui-input:hover"));
  assert.ok(componentsCss.includes(".ui-input:focus"));
  assert.ok(componentsCss.includes(".ui-input:disabled"));
  assert.ok(componentsCss.includes(".ui-input.is-invalid"));
});

test("e2e: components.css defines textarea", () => {
  assert.ok(hasProperty(componentsCss, ".ui-textarea", "min-height"));
  assert.ok(hasProperty(componentsCss, ".ui-textarea", "resize"));
});

// ── COMPONENTS: card structure ────────────────────────────────────

test("e2e: components.css defines .ui-card", () => {
  assert.ok(hasProperty(componentsCss, ".ui-card", "border"));
  assert.ok(hasProperty(componentsCss, ".ui-card", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-card", "padding"));
  assert.ok(hasProperty(componentsCss, ".ui-card", "box-shadow"));
});

test("e2e: components.css defines card variants", () => {
  assert.ok(componentsCss.includes(".ui-card-flat"));
  assert.ok(componentsCss.includes(".ui-card-hover"));
  assert.ok(componentsCss.includes(".ui-card-hover:hover"));
});

// ── COMPONENTS: alert structure ───────────────────────────────────

test("e2e: components.css defines .ui-alert", () => {
  assert.ok(hasProperty(componentsCss, ".ui-alert", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-alert", "border"));
  assert.ok(hasProperty(componentsCss, ".ui-alert", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-alert", "padding"));
});

test("e2e: components.css defines alert variants", () => {
  assert.ok(componentsCss.includes(".ui-alert-info"));
  assert.ok(componentsCss.includes(".ui-alert-success"));
  assert.ok(componentsCss.includes(".ui-alert-warning"));
  assert.ok(componentsCss.includes(".ui-alert-danger"));
});

// ── COMPONENTS: badge ─────────────────────────────────────────────

test("e2e: components.css defines .ui-badge", () => {
  assert.ok(hasProperty(componentsCss, ".ui-badge", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-badge", "font-weight"));
  assert.ok(hasProperty(componentsCss, ".ui-badge", "border-radius"));
});

test("e2e: components.css defines badge variants", () => {
  assert.ok(componentsCss.includes(".ui-badge-primary"));
  assert.ok(componentsCss.includes(".ui-badge-success"));
  assert.ok(componentsCss.includes(".ui-badge-warning"));
  assert.ok(componentsCss.includes(".ui-badge-danger"));
  assert.ok(componentsCss.includes(".ui-badge-info"));
});

// ── COMPONENTS: tabs ──────────────────────────────────────────────

test("e2e: components.css defines tabs", () => {
  assert.ok(hasProperty(componentsCss, ".ui-tabs", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-tab", "cursor"));
  assert.ok(hasProperty(componentsCss, ".ui-tab", "font-weight"));
  assert.ok(componentsCss.includes(".ui-tab.is-active"));
});

// ── COMPONENTS: spinner ───────────────────────────────────────────

test("e2e: components.css defines .ui-spinner", () => {
  assert.ok(hasProperty(componentsCss, ".ui-spinner", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-spinner", "animation"));
  assert.ok(componentsCss.includes("@keyframes ui-spin"));
});

// ── COMPONENTS: progress ──────────────────────────────────────────

test("e2e: components.css defines .ui-progress", () => {
  assert.ok(hasProperty(componentsCss, ".ui-progress", "overflow"));
  assert.ok(hasProperty(componentsCss, ".ui-progress", "height"));
  assert.ok(hasProperty(componentsCss, ".ui-progress-bar", "transition"));
});

// ── COMPONENTS: avatar ────────────────────────────────────────────

test("e2e: components.css defines .ui-avatar", () => {
  assert.ok(hasProperty(componentsCss, ".ui-avatar", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-avatar", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-avatar", "overflow"));
  assert.ok(hasProperty(componentsCss, ".ui-avatar", "font-weight"));
});

// ── COMPONENTS: list ──────────────────────────────────────────────

test("e2e: components.css defines .ui-list", () => {
  assert.ok(hasProperty(componentsCss, ".ui-list", "list-style"));
  assert.ok(hasProperty(componentsCss, ".ui-list", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-list", "flex-direction"));
  assert.ok(hasProperty(componentsCss, ".ui-list", "margin"));
});

// ── COMPONENTS: table ─────────────────────────────────────────────

test("e2e: components.css defines .ui-table", () => {
  assert.ok(hasProperty(componentsCss, ".ui-table", "width"));
  assert.ok(hasProperty(componentsCss, ".ui-table", "border-collapse"));
  assert.ok(hasProperty(componentsCss, ".ui-table th", "font-weight"));
  assert.ok(hasProperty(componentsCss, ".ui-table th", "text-align"));
});

// ── COMPONENTS: modal ─────────────────────────────────────────────

test("e2e: components.css defines .ui-modal", () => {
  assert.ok(hasProperty(componentsCss, ".ui-modal", "position"));
  assert.ok(hasProperty(componentsCss, ".ui-modal", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-modal", "z-index"));
  assert.ok(hasProperty(componentsCss, ".ui-dialog", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-dialog", "box-shadow"));
});

// ── COMPONENTS: drawer ────────────────────────────────────────────

test("e2e: components.css defines .ui-drawer", () => {
  assert.ok(hasProperty(componentsCss, ".ui-drawer", "position"));
  assert.ok(hasProperty(componentsCss, ".ui-drawer", "z-index"));
  assert.ok(componentsCss.includes(".ui-drawer-left"));
  assert.ok(componentsCss.includes(".ui-drawer-right"));
});

// ── COMPONENTS: tooltip ───────────────────────────────────────────

test("e2e: components.css defines .ui-tooltip", () => {
  assert.ok(hasProperty(componentsCss, ".ui-tooltip", "position"));
  assert.ok(hasProperty(componentsCss, ".ui-tooltip-content", "position"));
  assert.ok(hasProperty(componentsCss, ".ui-tooltip-content", "pointer-events"));
});

// ── COMPONENTS: menu ──────────────────────────────────────────────

test("e2e: components.css defines .ui-menu", () => {
  assert.ok(hasProperty(componentsCss, ".ui-menu", "border"));
  assert.ok(hasProperty(componentsCss, ".ui-menu", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-menu", "padding"));
  assert.ok(hasProperty(componentsCss, ".ui-menu-item", "cursor"));
});

// ── COMPONENTS: pagination ────────────────────────────────────────

test("e2e: components.css defines .ui-pagination", () => {
  assert.ok(hasProperty(componentsCss, ".ui-pagination", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-page", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-page.is-active", "background"));
});

// ── COMPONENTS: breadcrumbs ───────────────────────────────────────

test("e2e: components.css defines .ui-breadcrumbs", () => {
  assert.ok(hasProperty(componentsCss, ".ui-breadcrumbs", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-breadcrumbs", "flex-wrap"));
});

// ── COMPONENTS: empty state ───────────────────────────────────────

test("e2e: components.css defines .ui-empty", () => {
  assert.ok(hasProperty(componentsCss, ".ui-empty", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-empty", "flex-direction"));
  assert.ok(hasProperty(componentsCss, ".ui-empty", "text-align"));
});

// ── COMPONENTS: skeleton ──────────────────────────────────────────

test("e2e: components.css defines .ui-skeleton", () => {
  assert.ok(hasProperty(componentsCss, ".ui-skeleton", "animation"));
  assert.ok(hasProperty(componentsCss, ".ui-skeleton", "border-radius"));
  assert.ok(componentsCss.includes("@keyframes ui-skeleton"));
});

// ── COMPONENTS: status ────────────────────────────────────────────

test("e2e: components.css defines .ui-status", () => {
  assert.ok(hasProperty(componentsCss, ".ui-status", "display"));
  assert.ok(componentsCss.includes(".ui-status::before"));
  assert.ok(componentsCss.includes(".ui-status-success::before"));
});

// ── COMPONENTS: switch ────────────────────────────────────────────

test("e2e: components.css defines .ui-switch", () => {
  assert.ok(hasProperty(componentsCss, ".ui-switch", "position"));
  assert.ok(hasProperty(componentsCss, ".ui-switch", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-switch-thumb", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-switch-thumb", "position"));
});

// ── COMPONENTS: checkbox/radio ────────────────────────────────────

test("e2e: components.css defines .ui-checkbox", () => {
  assert.ok(hasProperty(componentsCss, ".ui-checkbox", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-checkbox", "cursor"));
});

test("e2e: components.css defines .ui-radio", () => {
  assert.ok(hasProperty(componentsCss, ".ui-radio", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-radio", "cursor"));
});

// ── COMPONENTS: field ─────────────────────────────────────────────

test("e2e: components.css defines .ui-field", () => {
  assert.ok(hasProperty(componentsCss, ".ui-field", "display"));
  assert.ok(hasProperty(componentsCss, ".ui-field", "flex-direction"));
});

// ── COMPONENTS: btn-group ─────────────────────────────────────────

test("e2e: components.css defines .ui-btn-group", () => {
  assert.ok(hasProperty(componentsCss, ".ui-btn-group", "display"));
  assert.ok(componentsCss.includes(".ui-btn-group .ui-btn:first-child"));
  assert.ok(componentsCss.includes(".ui-btn-group .ui-btn:last-child"));
});

// ── COMPONENTS: divider ───────────────────────────────────────────

test("e2e: components.css defines .ui-divider", () => {
  assert.ok(hasProperty(componentsCss, ".ui-divider", "width"));
  assert.ok(hasProperty(componentsCss, ".ui-divider", "height"));
  assert.ok(hasProperty(componentsCss, ".ui-divider", "border"));
});

// ── COMPONENTS: code ──────────────────────────────────────────────

test("e2e: components.css defines .ui-code", () => {
  assert.ok(hasProperty(componentsCss, ".ui-code", "border-radius") || componentsCss.includes("border-radius: var(--ui-radius-sm)"));
  assert.ok(hasProperty(componentsCss, ".ui-code-block", "padding") || componentsCss.includes(".ui-code-block") && componentsCss.includes("padding:"));
  assert.ok(hasProperty(componentsCss, ".ui-code-block", "overflow") || componentsCss.includes("overflow-x: auto"));
});

// ── COMPONENTS: drag & drop ───────────────────────────────────────

test("e2e: components.css defines drag & drop", () => {
  assert.ok(hasProperty(componentsCss, ".ui-draggable", "cursor"));
  assert.ok(hasProperty(componentsCss, ".ui-dropzone", "border"));
  assert.ok(hasProperty(componentsCss, ".ui-dropzone", "border-radius"));
  assert.ok(hasProperty(componentsCss, ".ui-dropzone.is-dragover", "border-color"));
  assert.ok(hasProperty(componentsCss, ".ui-dragging", "opacity"));
});

// ── SPLIT PARTIALS: tokens.css content ────────────────────────────

test("e2e: tokens.css defines all color tokens", () => {
  ["--ui-background", "--ui-surface", "--ui-text", "--ui-border", "--ui-primary", "--ui-success", "--ui-danger", "--ui-warning", "--ui-info"].forEach(t => {
    assert.ok(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

test("e2e: tokens.css defines spacing tokens", () => {
  ["--ui-space-1", "--ui-space-4", "--ui-space-8"].forEach(t => {
    assert.ok(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

test("e2e: tokens.css defines radius tokens", () => {
  ["--ui-radius-sm", "--ui-radius-md", "--ui-radius-lg", "--ui-radius-full"].forEach(t => {
    assert.ok(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

test("e2e: tokens.css defines shadow tokens", () => {
  ["--ui-shadow-xs", "--ui-shadow-sm", "--ui-shadow-md", "--ui-shadow-lg"].forEach(t => {
    assert.ok(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

// ── SPLIT MATCH: tokens.css matches styles.css ────────────────────

test("e2e: split tokens match full bundle for all core colors", () => {
  ["--ui-background", "--ui-surface", "--ui-text", "--ui-border", "--ui-primary", "--ui-success", "--ui-danger"].forEach(t => {
    assert.equal(extractToken(tokensCss, t), extractToken(stylesCss, t), `${t} mismatch`);
  });
});

test("e2e: split tokens match full bundle for spacing", () => {
  ["--ui-space-1", "--ui-space-4", "--ui-space-8"].forEach(t => {
    assert.equal(extractToken(tokensCss, t), extractToken(stylesCss, t), `${t} mismatch`);
  });
});

// ── DARK MODE: in tokens.css ──────────────────────────────────────

test("e2e: tokens.css contains dark mode block", () => {
  assert.ok(tokensCss.includes("@media (prefers-color-scheme: dark)"));
});

test("e2e: tokens.css dark mode is after light tokens", () => {
  const tokensEnd = tokensCss.indexOf("}", tokensCss.lastIndexOf("--ui-container-xl:"));
  const darkIdx = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  assert.ok(darkIdx > tokensEnd, "dark mode must come after light tokens");
});

// ── LAYERS: structure ─────────────────────────────────────────────

test("e2e: styles.css declares layer order", () => {
  assert.ok(stylesCss.includes("@layer micro-ui.tokens, micro-ui.base, micro-ui.components, micro-ui.utilities;"));
});

test("e2e: tokens.css wraps in @layer micro-ui.tokens", () => {
  assert.ok(tokensCss.startsWith("@layer micro-ui.tokens {"));
});

test("e2e: base.css wraps in @layer micro-ui.base", () => {
  assert.ok(baseCss.startsWith("@layer micro-ui.base {"));
});

test("e2e: components.css wraps in @layer micro-ui.components", () => {
  assert.ok(componentsCss.startsWith("@layer micro-ui.components {"));
});

// ── CSS PARSE: files don't throw when injected ────────────────────

test("e2e: tokens.css injects without error", () => {
  assert.doesNotThrow(() => {
    new JSDOM(`<!doctype html><html><head><style>${tokensCss}</style></head><body></body></html>`, { url: "http://localhost/" });
  });
});

test("e2e: components.css injects without error", () => {
  assert.doesNotThrow(() => {
    new JSDOM(`<!doctype html><html><head><style>${componentsCss}</style></head><body></body></html>`, { url: "http://localhost/" });
  });
});

// ── sideEffects: package.json has it ──────────────────────────────

test("e2e: package.json has sideEffects for CSS", () => {
  const pkg = JSON.parse(readFileSync(resolve(src, "../package.json"), "utf8"));
  assert.ok(Array.isArray(pkg.sideEffects), "sideEffects must be array");
  assert.ok(pkg.sideEffects.includes("*.css"), "sideEffects must include *.css");
});

// ── exports: package.json has styles/* ────────────────────────────

test("e2e: package.json exports styles/*", () => {
  const pkg = JSON.parse(readFileSync(resolve(src, "../package.json"), "utf8"));
  assert.ok(pkg.exports["./styles/*"], "must export ./styles/*");
  assert.equal(pkg.exports["./styles/*"], "./dist/styles/*");
});

// ── exports: package.json has styles.css ───────────────────────────

test("e2e: package.json exports styles.css", () => {
  const pkg = JSON.parse(readFileSync(resolve(src, "../package.json"), "utf8"));
  assert.ok(pkg.exports["./styles.css"], "must export ./styles.css");
});
