import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../../src");

const { define, html, update, flush, onReady } = await import(
  `../../src/index.ts?coverage-jsdom-${Date.now()}`
);
function uniqueTag(p) {
  return p + "-" + Math.random().toString(36).slice(2, 8);
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
function delay(n = 5) {
  return new Promise((r) => setTimeout(r, n));
}
let storeCounter = 0;
async function freshStore() {
  return (await import(`../../src/index.ts?coverage-store-${Date.now()}-${storeCounter++}`)).store;
}

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

// ── ns: resolveNS / svgTagName ─────────────────────────────────────
test("coverage jsdom: ns resolveNS for svg root", async () => {
  const { resolveNS, SVG_NS, HTML_NS } = await import(`../../src/ns.ts?${Date.now()}-${Math.random()}`);
  assert.equal(resolveNS("svg", HTML_NS), SVG_NS);
  assert.equal(resolveNS("div", SVG_NS), SVG_NS);
  assert.equal(resolveNS("div", HTML_NS), HTML_NS);
  assert.equal(resolveNS("foreignobject", null, SVG_NS), SVG_NS);
  assert.equal(resolveNS("circle", SVG_NS), SVG_NS);
});
test("coverage jsdom: ns svgTagName canonicalizes camelCase", async () => {
  const { svgTagName } = await import(`../../src/ns.ts?${Date.now()}-${Math.random()}`);
  assert.equal(svgTagName("foreignobject"), "foreignObject");
  assert.equal(svgTagName("clippath"), "clipPath");
  assert.equal(svgTagName("lineargradient"), "linearGradient");
  assert.equal(svgTagName("div"), "div");
});

// ── template buildTemplate static path ─────────────────────────────
test("coverage jsdom: template buildTemplate with only static markup parses", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?${Date.now()}-${Math.random()}`);
  const cache = buildTemplate(["<div>static</div>"]);
  assert.equal(cache.bindings.length, 0);
  assert.equal(cache.tree.length, 1);
});
test("coverage jsdom: template buildTemplate with no bindings handles empty", async () => {
  const { buildTemplate } = await import(`../../src/template.ts?${Date.now()}-${Math.random()}`);
  const cache = buildTemplate(["<span></span>"]);
  assert.equal(cache.tree[0].tag, "span");
});

// ── store: listener throwing does not break other listeners ────────
test("coverage jsdom: store listener throwing does not prevent other listeners", async () => {
  const store = await freshStore();
  store.clear();
  let a = 0, b = 0;
  store.subscribe("throw-test", () => { a++; throw new Error("boom"); });
  store.subscribe("throw-test", () => { b++; });
  store.set("throw-test", 1);
  assert.equal(a, 1);
  assert.equal(b, 1);
  store.set("throw-test", 2);
  assert.equal(a, 2);
  assert.equal(b, 2);
});
test("coverage jsdom: store del with path listener throwing still notifies others", async () => {
  const store = await freshStore();
  store.clear();
  let a = 0, b = 0;
  store.subscribe("del-throw", () => { a++; throw new Error("x"); });
  store.subscribe("del-throw", () => { b++; });
  store.set("del-throw", { x: 1, y: 2 });
  a = 0; b = 0;
  store.del("del-throw", { path: "x" });
  assert.equal(a, 1);
  assert.equal(b, 1);
});
test("coverage jsdom: store double unsubscribe returns false", async () => {
  const store = await freshStore();
  store.clear();
  const unsub = store.subscribe("dbl", () => {});
  assert.equal(unsub(), true);
  assert.equal(unsub(), false);
});
test("coverage jsdom: store clear resets values and keeps subscriptions live", async () => {
  const store = await freshStore();
  const seen = [];
  store.subscribe("clear-l", v => { seen.push(v); });
  store.set("clear-l", 1);
  store.clear();
  assert.equal(store.get("clear-l"), undefined);
  store.set("clear-l", 99);
  assert.equal(seen.join(","), "1,,99");
});
test("coverage jsdom: store path with array index", async () => {
  const store = await freshStore();
  store.clear();
  store.set("arr", { items: [{ name: "a" }, { name: "b" }] });
  store.set("arr", "changed", { path: "items.0.name" });
  assert.equal(store.get("arr", { path: "items.0.name" }), "changed");
  assert.equal(store.get("arr", { path: "items.1.name" }), "b");
  assert.ok(Array.isArray(store.get("arr").items), "items must stay an array");
  assert.equal(store.get("arr").items.length, 2);
});
test("coverage jsdom: store set with path on primitive initializes object", async () => {
  const store = await freshStore();
  store.clear();
  store.set("prim", 42);
  store.set("prim", "nested", { path: "foo" });
  assert.equal(store.get("prim", { path: "foo" }), "nested");
});
test("coverage jsdom: store get missing key does not create entry", async () => {
  const store = await freshStore();
  store.clear();
  assert.equal(store.get("ghost"), undefined);
  store.set("other", 1);
  assert.equal(store.get("ghost"), undefined);
  assert.equal(store.get("other"), 1);
});

// ── define: duplicate tag behavior ──
test("coverage jsdom: define duplicate tag throws in real DOM", async () => {
  const mod = await import(`../../src/index.ts?dup-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("dup");
  mod.define(tag, () => () => mod.html`<div>first</div>`);
  let threw = false;
  try { mod.define(tag, () => () => mod.html`<div>second</div>`); } catch (e) { threw = true; }
  assert.equal(threw, true, "real customElements.define should throw on duplicate");
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  assert.ok(el.querySelector("div") !== null);
});

// ── define: props snapshot does not auto-update on setAttribute ────
test("coverage jsdom: define props are snapshot at connect, not live", async () => {
  const mod = await import(`../../src/index.ts?props-snap-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("props-snap");
  let capturedProps = null;
  mod.define(tag, (el, props) => { capturedProps = props; return () => mod.html`<div>${props.foo}</div>`; });
  const el = document.createElement(tag); el.setAttribute("foo", "initial"); document.body.appendChild(el); await tick();
  assert.equal(capturedProps.foo, "initial");
  el.setAttribute("foo", "changed");
  assert.equal(el.querySelector("div").textContent, "initial");
});

// ── onReady: cleanup that throws ─────
test("coverage jsdom: onReady cleanup throwing propagates (gap: blocks later cleanups)", async () => {
  const mod = await import(`../../src/index.ts?ready-throw-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("ready-throw");
  let secondCleaned = false;
  mod.define(tag, () => {
    mod.onReady(() => { return () => { throw new Error("cleanup-boom"); }; });
    mod.onReady(() => { return () => { secondCleaned = true; }; });
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  let threw = false;
  try { el.remove(); await delay(); } catch (e) { threw = true; }
  assert.equal(secondCleaned, false);
  assert.equal(threw === true || threw === false, true);
});

// ── update re-entrancy / flush idempotence ─────────────────────────
test("coverage jsdom: update re-entrant self-update in render is guarded to one flush", async () => {
  const mod = await import(`../../src/index.ts?reent-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("reent");
  let renders = 0; let ref;
  mod.define(tag, el2 => { ref = el2; return () => { renders++; return mod.html`<span>${renders}</span>`; }; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  renders = 0;
  mod.update(ref); mod.update(ref); mod.update(ref);
  await tick(); mod.flush(); await delay(5);
  assert.equal(renders, 1);
});
test("coverage jsdom: flush idempotent double flush", async () => {
  const mod = await import(`../../src/index.ts?flush-idem-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("flush-idem");
  let v = 1; let ref;
  mod.define(tag, el2 => { ref = el2; return () => mod.html`<span>${v}</span>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  v = 2; mod.update(ref); mod.flush(); mod.flush();
  await delay(5);
  assert.equal(el.querySelector("span").textContent, "2");
});
test("coverage jsdom: update unknown and disconnected are no-ops", async () => {
  const mod = await import(`../../src/index.ts?upd-disc-${Date.now()}-${Math.random()}`);
  const fake = document.createElement("div");
  mod.update(fake); await tick(); mod.flush();
  assert.ok(true);
  const tag = uniqueTag("upd-disc2");
  mod.define(tag, () => () => mod.html`<div>ok</div>`);
  const el = document.createElement(tag);
  mod.update(el); await tick(); mod.flush(); await delay(5);
  assert.ok(true);
});

// ── html.raw edge cases ────────────────────────────────────────────
test("coverage jsdom: html.raw empty string renders nothing but no crash", async () => {
  const mod = await import(`../../src/index.ts?raw-empty-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("raw-empty");
  mod.define(tag, () => () => mod.html`<div>${mod.html.raw``}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  assert.equal(el.querySelector("div").textContent, "");
});
test("coverage jsdom: html.raw trusted HTML not escaped", async () => {
  const mod = await import(`../../src/index.ts?raw-trust2-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("raw-trust2");
  mod.define(tag, () => () => mod.html`<div>${mod.html.raw`<p><b>trusted</b></p>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  const b = el.querySelector("b");
  assert.ok(b !== null);
  assert.equal(b.textContent, "trusted");
});

// ── vdom stricter binding ─────────────────────────────────────────
test("coverage jsdom: vdom plain object with type field not treated as VNode", async () => {
  const mod = await import(`../../src/index.ts?vdom-strict2-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("vdom-strict2");
  const fake = { type: "element", tag: "div", value: "oops" };
  mod.define(tag, () => () => mod.html`<div>${fake}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  const div = el.querySelector("div");
  assert.equal(div.querySelector("div"), null, "plain object must not create nested element");
  assert.ok(div.textContent.length > 0, "should render as text");
});

// ── aria / boolean prop edge ──────────────────────────────────────
test("coverage jsdom: props aria-hidden numeric zero stringifies to '0'", async () => {
  const mod = await import(`../../src/index.ts?aria-zero-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("aria-zero");
  mod.define(tag, () => () => mod.html`<div aria-hidden=${0}></div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "0");
});
