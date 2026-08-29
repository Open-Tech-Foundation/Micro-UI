import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../../src");

const { define, html, update, flush } = await import(`../../src/index.ts?coverage-jsdom-${Date.now()}`);
function uniqueTag(p){ return p+"-"+Math.random().toString(36).slice(2,8); }
function tick(){ return new Promise(r=>queueMicrotask(r)); }

// ── NS recreation via correctVNodeNS ──────────────────────────────
test("coverage jsdom: foreignObject child stays HTML after NS correction", async () => {
  const tag = uniqueTag("cov-fo");
  define(tag, () => () => html`<svg><foreignObject width="100"><div class="inner">hi</div></foreignObject></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const inner = el.querySelector(".inner");
  assert.equal(inner.namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(inner.textContent, "hi");
});

test("coverage jsdom: svg fragment inside svg gets SVG NS", async () => {
  const tag = uniqueTag("cov-frag");
  let show = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg>${show ? html`<g><circle r="5"></circle></g>` : null}</svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assert.equal(el.querySelector("circle").namespaceURI, "http://www.w3.org/2000/svg");
  show = false; update(ref); await tick(); flush();
  assert.equal(el.querySelector("circle"), null);
  show = true; update(ref); await tick(); flush();
  assert.equal(el.querySelector("circle").namespaceURI, "http://www.w3.org/2000/svg");
});

// ── computed style smoke ──────────────────────────────────────────
test("coverage jsdom: styles.css injects and .ui-btn has computed style", async () => {
  const css = readFileSync(resolve(src, "styles.css"), "utf8");
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><button class="ui-btn">x</button></body></html>`, { url: "http://localhost/" });
  const btn = dom.window.document.querySelector(".ui-btn");
  assert.ok(btn);
  const style = dom.window.getComputedStyle(btn);
  // jsdom may not resolve every property, but display should be set by .ui-btn
  assert.ok(style.display.length > 0);
});

// ── error fallback preserves host ──────────────────────────────────
test("coverage jsdom: error in render mounts fallback and other component still works", async () => {
  const tagBad = uniqueTag("cov-bad");
  define(tagBad, () => () => { throw new Error("cov-boom"); });
  const tagGood = uniqueTag("cov-good");
  define(tagGood, () => () => html`<span>good</span>`);
  const bad = document.createElement(tagBad); document.body.appendChild(bad);
  const good = document.createElement(tagGood); document.body.appendChild(good);
  await tick(); flush();
  assert.ok(bad.querySelector("[data-micro-ui-error]"));
  assert.equal(good.querySelector("span").textContent, "good");
});

// ── store listener error isolation in jsdom context ─────────────────
test("coverage jsdom: store notify error does not break update", async () => {
  const { store } = await import(`../../src/index.ts?store-cov-${Date.now()}`);
  store.clear();
  let a = 0, b = 0;
  store.subscribe("cov-store", () => { a++; throw new Error("listener-boom"); });
  store.subscribe("cov-store", () => { b++; });
  store.set("cov-store", 1);
  assert.equal(a, 1);
  assert.equal(b, 1);
});
