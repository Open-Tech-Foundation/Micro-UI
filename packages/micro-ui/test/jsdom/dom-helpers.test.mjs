// jsdom tests for dom.ts helpers: addListener, removeListener, setElProp, setProp
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update, flush, store } = await import(
  `../../src/index.ts?jsdom-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function tick() {
  return new Promise((r) => queueMicrotask(r));
}

// ── setProp: value ────────────────────────────────────────────────
test("jsdom setProp: value null clears input.value", async () => {
  const tag = uniqueTag("x-sp-val-null");
  define(tag, (el) => {
    let val = "hi";
    el._setNull = () => { val = null; update(el); };
    return () => html`<input value=${val}>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const inp = el.querySelector("input");
  assert.equal(inp.value, "hi");
  el._setNull();
  await tick(); flush();
  assert.equal(inp.value, "");
  assert.equal(inp.getAttribute("value"), null);
});

test("jsdom setProp: value string sets both .value and attribute", async () => {
  const tag = uniqueTag("x-sp-val-str");
  define(tag, () => () => html`<input value=${"test"}>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const inp = el.querySelector("input");
  assert.equal(inp.value, "test");
  assert.equal(inp.getAttribute("value"), "test");
});

test("jsdom setProp: value number coerces to string", async () => {
  const tag = uniqueTag("x-sp-val-num");
  define(tag, () => () => html`<input value=${42}>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const inp = el.querySelector("input");
  assert.equal(inp.value, "42");
  assert.equal(inp.getAttribute("value"), "42");
});

// ── setProp: boolean props ────────────────────────────────────────
test("jsdom setProp: disabled false removes attribute on real DOM", async () => {
  const tag = uniqueTag("x-sp-dis-false");
  define(tag, (el) => {
    let dis = true;
    el._toggle = () => { dis = !dis; update(el); };
    return () => html`<button disabled=${dis}>x</button>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const btn = el.querySelector("button");
  assert.equal(btn.hasAttribute("disabled"), true);
  el._toggle();
  await tick(); flush();
  assert.equal(btn.hasAttribute("disabled"), false);
});

test("jsdom setProp: checked toggle on real checkbox", async () => {
  const tag = uniqueTag("x-sp-chk-real");
  define(tag, (el) => {
    let c = true;
    el._toggle = () => { c = !c; update(el); };
    return () => html`<input type="checkbox" checked=${c}>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const inp = el.querySelector("input");
  assert.equal(inp.checked, true);
  el._toggle();
  await tick(); flush();
  assert.equal(inp.checked, false);
});

test("jsdom setProp: selected boolean reflects .selected and attribute", async () => {
  const tag = uniqueTag("x-sp-selected");
  define(tag, () => () => html`<select><option selected=${true}>a</option></select>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const opt = el.querySelector("option");
  assert.equal(opt.selected, true);
  assert.equal(opt.hasAttribute("selected"), true);
});

test("jsdom setProp: indeterminate boolean sets .indeterminate", async () => {
  const tag = uniqueTag("x-sp-indeterminate");
  define(tag, () => () => html`<input type="checkbox" indeterminate=${true}>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("input").indeterminate, true);
});

// ── setProp: ARIA ─────────────────────────────────────────────────
test("jsdom setProp: aria-hidden true/false on real DOM", async () => {
  const tag = uniqueTag("x-sp-aria-real");
  define(tag, (el) => {
    let h = true;
    el._flip = () => { h = !h; update(el); };
    return () => html`<div aria-hidden=${h}>x</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "true");
  el._flip();
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "false");
});

test("jsdom setProp: aria-hidden null removes attribute on update", async () => {
  const tag = uniqueTag("x-sp-aria-null");
  let val = true;
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<div aria-hidden=${val}>x</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "true");
  val = null;
  update(ref);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), null);
});

test("jsdom setProp: role attribute is set", async () => {
  const tag = uniqueTag("x-sp-role");
  define(tag, () => () => html`<div role="button">x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("role"), "button");
});

test("jsdom setProp: aria numeric value stringifies", async () => {
  const tag = uniqueTag("x-sp-aria-num");
  define(tag, () => () => html`<div aria-valuenow=${42}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("aria-valuenow"), "42");
});

// ── setProp: generic attrs ────────────────────────────────────────
test("jsdom setProp: null removes class attribute", async () => {
  const tag = uniqueTag("x-sp-class-null");
  define(tag, (el) => {
    let c = "active";
    el._clear = () => { c = null; update(el); };
    return () => html`<div class=${c}>x</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("class"), "active");
  el._clear();
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("class"), null);
});

test("jsdom setProp: true sets hidden via the BOOLEAN_PROPS path", async () => {
  const tag = uniqueTag("x-sp-hidden");
  define(tag, () => () => html`<div hidden=${true}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const div = el.querySelector("div");
  assert.equal(div.hasAttribute("hidden"), true);
  assert.equal(div.hidden, true, "boolean prop must reflect to the property");
});

test("jsdom setProp: true on a non-boolean attr takes the generic branch", async () => {
  const tag = uniqueTag("x-sp-generic-true");
  define(tag, () => () => html`<div data-flag=${true}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("data-flag"), "");
});

test("jsdom setProp: false removes generic attribute on update", async () => {
  const tag = uniqueTag("x-sp-gen-false");
  let t = "hi";
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<div title=${t}>x</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("title"), "hi");
  t = false;
  update(ref);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("title"), null);
});

test("jsdom setProp: number value stringifies in a generic attribute", async () => {
  const tag = uniqueTag("x-sp-generic-num");
  define(tag, () => () => html`<div data-count=${42}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").getAttribute("data-count"), "42");
});

// ── event listeners survive reconciliation ────────────────────────
test("jsdom setProp: addListener fires after keyed reorder", async () => {
  const tag = uniqueTag("x-sp-evt-reorder");
  let items = [
    { id: "a", count: 0 },
    { id: "b", count: 0 },
  ];
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`
      <ul>${items.map((i) =>
        html`<li key=${i.id}><button onclick=${() => { i.count++; update(el); }}>${i.count}</button></li>`
      )}</ul>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();

  const btns = el.querySelectorAll("button");
  btns[0].click();
  await tick(); flush();
  assert.equal(btns[0].textContent, "1");

  // Reorder
  items = [items[1], items[0]];
  update(ref);
  await tick(); flush();

  const afterBtns = el.querySelectorAll("button");
  // Same DOM nodes, listeners still work
  afterBtns[1].click();
  await tick(); flush();
  assert.equal(afterBtns[1].textContent, "2");
});

test("jsdom setProp: removeListener detaches old handler on update", async () => {
  const tag = uniqueTag("x-sp-remove-listener");
  let calls = [];
  let fn = () => calls.push("a");
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<button onclick=${fn}>go</button>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();

  el.querySelector("button").click();
  assert.deepEqual(calls, ["a"]);

  fn = () => calls.push("b");
  update(ref);
  await tick(); flush();

  el.querySelector("button").click();
  assert.deepEqual(calls, ["a", "b"]);
});

// ── keyed list reconciliation with hoisted getParentNS ───────────
test("jsdom keyed list: reorder after hoisted getParentNS", async () => {
  const tag = uniqueTag("x-keyed-hoist");
  let items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<ul>${items.map((i) => html`<li key=${i.id}>${i.label}</li>`)}</ul>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();

  const domA = el.querySelectorAll("li")[0];
  const domB = el.querySelectorAll("li")[1];
  const domC = el.querySelectorAll("li")[2];

  // Reorder: c, a, b
  items = [items[2], items[0], items[1]];
  update(ref);
  await tick(); flush();

  const after = el.querySelectorAll("li");
  assert.equal(after[0], domC);
  assert.equal(after[1], domA);
  assert.equal(after[2], domB);
  assert.equal(after.length, 3);
});

test("jsdom keyed list: add + remove with hoisted getParentNS", async () => {
  const tag = uniqueTag("x-keyed-addrem");
  let items = [{ id: "a" }, { id: "b" }];
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<ul>${items.map((i) => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelectorAll("li").length, 2);

  // Add c, remove a
  items = [{ id: "b" }, { id: "c" }];
  update(ref);
  await tick(); flush();
  assert.equal(el.querySelectorAll("li").length, 2);
  assert.equal([...el.querySelectorAll("li")].map((n) => n.textContent).join(","), "b,c");
});

test("jsdom keyed list: mix keyed and unkeyed with hoisted getParentNS", async () => {
  const tag = uniqueTag("x-keyed-mix");
  let items = [
    { id: 1, keyed: true },
    { text: "x", keyed: false },
    { id: 2, keyed: true },
  ];
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`<ul>${items.map((i) =>
      i.keyed
        ? html`<li key=${i.id}>${i.id}</li>`
        : html`<li>${i.text}</li>`
    )}</ul>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelectorAll("li").length, 3);

  // Remove the unkeyed item and one keyed
  items = [{ id: 1, keyed: true }];
  update(ref);
  await tick(); flush();
  assert.equal(el.querySelectorAll("li").length, 1);
  assert.equal(el.querySelector("li").textContent, "1");
});

// ── store splitPath through public API ────────────────────────────
test("jsdom store: deeply nested path set/get/delete", async () => {
  store.clear();
  store.set("d", { a: { b: { c: 1 } } });
  assert.equal(store.get("d", { path: "a.b.c" }), 1);
  store.set("d", 99, { path: "a.b.c" });
  assert.equal(store.get("d", { path: "a.b.c" }), 99);
  store.del("d", { path: "a.b.c" });
  assert.equal(store.get("d", { path: "a.b.c" }), undefined);
});

test("jsdom store: path-based subscribe fires on nested update", async () => {
  store.clear();
  store.set("form", { name: "", age: 0 });
  let snap = null;
  store.subscribe("form", (v) => { snap = v; });
  store.set("form", "Alice", { path: "name" });
  assert.equal(snap.name, "Alice");
  assert.equal(snap.age, 0);
});

test("jsdom store: empty string path", async () => {
  store.clear();
  store.set("e", { "": "found", a: 1 });
  assert.equal(store.get("e", { path: "" }), "found");
});

test("jsdom store: single segment path", async () => {
  store.clear();
  store.set("flat", { x: 1 });
  assert.equal(store.get("flat", { path: "x" }), 1);
  store.set("flat", 2, { path: "x" });
  assert.equal(store.get("flat", { path: "x" }), 2);
});

// ── additional ports from micro-ui.setprop.test.mjs (complete coverage) ─────
test("jsdom setProp: value property syncs .value and attribute (port)", async () => {
  const tag = uniqueTag("x-sp-val-sync");
  const mod = await import(`../../src/index.ts?sp-val-sync-${Date.now()}-${Math.random()}`);
  let val = "hello"; let ref;
  mod.define(tag, el2 => { ref = el2; return () => mod.html`<input value=${val}>`; });
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  const inp = el.querySelector("input");
  assert.equal(inp.value, "hello");
  assert.equal(inp.getAttribute("value"), "hello");
  val = "world"; mod.update(ref); await tick(); mod.flush();
  assert.equal(inp.value, "world");
  assert.equal(inp.getAttribute("value"), "world");
});

test("jsdom setProp: disabled true sets attribute and .disabled (port)", async () => {
  const tag = uniqueTag("x-sp-dis-true");
  const mod = await import(`../../src/index.ts?sp-dis-true-${Date.now()}-${Math.random()}`);
  mod.define(tag, () => () => mod.html`<button disabled=${true}>x</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  const btn = el.querySelector("button");
  assert.equal(btn.hasAttribute("disabled"), true);
  assert.equal(btn.disabled, true);
});

test("jsdom setProp: string value sets attribute (port)", async () => {
  const tag = uniqueTag("x-sp-str-port");
  const mod = await import(`../../src/index.ts?sp-str-${Date.now()}-${Math.random()}`);
  mod.define(tag, () => () => mod.html`<div class="foo bar">x</div>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  assert.equal(el.querySelector("div").getAttribute("class"), "foo bar");
});

test("jsdom setProp: onclick handler fires after reconciliation (port)", async () => {
  const mod = await import(`../../src/index.ts?sp-evt-${Date.now()}-${Math.random()}`);
  const tag = uniqueTag("x-sp-evt-port");
  let count = 0;
  mod.define(tag, el2 => () => mod.html`<button onclick=${() => { count++; mod.update(el2); }}>${count}</button>`);
  const el = document.createElement(tag); document.body.appendChild(el); await tick(); mod.flush();
  el.querySelector("button").click(); await tick(); mod.flush();
  assert.equal(el.querySelector("button").textContent, "1");
  el.querySelector("button").click(); await tick(); mod.flush();
  assert.equal(el.querySelector("button").textContent, "2");
});

test("jsdom store: splitPath works for deeply nested get/set/delete (port)", async () => {
  const { store } = await import(`../../src/index.ts?sp-split-${Date.now()}-${Math.random()}`);
  store.clear();
  store.set("deep", { a: { b: { c: 1 } } });
  assert.equal(store.get("deep", { path: "a.b.c" }), 1);
  store.set("deep", 99, { path: "a.b.c" });
  assert.equal(store.get("deep", { path: "a.b.c" }), 99);
  store.del("deep", { path: "a.b.c" });
  assert.equal(store.get("deep", { path: "a.b.c" }), undefined);
});

test("jsdom store: splitPath with single segment (port)", async () => {
  const { store } = await import(`../../src/index.ts?sp-single-${Date.now()}-${Math.random()}`);
  store.clear();
  store.set("flat", { x: 1 });
  assert.equal(store.get("flat", { path: "x" }), 1);
  store.set("flat", 2, { path: "x" });
  assert.equal(store.get("flat", { path: "x" }), 2);
});

test("jsdom store: splitPath with empty string path (port)", async () => {
  const { store } = await import(`../../src/index.ts?sp-empty-${Date.now()}-${Math.random()}`);
  store.clear();
  store.set("e", { "": "found", a: 1 });
  assert.equal(store.get("e", { path: "" }), "found");
});

// ── setElProp through integration ─────────────────────────────────
test("jsdom setProp: non-primitive value is written as a property, not an attribute", async () => {
  const tag = uniqueTag("x-sp-elprop");
  // A string value takes the plain setAttribute branch and never reaches
  // setElProp; an object is what actually exercises it.
  const payload = { a: 1 };
  define(tag, () => () => html`<div data-obj=${payload}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const div = el.querySelector("div");
  assert.equal(div["data-obj"], payload, "setElProp writes the raw value");
  assert.equal(div.getAttribute("data-obj"), null, "objects do not stringify to an attribute");
});
