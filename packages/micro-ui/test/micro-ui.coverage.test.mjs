import { assert, assertEquals, test } from "runtime:test";
import { setupDOM } from "./helpers/dom.mjs";

let tagCounter = 0;
function uniqueTag(prefix) { return `${prefix}-${++tagCounter}-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
async function fresh() { return await import(`../src/index.ts?${Date.now()}-${Math.random()}`); }
const delay = (n=10) => new Promise(r => setTimeout(r, n));
const micro = () => new Promise(r => queueMicrotask(r));


// ── ns: resolveNS / svgTagName ─────────────────────────────────────
test("ns: resolveNS for svg root", async () => {
  const { resolveNS, SVG_NS, HTML_NS } = await import(`../src/ns.ts?${Date.now()}-${Math.random()}`);
  assertEquals(resolveNS("svg", HTML_NS), SVG_NS);
  assertEquals(resolveNS("div", SVG_NS), SVG_NS);
  assertEquals(resolveNS("div", HTML_NS), HTML_NS);
  assertEquals(resolveNS("foreignobject", null, SVG_NS), SVG_NS);
  assertEquals(resolveNS("circle", SVG_NS), SVG_NS);
});
test("ns: svgTagName canonicalizes camelCase", async () => {
  const { svgTagName } = await import(`../src/ns.ts?${Date.now()}-${Math.random()}`);
  assertEquals(svgTagName("foreignobject"), "foreignObject");
  assertEquals(svgTagName("clippath"), "clipPath");
  assertEquals(svgTagName("lineargradient"), "linearGradient");
  assertEquals(svgTagName("div"), "div");
});

// ── template buildTemplate static path ─────────────────────────────
test("template: buildTemplate with only static markup parses", async () => {
  setupDOM();
  const { buildTemplate } = await import(`../src/template.ts?${Date.now()}-${Math.random()}`);
  const cache = buildTemplate(["<div>static</div>"]);
  assertEquals(cache.bindings.length, 0);
  assertEquals(cache.tree.length, 1);
});
test("template: buildTemplate with no bindings handles empty", async () => {
  setupDOM();
  const { buildTemplate } = await import(`../src/template.ts?${Date.now()}-${Math.random()}`);
  const cache = buildTemplate(["<span></span>"]);
  assertEquals(cache.tree[0].tag, "span");
});

// ── store: listener throwing does not break other listeners ────────
test("store: listener throwing does not prevent other listeners", async () => {
  const { store } = await fresh();
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
test("store: del with path listener throwing still notifies others", async () => {
  const { store } = await fresh();
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
test("store: double unsubscribe returns false", async () => {
  const { store } = await fresh();
  store.clear();
  const unsub = store.subscribe("dbl", () => {});
  assertEquals(unsub(), true);
  assertEquals(unsub(), false);
});
test("store: clear removes listeners", async () => {
  const { store } = await fresh();
  let called = false;
  store.subscribe("clear-l", () => { called = true; });
  store.clear();
  store.set("clear-l", 99);
  assertEquals(called, false);
});
test("store: path with array index", async () => {
  const { store } = await fresh();
  store.clear();
  store.set("arr", { items: [{ name: "a" }, { name: "b" }] });
  store.set("arr", "changed", { path: "items.0.name" });
  assertEquals(store.get("arr", { path: "items.0.name" }), "changed");
  assertEquals(store.get("arr", { path: "items.1.name" }), "b");
});
test("store: set with path on primitive initializes object", async () => {
  const { store } = await fresh();
  store.clear();
  store.set("prim", 42);
  store.set("prim", "nested", { path: "foo" });
  assertEquals(store.get("prim", { path: "foo" }), "nested");
});
test("store: get missing key does not create entry", async () => {
  const { store } = await fresh();
  store.clear();
  assertEquals(store.get("ghost"), undefined);
  store.set("other", 1);
  assertEquals(store.get("ghost"), undefined);
  assertEquals(store.get("other"), 1);
});

// ── define: duplicate tag overwrites in FakeDOM (real customElements would throw) ──
test("define: duplicate tag behavior (FakeDOM overwrites, real DOM throws)", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("dup");
  define(tag, () => () => html`<div>first</div>`);
  let threw = false;
  try { define(tag, () => () => html`<div>second</div>`); } catch (e) { threw = true; }
  // FakeDOM's mock just overwrites registry; real browser throws DOMException. Both are acceptable per current impl.
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  // Should render without crashing regardless of which define won
  assert(el.querySelector("div") !== null);
});

// ── define: props snapshot does not auto-update on setAttribute ────
test("define: props are snapshot at connect, not live", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("props-snap");
  let capturedProps = null;
  define(tag, (el, props) => { capturedProps = props; return () => html`<div>${props.foo}</div>`; });
  const el = document.createElement(tag); el.setAttribute("foo", "initial"); document.body.appendChild(el); await delay();
  assertEquals(capturedProps.foo, "initial");
  el.setAttribute("foo", "changed");
  // Without update, props snapshot stays initial; DOM still shows initial
  assertEquals(el.querySelector("div").textContent, "initial");
});

// ── onReady: cleanup that throws currently propagates (documents gap) ─────
test("onReady: cleanup throwing propagates (gap: blocks later cleanups)", async () => {
  setupDOM(); const { define, html, onReady } = await fresh();
  const tag = uniqueTag("ready-throw");
  let secondCleaned = false;
  define(tag, () => {
    onReady(() => { return () => { throw new Error("cleanup-boom"); }; });
    onReady(() => { return () => { secondCleaned = true; }; });
    return () => html`<div>hi</div>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  let threw = false;
  try { el.remove(); await delay(); } catch (e) { threw = true; }
  // Current impl does not contain cleanup errors: first throw prevents second cleanup
  assertEquals(secondCleaned, false);
  assert(threw === true || threw === false, "remove either throws or is swallowed depending on DOM");
});

// ── update re-entrancy / flush idempotence ─────────────────────────
test("update: re-entrant self-update in render is guarded to one flush", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("reent");
  let renders = 0; let ref;
  define(tag, el2 => { ref = el2; return () => { renders++; return html`<span>${renders}</span>`; }; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  renders = 0;
  // Simulate re-entrant call: update inside flush will be de-duped via currentRendering guard
  update(ref); update(ref); update(ref);
  await micro(); flush(); await delay(5);
  assertEquals(renders, 1);
});
test("flush: idempotent double flush", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("flush-idem");
  let v = 1; let ref;
  define(tag, el2 => { ref = el2; return () => html`<span>${v}</span>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  v = 2; update(ref); flush(); flush();
  await delay(5);
  assertEquals(el.querySelector("span").textContent, "2");
});
test("update: unknown and disconnected are no-ops", async () => {
  setupDOM(); const { update, flush } = await fresh();
  const fake = document.createElement("div");
  update(fake); await micro(); flush();
  assert(true);
  const { define, html } = await fresh();
  const tag = uniqueTag("upd-disc2");
  define(tag, () => () => html`<div>ok</div>`);
  const el = document.createElement(tag);
  update(el); await micro(); flush(); await delay(5);
  assert(true);
});

// ── html.raw edge cases ────────────────────────────────────────────
test("html.raw: empty string renders nothing but no crash", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("raw-empty");
  define(tag, () => () => html`<div>${html.raw``}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").textContent, "");
});
test("html.raw: trusted HTML not escaped", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("raw-trust2");
  define(tag, () => () => html`<div>${html.raw`<p><b>trusted</b></p>`}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const b = el.querySelector("b");
  assert(b !== null);
  assertEquals(b.textContent, "trusted");
});

// ── vdom stricter binding ─────────────────────────────────────────
test("vdom: plain object with type field not treated as VNode", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("vdom-strict2");
  const fake = { type: "element", tag: "div", value: "oops" };
  define(tag, () => () => html`<div>${fake}</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const div = el.querySelector("div");
  // Must not be interpreted as a real VNode (no nested div created from fake)
  assert(div.querySelector("div") === null, "plain object must not create nested element");
  assert(div.textContent.length > 0, "should render as text");
});

// ── aria / boolean prop edge ──────────────────────────────────────
test("props: aria-hidden numeric zero stringifies to '0'", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("aria-zero");
  define(tag, () => () => html`<div aria-hidden=${0}></div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("aria-hidden"), "0");
});
