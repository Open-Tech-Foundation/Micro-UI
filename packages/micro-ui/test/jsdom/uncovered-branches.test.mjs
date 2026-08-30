// The branches no other test file reaches.
//
// Whole-suite coverage cannot be read directly: every file imports the library
// with a cache-busting query so it gets its own module state, and the reporter
// only ever sees one of those instances. Intersecting the per-file runs gives
// the real picture, and this file closes what that left: a text vnode as the
// whole tree, the namespace-correction path that rebuilds an element and has
// to carry its handlers and text across, an EventListenerObject handler, an
// object bound to an SVG attribute, and the three prop-deletion branches.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?uncovered-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
async function mount(render) {
  const tag = uniqueTag("x-unc");
  let ref;
  define(tag, (el) => {
    ref = el;
    return render(el);
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  return { el, rerender: () => update(ref) };
}

// ── a render whose whole tree is one text node ─────────────────────────────

test("branches: a render returning a bare text vnode mounts it", async () => {
  // html`` always produces a fragment, so this only happens when a render
  // hands back a text vnode directly — which resolveBinding accepts as a value.
  const { el } = await mount(() => () => ({ type: "text", value: "just text" }));
  assert.equal(el.textContent, "just text");
  assert.equal(el.firstChild.nodeType, 3, "a real text node, not an element");
});

test("branches: a bare text vnode re-renders in place", async () => {
  let n = 0;
  const { el, rerender } = await mount(() => () => ({
    type: "text",
    value: `n=${n}`,
  }));
  const node = el.firstChild;
  n = 1;
  rerender();
  await tick();
  assert.equal(el.textContent, "n=1");
  assert.equal(el.firstChild, node, "patched, not replaced");
});

// ── namespace correction rebuilding an element ─────────────────────────────

test("branches: an element moved into SVG keeps its handler and text", async () => {
  // correctVNodeNS recreates the element in the right namespace and has to
  // carry the listeners and any not-yet-materialised text children over.
  let inSvg = false;
  const hits = [];
  const { el, rerender } = await mount(
    () => () =>
      inSvg
        ? html`<svg viewBox="0 0 10 10">${html`<a onclick=${() => hits.push("hit")}>label</a>`}</svg>`
        : html`<div>${html`<a onclick=${() => hits.push("hit")}>label</a>`}</div>`,
  );
  assert.equal(el.querySelector("a").namespaceURI, "http://www.w3.org/1999/xhtml");

  inSvg = true;
  rerender();
  await tick();

  const a = el.querySelector("a");
  assert.equal(a.namespaceURI, "http://www.w3.org/2000/svg", "rebuilt in SVG");
  assert.equal(a.textContent, "label", "its text came across");
  a.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.deepEqual(hits, ["hit"], "and so did its handler");
});

// ── an EventListenerObject as a handler ────────────────────────────────────

test("branches: a handler object with handleEvent is called", async () => {
  // addEventListener accepts { handleEvent }, so the dispatcher has to as well.
  const seen = [];
  const listener = {
    handleEvent(e) {
      seen.push(e.type);
    },
  };
  const { el } = await mount(
    () => () => html`<button onclick=${listener}>go</button>`,
  );
  el.querySelector("button").dispatchEvent(
    new window.Event("click", { bubbles: true }),
  );
  assert.deepEqual(seen, ["click"]);
});

test("branches: a handler object can be swapped for a function", async () => {
  const seen = [];
  let handler = {
    handleEvent() {
      seen.push("object");
    },
  };
  const { el, rerender } = await mount(
    () => () => html`<button onclick=${handler}>go</button>`,
  );
  const click = () =>
    el
      .querySelector("button")
      .dispatchEvent(new window.Event("click", { bubbles: true }));
  click();

  handler = () => seen.push("function");
  rerender();
  await tick();
  click();

  assert.deepEqual(seen, ["object", "function"]);
});

// ── a non-primitive bound to an SVG attribute ──────────────────────────────

test("branches: an object bound to an SVG attribute is stringified", async () => {
  // SVG attributes are attribute-only — there is no property to write to — so
  // a non-primitive has to be stringified rather than dropped.
  const value = {
    toString() {
      return "M0 0 L10 10";
    },
  };
  const { el } = await mount(
    () => () => html`<svg viewBox="0 0 10 10"><path d=${value}></path></svg>`,
  );
  assert.equal(el.querySelector("path").getAttribute("d"), "M0 0 L10 10");
});

// ── props being removed from a child ───────────────────────────────────────

test("branches: a prop whose binding goes nullish is deleted", async () => {
  const child = uniqueTag("x-unc-kid");
  const snapshots = [];
  define(child, (_el, props) => () => {
    snapshots.push({ ...props });
    return html`<i>${props.label ?? "none"}</i>`;
  });
  const host = uniqueTag("x-unc-host");
  let label = "here";
  let ref;
  define(host, (el) => {
    ref = el;
    const tag = child;
    return () => html`<div>${html`<${tag}></${tag}>`}</div>`;
  });
  // Tag names cannot be interpolated, so build the child through the DOM and
  // drive its props by attribute instead.
  const el = document.createElement(child);
  el.setAttribute("label", "here");
  document.body.appendChild(el);
  await tick();
  assert.equal(el.textContent, "here");

  el.removeAttribute("label");
  update(el);
  await tick();
  assert.equal(el.textContent, "none", "the prop was dropped, not stale");
  void label;
  void ref;
});

test("branches: a nullish binding removes the child's prop", async () => {
  const child = "unc-null-kid";
  const seen = [];
  define(child, (_el, props) => () => {
    seen.push("label" in props);
    return html`<i>${props.label ?? "-"}</i>`;
  });
  let label = "x";
  let ref;
  define("unc-null-host", (el) => {
    ref = el;
    return () => html`<div><unc-null-kid label=${label}></unc-null-kid></div>`;
  });
  const el = document.createElement("unc-null-host");
  document.body.appendChild(el);
  await tick();
  await tick();
  assert.equal(el.textContent, "x");

  label = null;
  update(ref);
  await tick();
  await tick();
  assert.equal(el.textContent, "-", "nullish binding cleared the prop");
  assert.equal(seen.at(-1), false, "and the key is gone, not undefined");
});

test("branches: an attribute dropped from the template removes the prop", async () => {
  const child = "unc-drop-kid";
  define(child, (_el, props) => () => html`<i>${props.label ?? "-"}</i>`);
  let withLabel = true;
  let ref;
  define("unc-drop-host", (el) => {
    ref = el;
    return () =>
      withLabel
        ? html`<div><unc-drop-kid label="here"></unc-drop-kid></div>`
        : html`<div><unc-drop-kid></unc-drop-kid></div>`;
  });
  const el = document.createElement("unc-drop-host");
  document.body.appendChild(el);
  await tick();
  await tick();
  assert.equal(el.textContent, "here");

  withLabel = false;
  update(ref);
  await tick();
  await tick();
  assert.equal(el.textContent, "-", "the removed attribute removed the prop");
});

test("branches: an object binding replaced by a string swaps channels", async () => {
  // The object lives on the element as a property and never in props; a string
  // lives in props. Going from one to the other has to clear the other side.
  const child = "unc-swap-kid";
  define(child, (el, props) => () => {
    const v = props.data ?? (el.data ? `obj:${el.data.n}` : "-");
    return html`<i>${v}</i>`;
  });
  let data = { n: 1 };
  let ref;
  define("unc-swap-host", (el) => {
    ref = el;
    return () => html`<div><unc-swap-kid data=${data}></unc-swap-kid></div>`;
  });
  const el = document.createElement("unc-swap-host");
  document.body.appendChild(el);
  await tick();
  await tick();
  assert.equal(el.textContent, "obj:1");

  data = "plain";
  update(ref);
  await tick();
  await tick();
  assert.equal(el.textContent, "plain", "props now carries it");
});

// ── a vnode built once and later placed into SVG ───────────────────────────

test("branches: a reused vnode is rebuilt when it lands in a new namespace", async () => {
  // resolveBinding hands back the very same vnode when a value is already one,
  // so a node built in the HTML namespace can end up inside an <svg>. Its DOM
  // is then wrong and has to be recreated — carrying its handlers with it.
  const hits = [];
  const shared = html`<a onclick=${() => hits.push("hit")}>label</a>`;
  const { el } = await mount(
    () => () => html`<svg viewBox="0 0 10 10">${shared}</svg>`,
  );

  const a = el.querySelector("a");
  assert.ok(a, "the reused node is in the tree");
  assert.equal(a.namespaceURI, "http://www.w3.org/2000/svg", "recreated in SVG");
  assert.equal(a.textContent, "label", "its text survived the rebuild");
  a.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.deepEqual(hits, ["hit"], "so did its handler");
});

test("branches: a string prop replaced by an object leaves props", async () => {
  // The mirror of the swap above: props held a string, the binding becomes an
  // object, so the props entry has to be deleted rather than stringified.
  const child = "unc-tostr-kid";
  define(child, (el, props) => () => {
    const v = "data" in props ? `str:${props.data}` : el.data ? `obj:${el.data.n}` : "-";
    return html`<i>${v}</i>`;
  });
  let data = "plain";
  let ref;
  define("unc-tostr-host", (el) => {
    ref = el;
    return () => html`<div><unc-tostr-kid data=${data}></unc-tostr-kid></div>`;
  });
  const el = document.createElement("unc-tostr-host");
  document.body.appendChild(el);
  await tick();
  await tick();
  assert.equal(el.textContent, "str:plain");

  data = { n: 9 };
  update(ref);
  await tick();
  await tick();
  assert.equal(el.textContent, "obj:9", "props entry removed, property set");
});
