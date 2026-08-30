// `props` holds attributes, and attributes are strings. Binding an object or a
// function to a child component therefore cannot go through `props` — setProp
// writes it as a DOM property instead, which is exactly how the platform
// separates the two. That half worked: the property was set, but the child had
// no way to learn it had changed, because the props-sync loop stringified the
// binding to "[object Object]", which compares equal on every pass.
//
// Tag names are written literally throughout: a tag name cannot be
// interpolated, since each template is parsed once with a marker where the
// ${...} sits. They carry an rp- prefix so they cannot collide with the other
// suites, which share one custom element registry.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?rich-${Date.now()}`
);

function tick() {
  return new Promise((r) => queueMicrotask(r));
}
async function mountHost(tag) {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  await tick();
  return el;
}

// ── a child reads a non-string binding as a DOM property ───────────────────

let atSetup;
define("rp-early", (el) => {
  atSetup = { data: el.data, save: typeof el.save };
  return () => html`<i>x</i>`;
});
define(
  "rp-early-host",
  () => () =>
    html`<div><rp-early data=${{ n: 1 }} save=${() => 42}></rp-early></div>`,
);

test("props: object and function bindings are set before the child's setup runs", async () => {
  await mountHost("rp-early-host");
  assert.deepEqual(atSetup.data, { n: 1 }, "the object was there at setup");
  assert.equal(atSetup.save, "function", "so was the callback");
});

let cbChild;
define("rp-cb", (el) => {
  cbChild = el;
  return () => html`<i>x</i>`;
});
const got = [];
define(
  "rp-cb-host",
  () => () => html`<div><rp-cb save=${(v) => got.push(v)}></rp-cb></div>`,
);

test("props: a callback binding can be invoked by the child", async () => {
  await mountHost("rp-cb-host");
  cbChild.save("from the child");
  assert.deepEqual(got, ["from the child"]);
});

// ── the child re-renders when the object behind it changes ─────────────────

let updRenders = 0;
define("rp-upd", (el) => () => {
  updRenders++;
  return html`<i>${el.data ? String(el.data.n) : "-"}</i>`;
});
let updData = { n: 1 };
let updRef;
define("rp-upd-host", (el) => {
  updRef = el;
  return () => html`<div><rp-upd data=${updData}></rp-upd></div>`;
});

test("props: replacing the object re-renders the child, every time", async () => {
  const el = await mountHost("rp-upd-host");
  assert.equal(el.textContent, "1");

  // Twice on purpose. Stringifying the binding used to write "[object Object]"
  // into props on the first sync — which looked like a change, because props
  // had no such key yet — and then compared equal forever after. So the first
  // change appeared to work and every change after it was dropped.
  for (const n of [2, 3]) {
    const before = updRenders;
    updData = { n };
    update(updRef);
    await tick();
    await tick();
    assert.ok(updRenders > before, `child re-rendered for n=${n}`);
    assert.equal(el.textContent, String(n), `child saw n=${n}`);
  }
});

let sameRenders = 0;
define("rp-same", (el) => () => {
  sameRenders++;
  return html`<i>${el.data ? String(el.data.n) : "-"}</i>`;
});
const stableData = { n: 1 };
let sameLabel = "a";
let sameRef;
define("rp-same-host", (el) => {
  sameRef = el;
  return () =>
    html`<div><span>${sameLabel}</span><rp-same data=${stableData}></rp-same></div>`;
});

test("props: handing back the same object does not re-render the child", async () => {
  const el = await mountHost("rp-same-host");
  const before = sameRenders;

  sameLabel = "b";
  update(sameRef);
  await tick();
  await tick();

  assert.equal(el.querySelector("span").textContent, "b", "the parent updated");
  assert.equal(sameRenders, before, "but the child was left alone");
});

// ── props stays a string map ───────────────────────────────────────────────

let cleanProps;
define("rp-clean", (_el, props) => {
  cleanProps = props;
  return () => html`<i>x</i>`;
});
let cleanData = { n: 1 };
let cleanRef;
define("rp-clean-host", (el) => {
  cleanRef = el;
  return () =>
    html`<div><rp-clean name="ada" data=${cleanData}></rp-clean></div>`;
});

test("props: an object binding never lands in props as [object Object]", async () => {
  await mountHost("rp-clean-host");

  cleanData = { n: 2 };
  update(cleanRef);
  await tick();
  await tick();

  assert.equal(cleanProps.name, "ada", "string attributes still arrive");
  assert.ok(
    !("data" in cleanProps),
    `props must not carry the object, got: ${JSON.stringify(cleanProps)}`,
  );
  for (const v of Object.values(cleanProps))
    assert.equal(typeof v, "string", "props is a string map");
});

define("rp-str", (_el, props) => () => html`<i>${props.label ?? "-"}</i>`);
let strLabel = "one";
let strRef;
define("rp-str-host", (el) => {
  strRef = el;
  return () => html`<div><rp-str label=${strLabel}></rp-str></div>`;
});

test("props: string bindings still update the child as before", async () => {
  const el = await mountHost("rp-str-host");
  assert.equal(el.textContent, "one");

  strLabel = "two";
  update(strRef);
  await tick();
  await tick();
  assert.equal(el.textContent, "two");
});

let arrRenders = 0;
define("rp-arr", (el) => () => {
  arrRenders++;
  return html`<i>${el.rows ? String(el.rows.length) : "-"}</i>`;
});
let arrRows = [1, 2];
let arrRef;
define("rp-arr-host", (el) => {
  arrRef = el;
  return () => html`<div><rp-arr rows=${arrRows}></rp-arr></div>`;
});

test("props: an array binding behaves like an object binding", async () => {
  const el = await mountHost("rp-arr-host");
  assert.equal(el.textContent, "2");
  const before = arrRenders;

  arrRows = [1, 2, 3];
  update(arrRef);
  await tick();
  await tick();
  assert.ok(arrRenders > before);
  assert.equal(el.textContent, "3");
});

// ── the limitation that made all of this necessary ─────────────────────────

test("props: a tag name cannot be interpolated", async () => {
  // Each template is parsed once, so a ${...} in tag position is not a tag —
  // it is text. Worth pinning: it is the first thing someone generating code
  // reaches for, and it fails quietly rather than loudly.
  define("rp-taginterp", () => () => html`<${"rp-str"}></${"rp-str"}>`);
  const el = await mountHost("rp-taginterp");
  assert.equal(el.querySelector("rp-str"), null);
  assert.match(el.textContent, /rp-str/, "it renders as text instead");
});

// ── callbacks are read when called, not when the child renders ─────────────

let freshRenders = 0;
define("rp-fresh", (el) => () => {
  freshRenders++;
  return html`<i>x</i>`;
});
let freshChild;
let freshSeq = 0;
let freshRef;
const freshCalls = [];
define("rp-fresh-host", (el) => {
  freshRef = el;
  return () => {
    const n = freshSeq;
    return html`<div><rp-fresh save=${() => freshCalls.push(n)}></rp-fresh></div>`;
  };
});

test("props: a fresh callback closure does not re-render the child", async () => {
  const el = await mountHost("rp-fresh-host");
  freshChild = el.querySelector("rp-fresh");
  const before = freshRenders;

  // Three parent renders, each producing a brand new arrow function.
  for (let i = 0; i < 3; i++) {
    freshSeq++;
    update(freshRef);
    await tick();
    await tick();
  }

  assert.equal(
    freshRenders,
    before,
    "a callback the child has not called is no reason to re-render it",
  );
});

test("props: calling the callback runs the newest closure", async () => {
  freshChild.save();
  assert.deepEqual(freshCalls, [3], "the latest render's closure, not a stale one");
});
