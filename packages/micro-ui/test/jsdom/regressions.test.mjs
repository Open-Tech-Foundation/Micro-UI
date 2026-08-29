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

// ── clearing an attribute must not re-add it as the string "undefined" ──────
// setProp used to follow removeAttribute() with a property write of
// `undefined`. Reflected non-nullable DOMString properties stringify that,
// re-creating the attribute that was just removed. Only a real DOM shows
// this — the fake DOM in test/helpers/dom.mjs does not reflect properties.
async function clearsCleanly(name, initial, render, sel, attr) {
  test(`regression: clearing ${name} removes it, not "undefined"`, async () => {
    const box = { v: initial };
    let ref;
    const el = await mount((host) => {
      ref = host;
      return () => render(box.v);
    });
    const node = el.querySelector(sel);
    assert.equal(node.getAttribute(attr), initial);

    box.v = null;
    update(ref);
    await tick();
    assert.equal(
      node.getAttribute(attr),
      null,
      `${attr} must be absent, not the string "undefined"`,
    );
    assert.equal(node.hasAttribute(attr), false);
  });
}

clearsCleanly("div[title]", "hi", (v) => html`<div title=${v}>x</div>`, "div", "title");
clearsCleanly("div[id]", "one", (v) => html`<div id=${v}>x</div>`, "div", "id");
clearsCleanly("div[lang]", "en", (v) => html`<div lang=${v}>x</div>`, "div", "lang");
clearsCleanly("img[src]", "/a.png", (v) => html`<img src=${v}>`, "img", "src");
clearsCleanly("img[alt]", "pic", (v) => html`<img alt=${v}>`, "img", "alt");
clearsCleanly("a[href]", "/x", (v) => html`<a href=${v}>l</a>`, "a", "href");
clearsCleanly("input[placeholder]", "type here", (v) => html`<input placeholder=${v}>`, "input", "placeholder");
clearsCleanly("input[name]", "field", (v) => html`<input name=${v}>`, "input", "name");
clearsCleanly("div[aria-hidden]", "true", (v) => html`<div aria-hidden=${v}>x</div>`, "div", "aria-hidden");

test("regression: a cleared img[src] issues no request for '/undefined'", async () => {
  const box = { v: "/a.png" };
  let ref;
  const el = await mount((host) => {
    ref = host;
    return () => html`<img src=${box.v}>`;
  });
  box.v = null;
  update(ref);
  await tick();
  const img = el.querySelector("img");
  assert.equal(img.getAttribute("src"), null);
  assert.notEqual(img.getAttribute("src"), "undefined");
});
