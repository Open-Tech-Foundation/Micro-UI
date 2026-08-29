// Regression tests for bugs found in review. Each test names the symptom a
// user would report, and runs against a real DOM (jsdom) — the fake DOM in
// test/helpers/dom.mjs cannot observe attribute/property reflection or text
// node serialization, which is what most of these bugs live in.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?regressions-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
async function mount(render) {
  const tag = uniqueTag("x-reg");
  define(tag, render);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  return el;
}

// ── text interpolation must not be double-encoded ──────────────────────────
test("regression: '&' in interpolated text is not rendered as '&amp;'", async () => {
  const el = await mount(() => () => html`<p>${"Tom & Jerry"}</p>`);
  assert.equal(el.querySelector("p").textContent, "Tom & Jerry");
  assert.equal(el.innerHTML, "<p>Tom &amp; Jerry</p>");
});

test("regression: '<' in interpolated text is not rendered as '&lt;'", async () => {
  const el = await mount(() => () => html`<b>${"5 < 10"}</b>`);
  assert.equal(el.querySelector("b").textContent, "5 < 10");
});

test("regression: apostrophes and quotes survive interpolation", async () => {
  const el = await mount(() => () => html`<p>${`it's "fine"`}</p>`);
  assert.equal(el.querySelector("p").textContent, `it's "fine"`);
});

test("regression: text updates through reconcile stay unencoded", async () => {
  let v = "a & b";
  const el = await mount(() => () => html`<p>${v}</p>`);
  assert.equal(el.querySelector("p").textContent, "a & b");
  v = "c < d & e";
  update(el);
  await tick();
  assert.equal(el.querySelector("p").textContent, "c < d & e");
});

test("regression: interpolated markup is still inert (not parsed)", async () => {
  const payload = '<img src=x onerror="globalThis.__pwned=1">';
  const el = await mount(() => () => html`<p>${payload}</p>`);
  assert.equal(el.querySelector("img"), null, "must not create elements");
  assert.equal(globalThis.__pwned, undefined, "must not execute");
  assert.equal(el.querySelector("p").textContent, payload, "shown verbatim");
});
