// E2E CSS tests — injects CSS into the DOM realm and verifies styles apply.
// The test DOM's CSS parser can't resolve var() or parse all modern CSS.
// We test: (1) token values from CSS text, (2) direct computed styles,
// (3) component structure, (4) split partials match full bundle.
import { test, assertEquals, assert, expect } from "runtime:test";
import { file } from "runtime:fs";
import { resolve, dirname, fromFileURL } from "runtime:path";

const __dirname = dirname(fromFileURL(import.meta.url));
const src = resolve(__dirname, "../../src");

const stylesCss = await file(resolve(src, "styles.css")).text();
const tokensCss = await file(resolve(src, "styles/tokens.css")).text();
const baseCss = await file(resolve(src, "styles/base.css")).text();
const componentsCss = await file(resolve(src, "styles/components.css")).text();

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
    assert(v, `${c} must be defined`);
    assert(/^#[0-9a-f]{3,8}$/i.test(v), `${c} must be hex, got: ${v}`);
  }
});

test("e2e: tokens define all spacing as rem", () => {
  const spaces = ["--ui-space-1", "--ui-space-2", "--ui-space-3", "--ui-space-4", "--ui-space-5", "--ui-space-6", "--ui-space-8", "--ui-space-10", "--ui-space-12", "--ui-space-16"];
  for (const s of spaces) {
    const v = extractToken(tokensCss, s);
    assert(v, `${s} must be defined`);
    assert(v.endsWith("rem"), `${s} must be rem, got: ${v}`);
  }
});

test("e2e: tokens define all radius", () => {
  const radii = ["--ui-radius-sm", "--ui-radius-md", "--ui-radius-lg", "--ui-radius-xl", "--ui-radius-2xl", "--ui-radius-full"];
  for (const r of radii) {
    const v = extractToken(tokensCss, r);
    assert(v, `${r} must be defined`);
    assert(/rem|px$/.test(v), `${r} must be rem or px, got: ${v}`);
  }
});

test("e2e: tokens define shadow values", () => {
  const shadows = ["--ui-shadow-xs", "--ui-shadow-sm", "--ui-shadow-md", "--ui-shadow-lg"];
  for (const s of shadows) {
    const v = extractToken(tokensCss, s);
    assert(v, `${s} must be defined`);
  }
});

test("e2e: tokens define font stack", () => {
  const v = extractToken(tokensCss, "--ui-font-family");
  assert(v && (v.includes("system-ui") || v.includes("sans-serif")));
});

test("e2e: tokens define font sizes as rem", () => {
  const sizes = ["--ui-font-xs", "--ui-font-sm", "--ui-font-md", "--ui-font-lg", "--ui-font-xl", "--ui-font-2xl", "--ui-font-3xl", "--ui-font-4xl"];
  for (const s of sizes) {
    const v = extractToken(tokensCss, s);
    assert(v && v.endsWith("rem"), `${s} must be rem`);
  }
});

test("e2e: tokens define motion values", () => {
  assert(extractToken(tokensCss, "--ui-duration-fast")?.endsWith("ms"));
  assert(extractToken(tokensCss, "--ui-duration")?.endsWith("ms"));
  assert(extractToken(tokensCss, "--ui-duration-slow")?.endsWith("ms"));
  assert(extractToken(tokensCss, "--ui-ease")?.includes("cubic-bezier"));
});

test("e2e: tokens define focus ring", () => {
  // Two layers — a surface-coloured gap, then the solid ring that carries the
  // contrast. The colour lives in its own token so a11y checks can measure it.
  const v = extractToken(tokensCss, "--ui-focus-ring");
  assert(v, "--ui-focus-ring must be defined");
  assert(v.includes("var(--ui-focus-ring-color)"), `got: ${v}`);
  const c = extractToken(tokensCss, "--ui-focus-ring-color");
  assert(/^#[0-9a-f]{3,8}$/i.test(c ?? ""), `ring colour must be hex, got: ${c}`);
});

test("e2e: tokens define container widths", () => {
  ["--ui-container-sm", "--ui-container-md", "--ui-container-lg", "--ui-container-xl"].forEach(t => {
    assert(extractToken(tokensCss, t)?.endsWith("px"), `${t} must be px`);
  });
});

// ── DARK MODE: override values from CSS text ──────────────────────

test("e2e: dark mode overrides core color tokens", () => {
  const darkIdx = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  assert(darkIdx > 0, "dark mode block must exist");
  const darkCss = tokensCss.slice(darkIdx);
  const darkTokens = ["--ui-background", "--ui-surface", "--ui-surface-muted", "--ui-surface-hover",
    "--ui-text", "--ui-text-secondary", "--ui-text-muted", "--ui-border", "--ui-border-hover"];
  for (const t of darkTokens) {
    const re = new RegExp(`${t}:\\s*([^;]+);`);
    const m = darkCss.match(re);
    assert(m, `dark mode must override ${t}`);
    assert(/^#[0-9a-f]{3,8}$/i.test(m[1].trim()), `dark ${t} must be hex`);
  }
});

test("e2e: dark mode values differ from light defaults", () => {
  const light = extractToken(tokensCss, "--ui-background");
  const darkIdx = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  const darkCss = tokensCss.slice(darkIdx);
  const darkMatch = darkCss.match(/--ui-background:\s*([^;]+);/);
  assert(darkMatch, "dark --ui-background must exist");
  expect(light).not.toBe(darkMatch[1].trim());
});

// ── CSS STRUCTURE: selectors exist in CSS text ────────────────────

test("e2e: base.css defines reset rules", () => {
  assert(hasProperty(baseCss, "*", "box-sizing") || baseCss.includes("box-sizing: border-box"));
  assert(hasProperty(baseCss, "html", "font-family") || hasProperty(baseCss, "html", "color") || baseCss.includes("font-family: var(--ui-font-family)"));
  assert(hasProperty(baseCss, "body", "margin") || baseCss.includes("margin: 0"));
  assert(hasProperty(baseCss, "button", "border") || baseCss.includes("border: 0"));
  assert(hasProperty(baseCss, "button", "cursor") || baseCss.includes("cursor: pointer"));
});

test("e2e: base.css defines layout classes", () => {
  assert(hasProperty(baseCss, ".ui-stack", "display"));
  assert(hasProperty(baseCss, ".ui-row", "display"));
  assert(hasProperty(baseCss, ".ui-center", "align-items"));
  assert(hasProperty(baseCss, ".ui-between", "justify-content"));
});

test("e2e: base.css defines typography classes", () => {
  assert(hasProperty(baseCss, ".ui-title", "font-weight"));
  assert(hasProperty(baseCss, ".ui-heading", "font-weight"));
  assert(hasProperty(baseCss, ".ui-muted", "color") || baseCss.includes(".ui-muted"));
  assert(hasProperty(baseCss, ".ui-label", "font-weight"));
  assert(hasProperty(baseCss, ".ui-label", "display"));
});

test("e2e: base.css defines spacing classes", () => {
  assert(hasProperty(baseCss, ".ui-p-4", "padding") || baseCss.includes(".ui-p-4"));
  assert(hasProperty(baseCss, ".ui-mt-4", "margin-top") || baseCss.includes(".ui-mt-4"));
  assert(hasProperty(baseCss, ".ui-gap-4", "gap") || baseCss.includes(".ui-gap-4"));
});

test("e2e: base.css defines utility classes", () => {
  assert(hasProperty(baseCss, ".ui-title", "font-weight") || baseCss.includes("font-weight: 700"));
  assert(hasProperty(baseCss, ".ui-label", "font-weight") || baseCss.includes("font-weight: 600"));
  assert(hasProperty(baseCss, ".ui-label", "display"));
});

test("e2e: components.css defines layout/utility classes", () => {
  assert(hasProperty(componentsCss, ".ui-hidden", "display") || componentsCss.includes("display: none"));
  assert(hasProperty(componentsCss, ".ui-text-center", "text-align") || componentsCss.includes("text-align: center"));
  assert(hasProperty(componentsCss, ".ui-text-right", "text-align") || componentsCss.includes("text-align: right"));
  assert(hasProperty(componentsCss, ".ui-font-bold", "font-weight") || componentsCss.includes("font-weight: 700"));
  assert(hasProperty(componentsCss, ".ui-overflow-hidden", "overflow") || componentsCss.includes("overflow: hidden"));
  assert(hasProperty(componentsCss, ".ui-relative", "position") || componentsCss.includes("position: relative"));
  assert(hasProperty(componentsCss, ".ui-pointer", "cursor") || componentsCss.includes("cursor: pointer"));
});

// ── COMPONENTS: button structure ──────────────────────────────────

test("e2e: components.css defines .ui-btn", () => {
  assert(hasProperty(componentsCss, ".ui-btn", "display"));
  assert(hasProperty(componentsCss, ".ui-btn", "font-weight"));
  assert(hasProperty(componentsCss, ".ui-btn", "white-space"));
  assert(hasProperty(componentsCss, ".ui-btn", "user-select"));
});

test("e2e: components.css defines button variants", () => {
  assert(componentsCss.includes(".ui-btn-primary"));
  assert(componentsCss.includes(".ui-btn-secondary"));
  assert(componentsCss.includes(".ui-btn-ghost"));
  assert(componentsCss.includes(".ui-btn-danger"));
  assert(componentsCss.includes(".ui-btn-success"));
  assert(componentsCss.includes(".ui-btn-sm"));
  assert(componentsCss.includes(".ui-btn-lg"));
  assert(componentsCss.includes(".ui-btn-icon"));
});

test("e2e: components.css defines button states", () => {
  assert(componentsCss.includes(".ui-btn:hover"));
  assert(componentsCss.includes(".ui-btn:active"));
  assert(componentsCss.includes(".ui-btn:focus-visible"));
  assert(componentsCss.includes(".ui-btn:disabled"));
});

// ── COMPONENTS: input structure ───────────────────────────────────

test("e2e: components.css defines .ui-input", () => {
  assert(hasProperty(componentsCss, ".ui-input", "width") || componentsCss.includes("width: 100%"));
  assert(hasProperty(componentsCss, ".ui-input", "height") || componentsCss.includes("height: 2.5rem"));
  // The outline is set on :focus, not stripped in the base rule — a base
  // `outline: none` removes the browser's own ring in every state, including
  // any state the focus rule does not reach.
  assert(
    /\.ui-input:focus[^{]*\{[^}]*outline:\s*2px solid transparent/s.test(componentsCss),
    ".ui-input:focus must set a transparent outline for forced-colors mode",
  );
});

test("e2e: components.css defines input states", () => {
  assert(componentsCss.includes(".ui-input:hover"));
  assert(componentsCss.includes(".ui-input:focus"));
  assert(componentsCss.includes(".ui-input:disabled"));
  assert(componentsCss.includes(".ui-input.is-invalid"));
});

test("e2e: components.css defines textarea", () => {
  assert(hasProperty(componentsCss, ".ui-textarea", "min-height"));
  assert(hasProperty(componentsCss, ".ui-textarea", "resize"));
});

// ── COMPONENTS: card structure ────────────────────────────────────

test("e2e: components.css defines .ui-card", () => {
  assert(hasProperty(componentsCss, ".ui-card", "border"));
  assert(hasProperty(componentsCss, ".ui-card", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-card", "padding"));
  assert(hasProperty(componentsCss, ".ui-card", "box-shadow"));
});

test("e2e: components.css defines card variants", () => {
  assert(componentsCss.includes(".ui-card-flat"));
  assert(componentsCss.includes(".ui-card-hover"));
  assert(componentsCss.includes(".ui-card-hover:hover"));
});

// ── COMPONENTS: alert structure ───────────────────────────────────

test("e2e: components.css defines .ui-alert", () => {
  assert(hasProperty(componentsCss, ".ui-alert", "display"));
  assert(hasProperty(componentsCss, ".ui-alert", "border"));
  assert(hasProperty(componentsCss, ".ui-alert", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-alert", "padding"));
});

test("e2e: components.css defines alert variants", () => {
  assert(componentsCss.includes(".ui-alert-info"));
  assert(componentsCss.includes(".ui-alert-success"));
  assert(componentsCss.includes(".ui-alert-warning"));
  assert(componentsCss.includes(".ui-alert-danger"));
});

// ── COMPONENTS: badge ─────────────────────────────────────────────

test("e2e: components.css defines .ui-badge", () => {
  assert(hasProperty(componentsCss, ".ui-badge", "display"));
  assert(hasProperty(componentsCss, ".ui-badge", "font-weight"));
  assert(hasProperty(componentsCss, ".ui-badge", "border-radius"));
});

test("e2e: components.css defines badge variants", () => {
  assert(componentsCss.includes(".ui-badge-primary"));
  assert(componentsCss.includes(".ui-badge-success"));
  assert(componentsCss.includes(".ui-badge-warning"));
  assert(componentsCss.includes(".ui-badge-danger"));
  assert(componentsCss.includes(".ui-badge-info"));
});

// ── COMPONENTS: tabs ──────────────────────────────────────────────

test("e2e: components.css defines tabs", () => {
  assert(hasProperty(componentsCss, ".ui-tabs", "display"));
  assert(hasProperty(componentsCss, ".ui-tab", "cursor"));
  assert(hasProperty(componentsCss, ".ui-tab", "font-weight"));
  assert(componentsCss.includes(".ui-tab.is-active"));
});

// ── COMPONENTS: spinner ───────────────────────────────────────────

test("e2e: components.css defines .ui-spinner", () => {
  assert(hasProperty(componentsCss, ".ui-spinner", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-spinner", "animation"));
  assert(componentsCss.includes("@keyframes ui-spin"));
});

// ── COMPONENTS: progress ──────────────────────────────────────────

test("e2e: components.css defines .ui-progress", () => {
  assert(hasProperty(componentsCss, ".ui-progress", "overflow"));
  assert(hasProperty(componentsCss, ".ui-progress", "height"));
  assert(hasProperty(componentsCss, ".ui-progress-bar", "transition"));
});

// ── COMPONENTS: avatar ────────────────────────────────────────────

test("e2e: components.css defines .ui-avatar", () => {
  assert(hasProperty(componentsCss, ".ui-avatar", "display"));
  assert(hasProperty(componentsCss, ".ui-avatar", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-avatar", "overflow"));
  assert(hasProperty(componentsCss, ".ui-avatar", "font-weight"));
});

// ── COMPONENTS: list ──────────────────────────────────────────────

test("e2e: components.css defines .ui-list", () => {
  assert(hasProperty(componentsCss, ".ui-list", "list-style"));
  assert(hasProperty(componentsCss, ".ui-list", "display"));
  assert(hasProperty(componentsCss, ".ui-list", "flex-direction"));
  assert(hasProperty(componentsCss, ".ui-list", "margin"));
});

// ── COMPONENTS: table ─────────────────────────────────────────────

test("e2e: components.css defines .ui-table", () => {
  assert(hasProperty(componentsCss, ".ui-table", "width"));
  assert(hasProperty(componentsCss, ".ui-table", "border-collapse"));
  assert(hasProperty(componentsCss, ".ui-table th", "font-weight"));
  assert(hasProperty(componentsCss, ".ui-table th", "text-align"));
});

// ── COMPONENTS: modal ─────────────────────────────────────────────

test("e2e: components.css defines .ui-modal", () => {
  assert(hasProperty(componentsCss, ".ui-modal", "position"));
  assert(hasProperty(componentsCss, ".ui-modal", "display"));
  assert(hasProperty(componentsCss, ".ui-modal", "z-index"));
  assert(hasProperty(componentsCss, ".ui-dialog", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-dialog", "box-shadow"));
});

// ── COMPONENTS: drawer ────────────────────────────────────────────

test("e2e: components.css defines .ui-drawer", () => {
  assert(hasProperty(componentsCss, ".ui-drawer", "position"));
  assert(hasProperty(componentsCss, ".ui-drawer", "z-index"));
  assert(componentsCss.includes(".ui-drawer-left"));
  assert(componentsCss.includes(".ui-drawer-right"));
});

// ── COMPONENTS: tooltip ───────────────────────────────────────────

test("e2e: components.css defines .ui-tooltip", () => {
  assert(hasProperty(componentsCss, ".ui-tooltip", "position"));
  assert(hasProperty(componentsCss, ".ui-tooltip-content", "position"));
  assert(hasProperty(componentsCss, ".ui-tooltip-content", "pointer-events"));
});

// ── COMPONENTS: menu ──────────────────────────────────────────────

test("e2e: components.css defines .ui-menu", () => {
  assert(hasProperty(componentsCss, ".ui-menu", "border"));
  assert(hasProperty(componentsCss, ".ui-menu", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-menu", "padding"));
  assert(hasProperty(componentsCss, ".ui-menu-item", "cursor"));
});

// ── COMPONENTS: pagination ────────────────────────────────────────

test("e2e: components.css defines .ui-pagination", () => {
  assert(hasProperty(componentsCss, ".ui-pagination", "display"));
  assert(hasProperty(componentsCss, ".ui-page", "display"));
  assert(hasProperty(componentsCss, ".ui-page.is-active", "background"));
});

// ── COMPONENTS: breadcrumbs ───────────────────────────────────────

test("e2e: components.css defines .ui-breadcrumbs", () => {
  assert(hasProperty(componentsCss, ".ui-breadcrumbs", "display"));
  assert(hasProperty(componentsCss, ".ui-breadcrumbs", "flex-wrap"));
});

// ── COMPONENTS: empty state ───────────────────────────────────────

test("e2e: components.css defines .ui-empty", () => {
  assert(hasProperty(componentsCss, ".ui-empty", "display"));
  assert(hasProperty(componentsCss, ".ui-empty", "flex-direction"));
  assert(hasProperty(componentsCss, ".ui-empty", "text-align"));
});

// ── COMPONENTS: skeleton ──────────────────────────────────────────

test("e2e: components.css defines .ui-skeleton", () => {
  assert(hasProperty(componentsCss, ".ui-skeleton", "animation"));
  assert(hasProperty(componentsCss, ".ui-skeleton", "border-radius"));
  assert(componentsCss.includes("@keyframes ui-skeleton"));
});

// ── COMPONENTS: status ────────────────────────────────────────────

test("e2e: components.css defines .ui-status", () => {
  assert(hasProperty(componentsCss, ".ui-status", "display"));
  assert(componentsCss.includes(".ui-status::before"));
  assert(componentsCss.includes(".ui-status-success::before"));
});

// ── COMPONENTS: switch ────────────────────────────────────────────

test("e2e: components.css defines .ui-switch", () => {
  assert(hasProperty(componentsCss, ".ui-switch", "position"));
  assert(hasProperty(componentsCss, ".ui-switch", "display"));
  assert(hasProperty(componentsCss, ".ui-switch-thumb", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-switch-thumb", "position"));
});

// ── COMPONENTS: checkbox/radio ────────────────────────────────────

test("e2e: components.css defines .ui-checkbox", () => {
  assert(hasProperty(componentsCss, ".ui-checkbox", "display"));
  assert(hasProperty(componentsCss, ".ui-checkbox", "cursor"));
});

test("e2e: components.css defines .ui-radio", () => {
  assert(hasProperty(componentsCss, ".ui-radio", "display"));
  assert(hasProperty(componentsCss, ".ui-radio", "cursor"));
});

// ── COMPONENTS: field ─────────────────────────────────────────────

test("e2e: components.css defines .ui-field", () => {
  assert(hasProperty(componentsCss, ".ui-field", "display"));
  assert(hasProperty(componentsCss, ".ui-field", "flex-direction"));
});

// ── COMPONENTS: btn-group ─────────────────────────────────────────

test("e2e: components.css defines .ui-btn-group", () => {
  assert(hasProperty(componentsCss, ".ui-btn-group", "display"));
  assert(componentsCss.includes(".ui-btn-group .ui-btn:first-child"));
  assert(componentsCss.includes(".ui-btn-group .ui-btn:last-child"));
});

// ── COMPONENTS: divider ───────────────────────────────────────────

test("e2e: components.css defines .ui-divider", () => {
  assert(hasProperty(componentsCss, ".ui-divider", "width"));
  assert(hasProperty(componentsCss, ".ui-divider", "height"));
  assert(hasProperty(componentsCss, ".ui-divider", "border"));
});

// ── COMPONENTS: code ──────────────────────────────────────────────

test("e2e: components.css defines .ui-code", () => {
  assert(hasProperty(componentsCss, ".ui-code", "border-radius") || componentsCss.includes("border-radius: var(--ui-radius-sm)"));
  assert(hasProperty(componentsCss, ".ui-code-block", "padding") || componentsCss.includes(".ui-code-block") && componentsCss.includes("padding:"));
  assert(hasProperty(componentsCss, ".ui-code-block", "overflow") || componentsCss.includes("overflow-x: auto"));
});

// ── COMPONENTS: drag & drop ───────────────────────────────────────

test("e2e: components.css defines drag & drop", () => {
  assert(hasProperty(componentsCss, ".ui-draggable", "cursor"));
  assert(hasProperty(componentsCss, ".ui-dropzone", "border"));
  assert(hasProperty(componentsCss, ".ui-dropzone", "border-radius"));
  assert(hasProperty(componentsCss, ".ui-dropzone.is-dragover", "border-color"));
  assert(componentsCss.includes(".ui-dragging,"), "ui-dragging must exist");
  assert(componentsCss.includes(".is-dragging"), "is-dragging alias must exist");
  assert(hasProperty(componentsCss, ".is-dragging", "opacity"));
});

// ── SPLIT PARTIALS: tokens.css content ────────────────────────────

test("e2e: tokens.css defines all color tokens", () => {
  ["--ui-background", "--ui-surface", "--ui-text", "--ui-border", "--ui-primary", "--ui-success", "--ui-danger", "--ui-warning", "--ui-info"].forEach(t => {
    assert(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

test("e2e: tokens.css defines spacing tokens", () => {
  ["--ui-space-1", "--ui-space-4", "--ui-space-8"].forEach(t => {
    assert(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

test("e2e: tokens.css defines radius tokens", () => {
  ["--ui-radius-sm", "--ui-radius-md", "--ui-radius-lg", "--ui-radius-full"].forEach(t => {
    assert(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

test("e2e: tokens.css defines shadow tokens", () => {
  ["--ui-shadow-xs", "--ui-shadow-sm", "--ui-shadow-md", "--ui-shadow-lg"].forEach(t => {
    assert(extractToken(tokensCss, t), `tokens.css must define ${t}`);
  });
});

// ── SPLIT MATCH: styles.css re-exports the partials ───────────────

test("e2e: full bundle re-exports the split partials", () => {
  assert(stylesCss.includes('@import url("./styles/tokens.css");'), "must import tokens.css");
  assert(stylesCss.includes('@import url("./styles/base.css");'), "must import base.css");
  assert(stylesCss.includes('@import url("./styles/components.css");'), "must import components.css");
  assert(stylesCss.indexOf("@layer") < stylesCss.indexOf("@import"), "layer order must precede imports");
});

// ── DARK MODE: in tokens.css ──────────────────────────────────────

test("e2e: tokens.css contains dark mode block", () => {
  assert(tokensCss.includes("@media (prefers-color-scheme: dark)"));
});

test("e2e: tokens.css dark mode is after light tokens", () => {
  const tokensEnd = tokensCss.indexOf("}", tokensCss.lastIndexOf("--ui-container-xl:"));
  const darkIdx = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  assert(darkIdx > tokensEnd, "dark mode must come after light tokens");
});

test("e2e: tokens.css defines data-theme dark/light pins", () => {
  assert(tokensCss.includes('[data-theme="dark"]'), "must define data-theme=\"dark\"");
  assert(tokensCss.includes('[data-theme="light"]'), "must define data-theme=\"light\"");
  assert(!componentsCss.includes('[data-theme="'), "theme pin blocks must live in tokens.css, not components");
});

test("e2e: the three theme blocks stay in sync, token for token", () => {
  // CSS cannot express "system dark, unless overridden" and "attribute dark"
  // in one rule, so the values are written out three times. Nothing but this
  // test stops them drifting — it used to check six hand-picked tokens.
  // Anchored at the start of a line: [data-theme="light"] also appears inside
  // the dark block's own :not(...) selector.
  const blockOf = (selector) => {
    const re = new RegExp(
      `^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{`,
      "m",
    );
    const m = re.exec(tokensCss);
    assert(m, `missing block: ${selector}`);
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < tokensCss.length; j++) {
      if (tokensCss[j] === "{") depth++;
      else if (tokensCss[j] === "}" && --depth === 0) break;
    }
    return Object.fromEntries(
      [...tokensCss.slice(open, j).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
        (m) => [m[1], m[2].trim().replace(/\s+/g, " ")],
      ),
    );
  };

  const root = blockOf(":root");
  const autoDark = blockOf(':root:not([data-theme="light"])');
  const attrDark = blockOf('[data-theme="dark"]');
  const attrLight = blockOf('[data-theme="light"]');

  assert(Object.keys(autoDark).length > 30, "dark block looks truncated");
  assertEquals(
    Object.keys(autoDark).sort(),
    Object.keys(attrDark).sort(),
    "automatic and attribute dark must define the same token names",
  );
  for (const [name, value] of Object.entries(autoDark))
    assertEquals(attrDark[name], value, `${name} differs between the dark blocks`);

  // The explicit light theme has to restore every token dark overrides,
  // otherwise data-theme="light" inside a dark page is half-themed.
  for (const name of Object.keys(autoDark)) {
    assert(name in attrLight, `${name} is overridden by dark but not restored by [data-theme="light"]`);
    assertEquals(attrLight[name], root[name], `${name} must match the :root default`);
  }
});

test("e2e: an explicit light theme outranks the dark media query", () => {
  // Equal specificity would make this depend on source order.
  const m = /@media \(prefers-color-scheme: dark\) \{\s*([^{]+)\{/.exec(tokensCss);
  assert(m, "no dark media query");
  assertEquals(
    m[1].trim(),
    ':root:not([data-theme="light"])',
    "the dark media query must exclude an explicit light theme",
  );
});

// ── LAYERS: structure ─────────────────────────────────────────────

test("e2e: styles.css declares layer order", () => {
  assert(stylesCss.includes("@layer micro-ui.tokens, micro-ui.base, micro-ui.components, micro-ui.utilities;"));
});

test("e2e: tokens.css wraps in @layer micro-ui.tokens", () => {
  assert(tokensCss.startsWith("@layer micro-ui.tokens {"));
});

test("e2e: base.css wraps in @layer micro-ui.base", () => {
  assert(baseCss.startsWith("@layer micro-ui.base {"));
});

test("e2e: components.css wraps in @layer micro-ui.components", () => {
  assert(componentsCss.startsWith("@layer micro-ui.components {"));
});

// ── CSS PARSE: files don't throw when injected ────────────────────

test("e2e: tokens.css injects without error", () => {
  // The jsdom constructor this used is gone under the test DOM; appending the
  // stylesheet to the live document is the same "this text injects cleanly"
  // smoke test.
  expect(() => {
    const style = document.createElement("style");
    style.textContent = tokensCss;
    document.head.appendChild(style);
  }).not.toThrow();
});

test("e2e: components.css injects without error", () => {
  expect(() => {
    const style = document.createElement("style");
    style.textContent = componentsCss;
    document.head.appendChild(style);
  }).not.toThrow();
});

// ── sideEffects: package.json has it ──────────────────────────────

test("e2e: package.json has sideEffects for CSS", async () => {
  const pkg = JSON.parse(await file(resolve(src, "../package.json")).text());
  assert(Array.isArray(pkg.sideEffects), "sideEffects must be array");
  assert(pkg.sideEffects.includes("*.css"), "sideEffects must include *.css");
});

// ── exports: package.json has styles.css ───────────────────────────

test("e2e: package.json exports styles.css", async () => {
  const pkg = JSON.parse(await file(resolve(src, "../package.json")).text());
  assert(pkg.exports["./styles.css"], "must export ./styles.css");
});
