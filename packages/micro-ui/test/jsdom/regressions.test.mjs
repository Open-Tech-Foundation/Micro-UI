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

// ── keyed reconcile must not build DOM it is about to discard ──────────────
// patchKeyed called materializeNode() on the incoming vnode before
// reconcile(), which then reused the matched node's DOM — so a full subtree
// was constructed and orphaned on every pass, for every matched row.
test("regression: patching a keyed list creates no throwaway elements", async () => {
  let items = Array.from({ length: 50 }, (_, i) => ({ id: i, n: i }));
  let ref;
  const el = await mount((host) => {
    ref = host;
    return () =>
      html`<ul>${items.map(
        (it) => html`<li key=${String(it.id)}><span><b>${String(it.n)}</b></span></li>`,
      )}</ul>`;
  });

  const real = document.createElement.bind(document);
  let created = 0;
  document.createElement = (t) => {
    created++;
    return real(t);
  };
  try {
    items = items.map((it) => (it.id === 7 ? { ...it, n: 999 } : it));
    update(ref);
    await tick();
  } finally {
    document.createElement = real;
  }

  assert.equal(created, 0, "reusing 50 keyed rows must allocate no elements");
  assert.equal(el.querySelectorAll("li").length, 50);
  assert.equal(el.querySelectorAll("li")[7].textContent, "999");
});

test("regression: reordering a keyed list creates no throwaway elements", async () => {
  let items = [1, 2, 3, 4, 5];
  let ref;
  const el = await mount((host) => {
    ref = host;
    return () =>
      html`<ul>${items.map((i) => html`<li key=${String(i)}>${String(i)}</li>`)}</ul>`;
  });
  const first = el.querySelector("li");

  const real = document.createElement.bind(document);
  let created = 0;
  document.createElement = (t) => {
    created++;
    return real(t);
  };
  try {
    items = [5, 4, 3, 2, 1];
    update(ref);
    await tick();
  } finally {
    document.createElement = real;
  }

  assert.equal(created, 0, "a pure reorder must move nodes, not rebuild them");
  assert.equal(
    [...el.querySelectorAll("li")].map((n) => n.textContent).join(""),
    "54321",
  );
  assert.equal(el.querySelectorAll("li")[4], first, "node identity is preserved");
});

test("regression: a keyed row that changes tag is replaced, not resurrected", async () => {
  // reconcile() replaces the DOM when tag differs and records the new node on
  // the incoming vnode. patchKeyed used to re-insert the OLD node afterwards.
  let asDiv = false;
  let ref;
  const el = await mount((host) => {
    ref = host;
    return () =>
      html`<section>${[
        asDiv
          ? html`<div key="a">A</div>`
          : html`<span key="a">A</span>`,
        html`<i key="b">B</i>`,
      ]}</section>`;
  });
  assert.equal(el.querySelector("section").children.length, 2);

  asDiv = true;
  update(ref);
  await tick();

  const kids = [...el.querySelector("section").children];
  assert.equal(kids.length, 2, "the replaced node must not linger alongside its replacement");
  assert.equal(kids[0].tagName, "DIV");
  assert.equal(kids[1].tagName, "I");
  assert.equal(el.querySelector("span"), null, "old node must be gone");
});

// ── nested components must not re-render when their attributes are unchanged ──
// The props-sync loop compared inst.props[k] against String(v) but stored
// `undefined` when v was nullish, so a nullish binding reported "changed" on
// every pass and re-rendered the child forever.
// Tag names are not a binding position, so these are fixed literals.
let nestedChildRenders = 0;
let nestedParentTick = 0;
const nothing = null;

define("x-reg-nested-child", (_el, props) => () => {
  nestedChildRenders++;
  return html`<i>${String(props.label ?? "-")}</i>`;
});
define("x-reg-nested-parent", () => () =>
  html`<div>
    <x-reg-nested-child data-x=${nothing} label="hi"></x-reg-nested-child>
    <b>${String(nestedParentTick)}</b>
  </div>`);

test("regression: nullish attr does not re-render a child on every parent update", async () => {
  const el = document.createElement("x-reg-nested-parent");
  document.body.appendChild(el);
  await tick();

  const child = el.querySelector("x-reg-nested-child");
  assert.ok(child, "child element must actually be in the tree");
  assert.equal(child.textContent, "hi", "child must actually have rendered");
  assert.equal(nestedChildRenders, 1);
  assert.equal(child.hasAttribute("data-x"), false, "nullish attr is removed");

  for (let i = 0; i < 3; i++) {
    nestedParentTick++;
    update(el);
    await tick();
    await tick();
  }

  assert.equal(el.querySelector("b").textContent, "3", "parent did re-render");
  assert.equal(
    nestedChildRenders,
    1,
    "child attributes never changed, so it must not re-render",
  );
});

test("regression: a child still re-renders when its attributes do change", async () => {
  let renders = 0;
  let label = "one";
  define("x-reg-sync-child", (_el, props) => () => {
    renders++;
    return html`<i>${String(props.label ?? "-")}</i>`;
  });
  define("x-reg-sync-parent", () => () =>
    html`<x-reg-sync-child label=${label}></x-reg-sync-child>`);

  const el = document.createElement("x-reg-sync-parent");
  document.body.appendChild(el);
  await tick();
  assert.equal(renders, 1);
  assert.equal(el.querySelector("x-reg-sync-child").textContent, "one");

  label = "two";
  update(el);
  await tick();
  await tick();
  assert.equal(renders, 2, "a real attribute change must still propagate");
  assert.equal(el.querySelector("x-reg-sync-child").textContent, "two");
});

// ── store path writes must preserve arrays ─────────────────────────────────
// setByPath/deleteByPath spread every container into an object literal, so
// [1,2,3] became {0:1,1:2,2:3} and the next `.map()` in a render threw.
const { store } = await import(`../../src/index.ts?regressions-store-${Date.now()}`);

test("regression: writing through an array path keeps it an array", () => {
  store.clear();
  store.set("s1", { list: [1, 2, 3] });
  store.set("s1", 9, { path: "list.0" });
  const v = store.get("s1");
  assert.ok(Array.isArray(v.list), "list must still be an array");
  assert.deepEqual(v.list, [9, 2, 3]);
});

test("regression: a top-level array value survives a path write", () => {
  store.clear();
  store.set("s2", [{ n: 1 }, { n: 2 }]);
  store.set("s2", 42, { path: "1.n" });
  const v = store.get("s2");
  assert.ok(Array.isArray(v));
  assert.deepEqual(v, [{ n: 1 }, { n: 42 }]);
});

test("regression: nested arrays survive a deep path write", () => {
  store.clear();
  store.set("s3", { a: { b: [{ c: 1 }] } });
  store.set("s3", 2, { path: "a.b.0.c" });
  assert.ok(Array.isArray(store.get("s3").a.b));
  assert.equal(store.get("s3").a.b[0].c, 2);
});

test("regression: deleting an array index splices instead of leaving a hole", () => {
  store.clear();
  store.set("s4", { list: ["a", "b", "c"] });
  store.del("s4", { path: "list.1" });
  const list = store.get("s4").list;
  assert.ok(Array.isArray(list));
  assert.deepEqual(list, ["a", "c"]);
  assert.equal(list.length, 2, "no sparse hole left behind");
});

test("regression: path writes are still immutable at every level", () => {
  store.clear();
  const original = { list: [1, 2, 3] };
  store.set("s5", original);
  store.set("s5", 9, { path: "list.0" });
  assert.deepEqual(original.list, [1, 2, 3], "the caller's array is untouched");
});

// ── clear() must not orphan live subscriptions ─────────────────────────────
test("regression: subscribers still fire after store.clear()", () => {
  store.clear();
  const seen = [];
  const off = store.subscribe("s6", (v) => seen.push(v));
  store.set("s6", 1);
  store.clear();
  store.set("s6", 2);
  assert.deepEqual(seen, [1, undefined, 2], "clear notifies, then stays live");
  off();
  store.set("s6", 3);
  assert.equal(seen.length, 3, "unsubscribe still works");
});

test("regression: clear() drops entries that nobody is subscribed to", () => {
  store.clear();
  store.set("s7", "value");
  store.clear();
  assert.equal(store.get("s7"), undefined);
});
