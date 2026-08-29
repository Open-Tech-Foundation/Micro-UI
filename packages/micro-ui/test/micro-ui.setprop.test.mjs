import { assert, assertEquals, test } from "runtime:test";
import { setupDOM } from "./helpers/dom.mjs";

let tagCounter = 0;
function uniqueTag(prefix) { return `${prefix}-${++tagCounter}-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
async function fresh() { return await import(`../src/index.ts?${Date.now()}-${Math.random()}`); }
const delay = (n=10) => new Promise(r => setTimeout(r, n));
const micro = () => new Promise(r => queueMicrotask(r));

// ── setProp: value ────────────────────────────────────────────────
test("setProp: value property syncs .value and attribute", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-setprop-value"); let val = "hello"; let ref;
  define(tag, el2 => { ref = el2; return () => html`<input value=${val}>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const inp = el.querySelector("input");
  assertEquals(inp.value, "hello");
  assertEquals(inp.getAttribute("value"), "hello");
  val = "world"; update(ref); await micro(); flush(); await delay(5);
  assertEquals(inp.value, "world");
  assertEquals(inp.getAttribute("value"), "world");
});

// ── setProp: boolean props ────────────────────────────────────────
test("setProp: disabled true sets attribute and .disabled", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-dis");
  define(tag, () => () => html`<button disabled=${true}>x</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const btn = el.querySelector("button");
  assert(btn.getAttribute("disabled") !== null);
});

test("setProp: disabled false removes attribute and unsets .disabled", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-dis-f");
  define(tag, () => () => html`<button disabled=${false}>x</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const btn = el.querySelector("button");
  assert(btn.getAttribute("disabled") === null);
});

test("setProp: checked true sets .checked and attribute", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-chk");
  define(tag, () => () => html`<input type="checkbox" checked=${true}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const inp = el.querySelector("input");
  assert(inp.checked === true);
  assert(inp.getAttribute("checked") !== null);
});

test("setProp: checked false unsets .checked and removes attribute", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-chk-f");
  define(tag, () => () => html`<input type="checkbox" checked=${false}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const inp = el.querySelector("input");
  assert(inp.checked === false);
  assert(inp.getAttribute("checked") === null);
});

test("setProp: selected boolean sets .selected", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-sel");
  define(tag, () => () => html`<select><option selected=${true}>a</option></select>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const opt = el.querySelector("option");
  assert(opt.selected === true);
  assert(opt.getAttribute("selected") !== null);
});

test("setProp: indeterminate boolean sets .indeterminate", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-ind");
  define(tag, () => () => html`<input type="checkbox" indeterminate=${true}>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  const inp = el.querySelector("input");
  assert(inp.indeterminate === true);
});

// ── setProp: ARIA attributes ──────────────────────────────────────
test("setProp: aria-hidden true stringifies as 'true'", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-aria-true");
  define(tag, () => () => html`<div aria-hidden=${true}>x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("aria-hidden"), "true");
});

test("setProp: aria-hidden false stringifies as 'false'", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-aria-false");
  define(tag, () => () => html`<div aria-hidden=${false}>x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("aria-hidden"), "false");
});

test("setProp: aria-hidden null removes attribute", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-setprop-aria-null"); let val = true; let ref;
  define(tag, el2 => { ref = el2; return () => html`<div aria-hidden=${val}>x</div>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("aria-hidden"), "true");
  val = null; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("aria-hidden") === null);
});

test("setProp: role attribute is set", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-role");
  define(tag, () => () => html`<div role="button">x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("role"), "button");
});

test("setProp: aria numeric value stringifies", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-aria-num");
  define(tag, () => () => html`<div aria-valuenow=${42}>x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("aria-valuenow"), "42");
});

// ── setProp: generic attribute ────────────────────────────────────
test("setProp: null removes generic attribute", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-setprop-gen-null"); let t = "hi"; let ref;
  define(tag, el2 => { ref = el2; return () => html`<div title=${t}>x</div>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("title"), "hi");
  t = null; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("title") === null);
});

test("setProp: false removes generic attribute", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-setprop-gen-false"); let t = "hi"; let ref;
  define(tag, el2 => { ref = el2; return () => html`<div title=${t}>x</div>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  t = false; update(ref); await micro(); flush(); await delay(5);
  assert(el.querySelector("div").getAttribute("title") === null);
});

test("setProp: true sets empty string attribute", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-gen-true");
  define(tag, () => () => html`<div hidden=${true}>x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("hidden"), "");
});

test("setProp: string value sets attribute", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-str");
  define(tag, () => () => html`<div class="foo bar">x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("class"), "foo bar");
});

test("setProp: number value stringifies in attribute", async () => {
  setupDOM(); const { define, html } = await fresh();
  const tag = uniqueTag("t-setprop-num");
  define(tag, () => () => html`<div data-count=${42}>x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelector("div").getAttribute("data-count"), "42");
});

// ── setProp: event listeners survive update ───────────────────────
test("setProp: onclick handler fires after reconciliation", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-setprop-evt"); let count = 0; let ref;
  define(tag, el2 => { ref = el2; return () => html`<button onclick=${() => { count++; update(el2); }}>${count}</button>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  el.querySelector("button").click(); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("button").textContent, "1");
  el.querySelector("button").click(); await micro(); flush(); await delay(5);
  assertEquals(el.querySelector("button").textContent, "2");
});

// ── store splitPath (through public API) ─────────────────────────
test("store: splitPath works for deeply nested get/set/delete", async () => {
  const { store } = await fresh();
  store.set("deep", { a: { b: { c: 1 } } });
  assertEquals(store.get("deep", { path: "a.b.c" }), 1);
  store.set("deep", 99, { path: "a.b.c" });
  assertEquals(store.get("deep", { path: "a.b.c" }), 99);
  store.del("deep", { path: "a.b.c" });
  assertEquals(store.get("deep", { path: "a.b.c" }), undefined);
});

test("store: splitPath with single segment", async () => {
  const { store } = await fresh();
  store.set("flat", { x: 1 });
  assertEquals(store.get("flat", { path: "x" }), 1);
  store.set("flat", 2, { path: "x" });
  assertEquals(store.get("flat", { path: "x" }), 2);
});

test("store: splitPath with empty string path", async () => {
  const { store } = await fresh();
  store.set("e", { "": "found", a: 1 });
  assertEquals(store.get("e", { path: "" }), "found");
});

// ── keyed list reconciliation with hoisted getParentNS ───────────
test("keyed list: reorder after hoisted getParentNS", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-keyed-hoist"); let ref;
  let items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];
  define(tag, el2 => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.label}</li>`)}</ul>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();

  const lis = el.querySelectorAll("li");
  const domA = lis[0];
  const domB = lis[1];
  const domC = lis[2];

  // Reorder: c, a, b
  items = [items[2], items[0], items[1]];
  update(ref); await micro(); flush(); await delay(5);

  const after = el.querySelectorAll("li");
  assertEquals(after[0], domC);
  assertEquals(after[1], domA);
  assertEquals(after[2], domB);
  assertEquals(after.length, 3);
});

test("keyed list: add + remove with hoisted getParentNS", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-keyed-addrem"); let ref;
  let items = [{ id: "a" }, { id: "b" }];
  define(tag, el2 => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 2);

  // Add c, remove a
  items = [{ id: "b" }, { id: "c" }];
  update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 2);
  const ids = [...el.querySelectorAll("li")].map(n => n.textContent);
  assertEquals(ids.join(","), "b,c");
});

test("keyed list: mix keyed and unkeyed with hoisted getParentNS", async () => {
  setupDOM(); const { define, html, update, flush } = await fresh();
  const tag = uniqueTag("t-keyed-mix"); let ref;
  let items = [
    { id: 1, keyed: true },
    { text: "x", keyed: false },
    { id: 2, keyed: true },
  ];
  define(tag, el2 => {
    ref = el2;
    return () => html`<ul>${items.map(i => i.keyed
      ? html`<li key=${i.id}>${i.id}</li>`
      : html`<li>${i.text}</li>`
    )}</ul>`;
  });
  const el = document.createElement(tag); document.body.appendChild(el); await delay();
  assertEquals(el.querySelectorAll("li").length, 3);

  // Remove the unkeyed item and one keyed
  items = [{ id: 1, keyed: true }];
  update(ref); await micro(); flush(); await delay(5);
  assertEquals(el.querySelectorAll("li").length, 1);
  assertEquals(el.querySelector("li").textContent, "1");
});
