// Accessibility rules the stylesheet has to keep. These are static checks
// against the CSS source: contrast ratios computed from the tokens, and the
// presence of a focus style everywhere a hover style exists. jsdom cannot
// compute either for us — it does no cascade and no colour maths — but the
// stylesheet is the whole input, so reading it is enough.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const stylesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "styles",
);
const read = (f) => readFileSync(join(stylesDir, f), "utf8");
const tokens = read("tokens.css");
const base = read("base.css");
const components = read("components.css");
const all = tokens + base + components;

// ── colour maths ───────────────────────────────────────────────────────────

function luminance(hex) {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const chan = (i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Tokens declared in one `{ ... }` block, by selector. */
function themeTokens(selector) {
  const start = tokens.indexOf(selector);
  assert.notEqual(start, -1, `no ${selector} block in tokens.css`);
  const open = tokens.indexOf("{", start);
  let depth = 0;
  let i = open;
  for (; i < tokens.length; i++) {
    if (tokens[i] === "{") depth++;
    else if (tokens[i] === "}" && --depth === 0) break;
  }
  const body = tokens.slice(open, i);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim().replace(/\s+/g, " "),
    ]),
  );
}

const LIGHT = themeTokens(":root {");
const DARK = themeTokens('[data-theme="dark"]');

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3.0;

for (const [themeName, theme] of [
  ["light", LIGHT],
  ["dark", DARK],
]) {
  test(`a11y: ${themeName} focus ring is visible against adjacent colours`, () => {
    // WCAG 2.2 SC 2.4.11 Focus Appearance.
    for (const bg of ["--ui-surface", "--ui-background", "--ui-surface-muted"]) {
      const r = contrast(theme["--ui-focus-ring-color"], theme[bg]);
      assert.ok(
        r >= AA_NON_TEXT,
        `focus ring on ${bg} is ${r.toFixed(2)}:1, needs ${AA_NON_TEXT}:1 (${themeName})`,
      );
    }
  });
}

// ── focus coverage ─────────────────────────────────────────────────────────

test("a11y: nothing hoverable is left without a focus style", () => {
  const hoverable = new Set(
    [...all.matchAll(/\.((?:ui)-[\w-]+):hover\b/g)].map((m) => m[1]),
  );
  // Purely decorative surfaces a keyboard never lands on.
  const notFocusable = new Set(["ui-switch", "ui-tooltip"]);
  const focusable = new Set(
    [...all.matchAll(/\.((?:ui)-[\w-]+)[^,{]*:focus(?:-visible)?\b/g)].map(
      (m) => m[1],
    ),
  );
  // A variant inherits its base class's ring: .ui-btn-primary is styled by
  // .ui-btn:focus-visible, so covering the base covers the variants.
  const covered = (c) => {
    const parts = c.split("-");
    for (let i = parts.length; i >= 2; i--)
      if (focusable.has(parts.slice(0, i).join("-"))) return true;
    return false;
  };
  const missing = [...hoverable].filter(
    (c) => !covered(c) && !notFocusable.has(c),
  );
  assert.deepEqual(
    missing.sort(),
    [],
    `these have :hover and no :focus-visible: ${missing.join(", ")}`,
  );
});

test("a11y: focus styles keep an outline for forced-colors mode", () => {
  // `outline: none` plus a box-shadow leaves nothing at all in Windows High
  // Contrast, which drops shadows and repaints transparent outlines.
  const killsOutline = [
    ...all.matchAll(/:focus(?:-visible)?[^{]*\{[^}]*outline:\s*none/g),
  ];
  assert.equal(
    killsOutline.length,
    0,
    `outline: none inside a focus rule — use a transparent outline instead (${killsOutline.length} found)`,
  );
});

test("a11y: a forced-colors block exists and covers focus", () => {
  assert.match(components, /@media \(forced-colors: active\)/);
  const block = components.slice(components.indexOf("@media (forced-colors"));
  assert.match(block, /outline:\s*3px solid Highlight/);
});

test("a11y: the switch draws its ring on the track, since its input is invisible", () => {
  assert.match(components, /\.ui-switch input:focus-visible \+ \.ui-switch-track/);
  assert.match(components, /\.ui-switch input\s*\{[^}]*opacity:\s*0/);
});

test("a11y: reduced motion is still honoured", () => {
  assert.match(components, /@media \(prefers-reduced-motion: reduce\)/);
});
