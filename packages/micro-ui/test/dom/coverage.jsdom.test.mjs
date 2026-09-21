import { assert, assertEquals, expect, test } from "runtime:test";
import { file } from "runtime:fs";
import { resolve, dirname, fromFileURL } from "runtime:path";

const here = dirname(fromFileURL(import.meta.url));
const src = resolve(here, "../../src");

const { define, html, update, flush, onReady, store } = await import("../../src/index.ts");
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
// esdev resolves every import of index.ts to the same module instance, so a
// query-suffixed re-import cannot create an isolated store. The shared store
// is safe here: every store test clears it and uses unique keys.
async function freshStore() {
  store.clear();
  return store;
}

// ── NS recreation via correctVNodeNS ──────────────────────────────
test("coverage jsdom: foreignObject child stays HTML after NS correction", async () => {
  const tag = uniqueTag("cov-fo");
  define(tag, () => () => html`<svg><foreignObject width="100"><div class="inner">hi</div></foreignObject></svg>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  const inner = el.querySelector(".inner");
  assertEquals(inner.namespaceURI, "http://www.w3.org/1999/xhtml");
  assertEquals(inner.textContent, "hi");
});

test("coverage jsdom: svg fragment inside svg gets SVG NS", async () => {
  const tag = uniqueTag("cov-frag");
  let show = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<svg>${show ? html`<g><circle r="5"></circle></g>` : null}</svg>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); flush();
  assertEquals(el.querySelector("circle").namespaceURI, "http://www.w3.org/2000/svg");
  show = false; update(ref); await tick(); flush();
  assertEquals(el.querySelector("circle"), null);
  show = true; update(ref); await tick(); flush();
  assertEquals(el.querySelector("circle").namespaceURI, "http://www.w3.org/2000/svg");
});

// ── computed style smoke ──────────────────────────────────────────
// esdev's getComputedStyle only models inline styles — a <style> element does
// not cascade. styles.css is a pure @import re-export, so assert the .ui-btn
// rule textually (it lives in components.css), inject it, and smoke the element.
test("coverage jsdom: styles.css injects and .ui-btn has computed style", async () => {
  const css = await file(resolve(src, "styles.css")).text();
  const styles = await file(resolve(src, "styles/components.css")).text();
  assert(css.includes("@import url(\"./styles/components.css\")"), "styles.css re-exports components");
  assert(styles.includes(".ui-btn {"), "components.css defines .ui-btn");
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
  const btn = document.createElement("button");
  btn.className = "ui-btn";
  document.body.appendChild(btn);
  assert(btn, "button exists");
  assert(typeof getComputedStyle(btn).display === "string", "getComputedStyle smoke");
  btn.remove();
  style.remove();
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
  assert(bad.querySelector("[data-micro-ui-error]"));
  assertEquals(good.querySelector("span").textContent, "good");
});

// ── store listener error isolation in jsdom context ─────────────────
test("coverage jsdom: store notify error does not break update", async () => {
  store.clear();
  let a = 0, b = 0;
  store.subscribe("cov-store", () => { a++; throw new Error("listener-boom"); });
  store.subscribe("cov-store", () => { b++; });
  store.set("cov-store", 1);
  assertEquals(a, 1);
  assertEquals(b, 1);
});

// ── ns: resolveNS / svgTagName ─────────────────────────────────────
test("coverage jsdom: ns resolveNS for svg root", async () => {
  const { resolveNS, SVG_NS, HTML_NS } = await import("../../src/ns.ts");
  assertEquals(resolveNS("svg", HTML_NS), SVG_NS);
  assertEquals(resolveNS("div", SVG_NS), SVG_NS);
  assertEquals(resolveNS("div", HTML_NS), HTML_NS);
  assertEquals(resolveNS("foreignobject", null, SVG_NS), SVG_NS);
  assertEquals(resolveNS("circle", SVG_NS), SVG_NS);
});
test("coverage jsdom: ns svgTagName canonicalizes camelCase", async () => {
  const { svgTagName } = await import("../../src/ns.ts");
  assertEquals(svgTagName("foreignobject"), "foreignObject");
  assertEquals(svgTagName("clippath"), "clipPath");
  assertEquals(svgTagName("lineargradient"), "linearGradient");
  assertEquals(svgTagName("div"), "div");
});

// ── template buildTemplate static path ─────────────────────────────
test("coverage jsdom: template buildTemplate with only static markup parses", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  const cache = buildTemplate(["<div>static</div>"]);
  assertEquals(cache.bindings.length, 0);
  assertEquals(cache.tree.length, 1);
});
test("coverage jsdom: template buildTemplate with no bindings handles empty", async () => {
  const { buildTemplate } = await import("../../src/template.ts");
  const cache = buildTemplate(["<span></span>"]);
  assertEquals(cache.tree[0].tag, "span");
});

// ── store: listener throwing does not break other listeners ────────
test("coverage jsdom: store listener throwing does not prevent other listeners", async () => {
  const store = await freshStore();
  store.clear();
  let a = 0, b = 0;
  store.subscribe("throw-test", () => { a++; throw new Error("boom"); });
  store.subscribe("throw-test", () => { b++; });
  store.set("throw-test", 1);
  assertEquals(a, 1);
  assertEquals(b, 1);
  store.set("throw-test", 2);
  assertEquals(a, 2);
  assertEquals(b, 2);
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
  assertEquals(a, 1);
  assertEquals(b, 1);
});
test("coverage jsdom: store double unsubscribe returns false", async () => {
  const store = await freshStore();
  store.clear();
  const unsub = store.subscribe("dbl", () => {});
  assertEquals(unsub(), true);
  assertEquals(unsub(), false);
});
test("coverage jsdom: store clear resets values and keeps subscriptions live", async () => {
  const store = await freshStore();
  const seen = [];
  store.subscribe("clear-l", v => { seen.push(v); });
  store.set("clear-l", 1);
  store.clear();
  assertEquals(store.get("clear-l"), undefined);
  store.set("clear-l", 99);
  assertEquals(seen.join(","), "1,,99");
});
test("coverage jsdom: store path with array index", async () => {
  const store = await freshStore();
  store.clear();
  store.set("arr", { items: [{ name: "a" }, { name: "b" }] });
  store.set("arr", "changed", { path: "items.0.name" });
  assertEquals(store.get("arr", { path: "items.0.name" }), "changed");
  assertEquals(store.get("arr", { path: "items.1.name" }), "b");
  assert(Array.isArray(store.get("arr").items), "items must stay an array");
  assertEquals(store.get("arr").items.length, 2);
});
test("coverage jsdom: store set with path on primitive initializes object", async () => {
  const store = await freshStore();
  store.clear();
  store.set("prim", 42);
  store.set("prim", "nested", { path: "foo" });
  assertEquals(store.get("prim", { path: "foo" }), "nested");
});
test("coverage jsdom: store get missing key does not create entry", async () => {
  const store = await freshStore();
  store.clear();
  assertEquals(store.get("ghost"), undefined);
  store.set("other", 1);
  assertEquals(store.get("ghost"), undefined);
  assertEquals(store.get("other"), 1);
});

// ── define: duplicate tag behavior ──
test("coverage jsdom: define duplicate tag throws in real DOM", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("dup");
  mod.define(tag, () => () => mod.html`<div>first</div>`);
  let threw = false;
  try { mod.define(tag, () => () => mod.html`<div>second</div>`); } catch (e) { threw = true; }
  assertEquals(threw, true, "real customElements.define should throw on duplicate");
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  assert(el.querySelector("div") !== null);
});

// ── define: props snapshot does not auto-update on setAttribute ────
test("coverage jsdom: define props are snapshot at connect, not live", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("props-snap");
  let capturedProps = null;
  mod.define(tag, (el, props) => { capturedProps = props; return () => mod.html`<div>${props.foo}</div>`; });
  const el = document.createElement(tag); el.setAttribute("foo", "initial"); document.body.appendChild(el); await tick();
  assertEquals(capturedProps.foo, "initial");
  el.setAttribute("foo", "changed");
  assertEquals(el.querySelector("div").textContent, "initial");
});

// ── onReady: cleanup that throws ─────
test("coverage jsdom: a throwing cleanup is isolated and later cleanups still run", async () => {
  const mod = await import("../../src/index.ts");
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
  // Teardown is deferred to a microtask so a move can cancel it, which means a
  // throwing cleanup can no longer reach the caller — it is caught, logged, and
  // the remaining cleanups still run.
  assertEquals(threw, false, "the throw must not escape as an unhandled error");
  assertEquals(secondCleaned, true, "one broken cleanup must not block the rest");
});

// ── update re-entrancy / flush idempotence ─────────────────────────
test("coverage jsdom: update re-entrant self-update in render is guarded to one flush", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("reent");
  let renders = 0; let ref;
  mod.define(tag, el2 => { ref = el2; return () => { renders++; return mod.html`<span>${renders}</span>`; }; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  renders = 0;
  mod.update(ref); mod.update(ref); mod.update(ref);
  await tick(); mod.flush(); await delay(5);
  assertEquals(renders, 1);
});
test("coverage jsdom: flush idempotent double flush", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("flush-idem");
  let v = 1; let ref;
  mod.define(tag, el2 => { ref = el2; return () => mod.html`<span>${v}</span>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  v = 2; mod.update(ref); mod.flush(); mod.flush();
  await delay(5);
  assertEquals(el.querySelector("span").textContent, "2");
});
test("coverage jsdom: update unknown and disconnected are no-ops", async () => {
  const mod = await import("../../src/index.ts");
  const fake = document.createElement("div");
  mod.update(fake); await tick(); mod.flush();
  assert(true);
  const tag = uniqueTag("upd-disc2");
  mod.define(tag, () => () => mod.html`<div>ok</div>`);
  const el = document.createElement(tag);
  mod.update(el); await tick(); mod.flush(); await delay(5);
  assert(true);
});

// ── html.raw edge cases ────────────────────────────────────────────
test("coverage jsdom: html.raw empty string renders nothing but no crash", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("raw-empty");
  mod.define(tag, () => () => mod.html`<div>${mod.html.raw``}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  assertEquals(el.querySelector("div").textContent, "");
});
test("coverage jsdom: html.raw trusted HTML not escaped", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("raw-trust2");
  mod.define(tag, () => () => mod.html`<div>${mod.html.raw`<p><b>trusted</b></p>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  const b = el.querySelector("b");
  assert(b !== null);
  assertEquals(b.textContent, "trusted");
});

// ── vdom stricter binding ─────────────────────────────────────────
test("coverage jsdom: vdom plain object with type field not treated as VNode", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("vdom-strict2");
  const fake = { type: "element", tag: "div", value: "oops" };
  mod.define(tag, () => () => mod.html`<div>${fake}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  const div = el.querySelector("div");
  assertEquals(div.querySelector("div"), null, "plain object must not create nested element");
  assert(div.textContent.length > 0, "should render as text");
});

// ── aria / boolean prop edge ──────────────────────────────────────
test("coverage jsdom: props aria-hidden numeric zero stringifies to '0'", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("aria-zero");
  mod.define(tag, () => () => mod.html`<div aria-hidden=${0}></div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick();
  assertEquals(el.querySelector("div").getAttribute("aria-hidden"), "0");
});

// ── resolveBinding accepts every VNode shape, not just fragments ───
// html`` always returns a fragment, so the text/element/raw branches of
// resolveBinding are never reached by a whole template. They are reached when
// a caller passes an individual node — e.g. a child plucked off a tree. Without
// the element branch such a value falls through to String(val) and renders the
// literal text "[object Object]".
test("coverage jsdom: an element vnode passed as a value renders as an element", async () => {
  const tag = uniqueTag("cov-vnode-el");
  const node = html`<b class="picked">bold</b>`.children[0];
  assertEquals(node.type, "element", "precondition: this is a bare element vnode");

  define(tag, () => () => html`<p>${node}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const b = el.querySelector("p > b.picked");
  assert(b, "must be a real <b> element, not stringified");
  assertEquals(b.textContent, "bold");
  assertEquals(el.textContent.includes("[object Object]"), false);
});

test("coverage jsdom: a text vnode passed as a value renders as text", async () => {
  const tag = uniqueTag("cov-vnode-text");
  const node = html`plain`.children[0];
  assertEquals(node.type, "text");

  define(tag, () => () => html`<p>${node}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  assertEquals(el.querySelector("p").textContent, "plain");
  assertEquals(el.textContent.includes("[object Object]"), false);
});

test("coverage jsdom: a fragment vnode passed as a value is spliced in", async () => {
  const tag = uniqueTag("cov-vnode-frag");
  const node = html`<i>one</i><i>two</i>`;
  assertEquals(node.type, "fragment");

  define(tag, () => () => html`<p>${node}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  assertEquals(el.querySelectorAll("p > i").length, 2);
  assertEquals(el.querySelector("p").textContent, "onetwo");
});

test("coverage jsdom: a plain object still stringifies, it is not treated as a vnode", async () => {
  const tag = uniqueTag("cov-vnode-plain");
  define(tag, () => () => html`<p>${{ type: "element" }}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  // type: "element" without a string tag must not be mistaken for a vnode.
  assertEquals(el.querySelector("p").textContent, "[object Object]");
});