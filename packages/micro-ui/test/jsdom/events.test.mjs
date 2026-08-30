// Event handlers are bound once per element and event type and then swapped in
// a slot, rather than removed and re-added whenever the closure changes. That
// keeps the idiomatic `onclick=${() => f(item)}` from costing two listener
// operations per row per render — and puts the burden on these tests to prove
// the slot always holds the *current* handler.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?events-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
async function mount(render) {
  const tag = uniqueTag("x-ev");
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
function click(node) {
  node.dispatchEvent(new window.Event("click", { bubbles: true }));
}

// ── the handler that runs is the one from the latest render ────────────────

test("events: a re-render swaps in the new closure", async () => {
  let n = 0;
  const calls = [];
  const { el, rerender } = await mount(
    () => () => html`<button onclick=${() => calls.push(n)}>go</button>`,
  );
  const btn = el.querySelector("button");

  click(btn);
  n = 1;
  rerender();
  await tick();
  click(btn);
  n = 2;
  rerender();
  await tick();
  click(btn);

  assert.deepEqual(calls, [0, 1, 2], "each click ran the newest closure");
});

test("events: the handler closes over the row it was rendered with", async () => {
  let items = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];
  const clicked = [];
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map(
        (i) => html`<li key=${i.id}><button onclick=${() => clicked.push(i.label)}>${i.label}</button></li>`,
      )}</ul>`,
  );

  click(el.querySelectorAll("button")[1]);
  assert.deepEqual(clicked, ["B"]);

  // Same keys, new objects and new labels — the slots must follow.
  items = [
    { id: "a", label: "A2" },
    { id: "b", label: "B2" },
  ];
  rerender();
  await tick();
  click(el.querySelectorAll("button")[1]);
  assert.deepEqual(clicked, ["B", "B2"], "not the stale closure");
});

test("events: handlers follow their row through a reorder", async () => {
  let items = ["a", "b", "c"];
  const clicked = [];
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map(
        (i) => html`<li key=${i}><button onclick=${() => clicked.push(i)}>${i}</button></li>`,
      )}</ul>`,
  );

  items = ["c", "a", "b"];
  rerender();
  await tick();

  const buttons = [...el.querySelectorAll("button")];
  assert.deepEqual(buttons.map((b) => b.textContent), ["c", "a", "b"]);
  click(buttons[0]);
  assert.deepEqual(clicked, ["c"], "the moved row kept its own handler");
});

// ── removing a handler ─────────────────────────────────────────────────────

test("events: dropping the binding stops the handler firing", async () => {
  let armed = true;
  let hits = 0;
  const { el, rerender } = await mount(
    () => () =>
      armed
        ? html`<button onclick=${() => hits++}>go</button>`
        : html`<button>go</button>`,
  );
  const btn = el.querySelector("button");

  click(btn);
  assert.equal(hits, 1);

  armed = false;
  rerender();
  await tick();
  click(el.querySelector("button"));
  assert.equal(hits, 1, "the emptied slot must not fire");

  armed = true;
  rerender();
  await tick();
  click(el.querySelector("button"));
  assert.equal(hits, 2, "and re-binding works after the slot was emptied");
});

test("events: a nullish handler is inert", async () => {
  let handler = null;
  let hits = 0;
  const { el, rerender } = await mount(
    () => () => html`<button onclick=${handler}>go</button>`,
  );
  click(el.querySelector("button"));
  assert.equal(hits, 0);

  handler = () => hits++;
  rerender();
  await tick();
  click(el.querySelector("button"));
  assert.equal(hits, 1);
});

// ── dispatch semantics ─────────────────────────────────────────────────────

test("events: the handler receives the event and `this` is the element", async () => {
  let seenTarget = null;
  let seenThis = null;
  const { el } = await mount(
    () => () =>
      html`<button onclick=${function (e) {
        seenTarget = e.target;
        seenThis = this;
      }}>go</button>`,
  );
  const btn = el.querySelector("button");
  click(btn);
  assert.equal(seenTarget, btn, "event is passed through");
  assert.equal(seenThis, btn, "`this` is the element, as with addEventListener");
});

test("events: sibling elements do not share a slot", async () => {
  const hits = [];
  const { el } = await mount(
    () => () =>
      html`<div>
        <button id="one" onclick=${() => hits.push("one")}>1</button>
        <button id="two" onclick=${() => hits.push("two")}>2</button>
      </div>`,
  );
  click(el.querySelector("#two"));
  click(el.querySelector("#one"));
  assert.deepEqual(hits, ["two", "one"]);
});

test("events: different event types on one element stay separate", async () => {
  const hits = [];
  const { el } = await mount(
    () => () =>
      html`<input oninput=${() => hits.push("input")} onclick=${() => hits.push("click")}>`,
  );
  const input = el.querySelector("input");
  click(input);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(hits, ["click", "input"]);
});

// ── the reason for all of the above ────────────────────────────────────────

test("events: re-rendering does not touch the listener list", async () => {
  const proto = window.Element.prototype;
  const realAdd = proto.addEventListener;
  const realRemove = proto.removeEventListener;
  let adds = 0;
  let removes = 0;

  let items = Array.from({ length: 25 }, (_, i) => ({ id: i, v: 0 }));
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map(
        (i) => html`<li key=${i.id}><button onclick=${() => i.v}>${i.v}</button></li>`,
      )}</ul>`,
  );
  assert.equal(el.querySelectorAll("button").length, 25);

  proto.addEventListener = function (...a) {
    adds++;
    return realAdd.apply(this, a);
  };
  proto.removeEventListener = function (...a) {
    removes++;
    return realRemove.apply(this, a);
  };
  try {
    for (let pass = 0; pass < 3; pass++) {
      items = items.map((i) => ({ ...i, v: i.v + 1 }));
      rerender();
      await tick();
    }
  } finally {
    proto.addEventListener = realAdd;
    proto.removeEventListener = realRemove;
  }

  assert.equal(adds, 0, "no listener was added across three re-renders");
  assert.equal(removes, 0, "and none was removed");
  assert.equal(el.querySelector("button").textContent, "3", "but it did render");
});

test("events: a brand new row binds exactly one listener", async () => {
  let items = [1];
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map(
        (i) => html`<li key=${i}><button onclick=${() => i}>${i}</button></li>`,
      )}</ul>`,
  );

  const proto = window.Element.prototype;
  const realAdd = proto.addEventListener;
  let adds = 0;
  proto.addEventListener = function (...a) {
    adds++;
    return realAdd.apply(this, a);
  };
  try {
    items = [1, 2];
    rerender();
    await tick();
  } finally {
    proto.addEventListener = realAdd;
  }

  assert.equal(el.querySelectorAll("button").length, 2);
  assert.equal(adds, 1, "one listener for the one new button");
});
