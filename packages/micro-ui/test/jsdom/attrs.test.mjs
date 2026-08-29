// Attribute → props semantics.
//
// Micro-UI has no automatic reactivity: nothing re-renders until update() is
// called. These tests pin both halves of that contract for attributes —
// changing one does NOT re-render on its own, and an explicit update() picks
// the change up rather than rendering the stale snapshot from connect time.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?attrs-${Date.now()}`
);

function uniqueTag(p) {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
async function mount(attrs = {}) {
  const tag = uniqueTag("x-attr");
  let renders = 0;
  let seen;
  define(tag, (_el, props) => {
    seen = props;
    return () => {
      renders++;
      return html`<b>${String(props.n)}</b>`;
    };
  });
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await tick();
  return { el, props: () => seen, renders: () => renders };
}

test("attrs: an external change alone does not re-render", async () => {
  const c = await mount({ n: "1" });
  assert.equal(c.el.textContent, "1");
  const before = c.renders();

  c.el.setAttribute("n", "2");
  await tick();
  await tick();

  assert.equal(c.renders(), before, "nothing re-renders on its own");
  assert.equal(c.el.textContent, "1");
});

test("attrs: an explicit update() picks up an external change", async () => {
  const c = await mount({ n: "1" });
  c.el.setAttribute("n", "2");
  update(c.el);
  await tick();
  assert.equal(c.el.textContent, "2", "update() must render current truth");
});

test("attrs: removing an attribute deletes the prop", async () => {
  const c = await mount({ n: "1" });
  c.el.removeAttribute("n");
  update(c.el);
  await tick();
  assert.equal("n" in c.props(), false, "a removed attribute is an absent prop");
  assert.equal(c.el.textContent, "undefined");
});

test("attrs: an attribute absent at connect is picked up later", async () => {
  const c = await mount({ n: "1" });
  assert.equal("label" in c.props(), false);
  c.el.setAttribute("label", "hello");
  update(c.el);
  await tick();
  assert.equal(c.props().label, "hello");
});

test("attrs: the props object identity is preserved", async () => {
  // setup() closed over this exact object; replacing it would strand the closure.
  const c = await mount({ n: "1" });
  const original = c.props();
  c.el.setAttribute("n", "2");
  update(c.el);
  await tick();
  assert.equal(c.props(), original, "props must be mutated in place");
  assert.equal(original.n, "2");
});

test("attrs: repeated updates with no attribute change render once each", async () => {
  const c = await mount({ n: "1" });
  const before = c.renders();
  update(c.el);
  await tick();
  update(c.el);
  await tick();
  assert.equal(c.renders(), before + 2, "no extra renders from the re-read");
});

test("attrs: values are read as strings, matching connect-time behaviour", async () => {
  const c = await mount({ n: "1" });
  c.el.setAttribute("n", "42");
  update(c.el);
  await tick();
  assert.equal(c.props().n, "42");
  assert.equal(typeof c.props().n, "string");
});

// ── the parent-driven path must be unaffected ──────────────────────
test("attrs: parent-driven attribute changes still propagate", async () => {
  let renders = 0;
  let label = "one";
  define("x-attr-child", (_el, props) => () => {
    renders++;
    return html`<i>${String(props.label)}</i>`;
  });
  define("x-attr-parent", () => () =>
    html`<x-attr-child label=${label}></x-attr-child>`);

  const el = document.createElement("x-attr-parent");
  document.body.appendChild(el);
  await tick();
  assert.equal(el.querySelector("x-attr-child").textContent, "one");
  assert.equal(renders, 1);

  label = "two";
  update(el);
  await tick();
  await tick();
  assert.equal(el.querySelector("x-attr-child").textContent, "two");
  assert.equal(renders, 2, "exactly one extra render, not two");
});

test("attrs: a nullish parent binding still does not re-render the child", async () => {
  // Guards the earlier props-sync fix against the re-read reintroducing churn.
  let renders = 0;
  let tickN = 0;
  const nothing = null;
  define("x-attr-null-child", (_el, props) => () => {
    renders++;
    return html`<i>${String(props.label ?? "-")}</i>`;
  });
  define("x-attr-null-parent", () => () =>
    html`<div>
      <x-attr-null-child data-x=${nothing} label="hi"></x-attr-null-child>
      <b>${String(tickN)}</b>
    </div>`);

  const el = document.createElement("x-attr-null-parent");
  document.body.appendChild(el);
  await tick();
  assert.equal(renders, 1);

  for (let i = 0; i < 3; i++) {
    tickN++;
    update(el);
    await tick();
    await tick();
  }
  assert.equal(renders, 1, "child attrs unchanged, so no re-render");
});
