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

test("jsdom setProp: true sets empty string for hidden", async () => {
  const tag = uniqueTag("x-sp-hidden");
  define(tag, () => () => html`<div hidden=${true}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("div").hasAttribute("hidden"), true);
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

// ── setElProp through integration ─────────────────────────────────
test("jsdom setProp: setElProp sets custom property on element", async () => {
  const tag = uniqueTag("x-sp-elprop");
  define(tag, () => () => html`<div data-custom=${"val"}>x</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const div = el.querySelector("div");
  // setElProp should have set it as a JS property (even if browser ignores it)
  assert.equal(div.getAttribute("data-custom"), "val");
});
