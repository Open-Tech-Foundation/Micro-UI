// Accessibility rules the stylesheet has to keep. These are static checks
// against the CSS source: contrast ratios computed from the tokens, and the
// presence of a focus style everywhere a hover style exists. The DOM realm
// computes neither for us — it does no cascade and no colour maths — but the
// stylesheet is the whole input, so reading it is enough.
import { test, assertEquals, assert, expect } from "runtime:test";
import { file } from "runtime:fs";
import { dirname, join, resolve, fromFileURL } from "runtime:path";

const stylesDir = join(
  dirname(fromFileURL(import.meta.url)),
  "..",
  "..",
  "src",
  "styles",
);
const read = async (f) => await file(resolve(stylesDir, f)).text();
const tokens = await read("tokens.css");
const base = await read("base.css");
const components = await read("components.css");
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
  assert(start !== -1, `no ${selector} block in tokens.css`);
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
  test(`a11y: ${themeName} text meets WCAG AA on every surface`, () => {
    // Every text colour against every background the library paints. Checking
    // only --ui-surface and --ui-background left --ui-text-muted failing on
    // --ui-surface-muted at 4.34:1, which .ui-empty-icon and any .ui-muted
    // inside a .ui-table th or a muted panel land on.
    const TEXT = [
      "--ui-text",
      "--ui-text-secondary",
      "--ui-text-muted",
      "--ui-primary",
      "--ui-primary-text",
    ];
    const SURFACES = ["--ui-surface", "--ui-background", "--ui-surface-muted"];
    for (const t of TEXT) {
      for (const bg of SURFACES) {
        const r = contrast(theme[t], theme[bg]);
        assert(
          r >= AA_TEXT,
          `${t} on ${bg} is ${r.toFixed(2)}:1, needs ${AA_TEXT}:1 (${themeName})`,
        );
      }
    }
  });

  test(`a11y: ${themeName} soft badge and alert text meets WCAG AA`, () => {
    for (const role of ["primary", "success", "warning", "danger", "info"]) {
      const r = contrast(theme[`--ui-${role}-text`], theme[`--ui-${role}-soft`]);
      assert(
        r >= AA_TEXT,
        `--ui-${role}-text on --ui-${role}-soft is ${r.toFixed(2)}:1 (${themeName})`,
      );
    }
  });

  test(`a11y: ${themeName} muted text stays distinguishable from secondary`, () => {
    // Raising muted for contrast must not collapse it into secondary — they
    // are two deliberately different weights of de-emphasis.
    const muted = contrast(theme["--ui-text-muted"], theme["--ui-surface"]);
    const secondary = contrast(theme["--ui-text-secondary"], theme["--ui-surface"]);
    assert(
      secondary - muted > 0.75,
      `muted ${muted.toFixed(2)}:1 and secondary ${secondary.toFixed(2)}:1 are too close (${themeName})`,
    );
  });

  test(`a11y: ${themeName} filled surfaces meet WCAG AA against their label`, () => {
    // One foreground token serves every accent fill; it flips with the theme
    // because the fills do. Four rules used to hardcode `white`, which is
    // exactly backwards in dark mode.
    const fg = theme["--ui-text-on-accent"];
    assert(fg, "--ui-text-on-accent must be defined");
    for (const fill of [
      "--ui-primary",
      "--ui-success",
      "--ui-warning",
      "--ui-danger",
      "--ui-info",
    ]) {
      const r = contrast(fg, theme[fill]);
      assert(
        r >= AA_TEXT,
        `label on ${fill} is ${r.toFixed(2)}:1, needs ${AA_TEXT}:1 (${themeName})`,
      );
    }
  });

  test(`a11y: ${themeName} hover states stay legible too`, () => {
    const fg = theme["--ui-text-on-accent"];
    for (const fill of [
      "--ui-primary-hover",
      "--ui-success-hover",
      "--ui-warning-hover",
      "--ui-info-hover",
    ]) {
      const r = contrast(fg, theme[fill]);
      assert(
        r >= AA_TEXT,
        `label on ${fill} is ${r.toFixed(2)}:1, needs ${AA_TEXT}:1 (${themeName})`,
      );
    }
  });

  test(`a11y: ${themeName} focus ring is visible against adjacent colours`, () => {
    // WCAG 2.2 SC 2.4.11 Focus Appearance.
    for (const bg of ["--ui-surface", "--ui-background", "--ui-surface-muted"]) {
      const r = contrast(theme["--ui-focus-ring-color"], theme[bg]);
      assert(
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
  assertEquals(
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
  assertEquals(
    killsOutline.length,
    0,
    `outline: none inside a focus rule — use a transparent outline instead (${killsOutline.length} found)`,
  );
});

test("a11y: a forced-colors block exists and covers focus", () => {
  expect(components).toMatch(/@media \(forced-colors: active\)/);
  const block = components.slice(components.indexOf("@media (forced-colors"));
  expect(block).toMatch(/outline:\s*3px solid Highlight/);
});

test("a11y: the switch draws its ring on the track, since its input is invisible", () => {
  expect(components).toMatch(/\.ui-switch input:focus-visible \+ \.ui-switch-track/);
  expect(components).toMatch(/\.ui-switch input\s*\{[^}]*opacity:\s*0/);
});

test("a11y: no rule hardcodes a foreground colour on a themed fill", () => {
  // `color: white` on a fill that lightens in dark mode inverts the contrast.
  // The tooltip was the worst: its background is --ui-text, which is near-white
  // in dark, so white-on-white.
  const hardcoded = [...all.matchAll(/color:\s*(white|#fff(?:fff)?)\s*;/gi)];
  assertEquals(
    hardcoded.length,
    0,
    `use a token that flips with the theme (--ui-text-on-accent / --ui-surface); found ${hardcoded.length}`,
  );
});

test("a11y: pointer targets meet the 24px minimum", () => {
  // WCAG 2.2 SC 2.5.8. The native checkbox and radio boxes are smaller than
  // that on purpose — the label wrapping them is the actual click target, so
  // the minimum lives there.
  const rem = 16;
  const sizeOf = (selector, prop) => {
    const re = new RegExp(
      `\\.${selector}\\s*\\{[^}]*?\\b${prop}:\\s*([\\d.]+)(rem|px)`,
      "s",
    );
    const m = re.exec(components);
    assert(m, `no ${prop} on .${selector}`);
    return m[2] === "rem" ? parseFloat(m[1]) * rem : parseFloat(m[1]);
  };

  for (const wrapper of ["ui-checkbox", "ui-radio"])
    assert(
      sizeOf(wrapper, "min-height") >= 24,
      `.${wrapper} is the click target and must be at least 24px tall`,
    );

  assert(sizeOf("ui-btn", "min-height") >= 24, ".ui-btn");
  assert(sizeOf("ui-btn-sm", "min-height") >= 24, ".ui-btn-sm");
  assert(sizeOf("ui-btn-icon", "width") >= 24, ".ui-btn-icon");
  assert(sizeOf("ui-page", "height") >= 24, ".ui-page");
  assert(sizeOf("ui-switch", "height") >= 24, ".ui-switch");
});

test("a11y: nothing strips the browser's focus ring without replacing it", () => {
  // Not just inside :focus rules — a base rule doing it is the same problem.
  assertEquals(
    (all.match(/outline:\s*none/g) ?? []).length,
    0,
    "use a transparent outline so forced-colors mode can repaint it",
  );
});

test("a11y: reduced motion is still honoured", () => {
  expect(components).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
});
