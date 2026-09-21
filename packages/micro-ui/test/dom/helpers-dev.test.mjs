// cx / sx, and what `mount(..., { dev: true })` turns on.
//
// Every warning here covers a failure that is otherwise silent: a class that
// never lands, a subscription that outlives its component and keeps the
// element alive, a listener that throws and simply stops updating.
import { test, assertEquals, assert, expect } from "runtime:test";

const { cx, sx, define, html, mount, onReady, store, update } = await import(
  "../../src/index.ts"
);

const uniq = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const tick = () => new Promise((r) => queueMicrotask(r));

// Collects console output for the duration of one call.
async function captured(fn) {
  const lines = [];
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = (...a) => lines.push(String(a[0]));
  console.error = (...a) => lines.push(String(a[0]));
  try {
    await fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
  return lines;
}

// ── cx ─────────────────────────────────────────────────────────────

test("cx joins strings and drops the falsy ones", () => {
  assertEquals(cx("a", "b"), "a b");
  assertEquals(cx("a", false, null, undefined, "", "b"), "a b");
  assertEquals(cx(), "");
});

test("cx takes conditionals the way they are written", () => {
  const active = true;
  const disabled = false;
  assertEquals(
    cx("ui-btn", active && "is-active", disabled && "is-disabled"),
    "ui-btn is-active",
  );
});

test("cx takes objects and arrays, nested", () => {
  assertEquals(cx({ a: true, b: false, c: 1 }), "a c");
  assertEquals(cx(["a", ["b", ["c"]]]), "a b c");
  assertEquals(cx("a", ["b", { c: true, d: 0 }]), "a b c");
});

test("cx trims and ignores whitespace-only entries", () => {
  assertEquals(cx("  a  ", "   ", "b"), "a b");
});

// ── sx ─────────────────────────────────────────────────────────────

test("sx builds a declaration list from an object", () => {
  assertEquals(sx({ color: "red" }), "color: red");
  assertEquals(sx({ color: "red", background: "blue" }), "color: red; background: blue");
});

test("sx kebab-cases camelCase properties and leaves custom ones alone", () => {
  assertEquals(sx({ marginTop: "8px" }), "margin-top: 8px");
  assertEquals(sx({ backgroundColor: "red" }), "background-color: red");
  assertEquals(sx({ "--ui-accent": "red" }), "--ui-accent: red");
});

test("sx drops nullish, false and empty values but keeps 0", () => {
  assertEquals(sx({ color: null, top: undefined, left: false, right: "" }), "");
  assertEquals(sx({ opacity: 0 }), "opacity: 0");
});

test("sx mixes strings, objects and conditionals", () => {
  const hidden = true;
  assertEquals(
    sx("color: red", hidden && { display: "none" }),
    "color: red; display: none",
  );
  assertEquals(sx("color: red;"), "color: red");
  assertEquals(sx(false, null, ""), "");
});

test("cx and sx land on a real element", async () => {
  const tag = uniq("x-helpers");
  define(tag, () => () =>
    html`<div class=${cx("a", { b: true })} style=${sx({ color: "red" })}>x</div>`,
  );
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const div = el.querySelector("div");
  assertEquals(div.className, "a b");
  assertEquals(div.style.color, "red");
});

// ── dev warnings ───────────────────────────────────────────────────

test("dev warns when class or style is handed an array or object", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-devcls");
  define(tag, () => () => html`<div class=${["a", "b"]} style=${{ color: "red" }}>x</div>`);

  const lines = await captured(async () => {
    mount(host, tag, { dev: true });
    await tick();
  });
  assertEquals(lines.filter((l) => l.includes("class=")).length, 1);
  assertEquals(lines.filter((l) => l.includes("style=")).length, 1);
  expect(lines.find((l) => l.includes("class="))).toMatch(/cx\(/);
  expect(lines.find((l) => l.includes("style="))).toMatch(/sx\(/);
});

test("the same page says nothing with dev off", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-prodcls");
  define(tag, () => () => html`<div class=${["a", "b"]}>x</div>`);

  const lines = await captured(async () => {
    mount(host, tag, { dev: false });
    await tick();
  });
  assertEquals(lines, []);
});

test("dev warns when a component is removed with a live subscription", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-leaky");
  store.set("dev-leak", 0);
  define(tag, (el) => {
    // The slip: the unsubscribe is never returned, so nothing cleans it up.
    onReady(() => {
      store.subscribe("dev-leak", () => update(el));
    });
    return () => html`<b>${String(store.get("dev-leak"))}</b>`;
  });

  const lines = await captured(async () => {
    const el = mount(host, tag, { dev: true });
    await tick();
    el.remove();
    await tick();
  });
  const warning = lines.find((l) => l.includes("live store subscription"));
  assert(warning, `no warning; got ${JSON.stringify(lines)}`);
  expect(warning).toMatch(/"dev-leak"/);
  expect(warning).toMatch(/onReady/);
});

test("returning the unsubscribe says nothing", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-tidy");
  store.set("dev-tidy", 0);
  define(tag, (el) => {
    onReady(() => store.subscribe("dev-tidy", () => update(el)));
    return () => html`<b>${String(store.get("dev-tidy"))}</b>`;
  });

  const lines = await captured(async () => {
    const el = mount(host, tag, { dev: true });
    await tick();
    el.remove();
    await tick();
  });
  assertEquals(lines, []);
});

test("a subscription made in setup is tracked too", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-setupsub");
  store.set("dev-setup", 0);
  define(tag, (el) => {
    store.subscribe("dev-setup", () => update(el));
    return () => html`<b>x</b>`;
  });

  const lines = await captured(async () => {
    const el = mount(host, tag, { dev: true });
    await tick();
    el.remove();
    await tick();
  });
  assert(lines.find((l) => l.includes("live store subscription")));
});

test("a module-level subscription is nobody's leak", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-modsub");
  store.set("dev-mod", 0);
  store.subscribe("dev-mod", () => {}); // outside any component
  define(tag, () => () => html`<b>x</b>`);

  const lines = await captured(async () => {
    const el = mount(host, tag, { dev: true });
    await tick();
    el.remove();
    await tick();
  });
  assertEquals(lines, []);
});

test("nothing is tracked with dev off", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-prodsub");
  store.set("dev-off", 0);
  define(tag, (el) => {
    onReady(() => {
      store.subscribe("dev-off", () => update(el));
    });
    return () => html`<b>x</b>`;
  });

  const lines = await captured(async () => {
    const el = mount(host, tag, { dev: false });
    await tick();
    el.remove();
    await tick();
  });
  assertEquals(lines, []);
});

// ── a throwing listener is no longer silent, dev or not ────────────

test("a store listener that throws is reported and does not stop the others", async () => {
  store.set("dev-throw", 0);
  let reached = false;
  store.subscribe("dev-throw", () => {
    throw new Error("listener blew up");
  });
  store.subscribe("dev-throw", () => {
    reached = true;
  });

  const lines = await captured(async () => {
    store.set("dev-throw", 1);
  });
  assertEquals(reached, true, "a later listener was skipped");
  assert(
    lines.find((l) => l.includes('store listener for "dev-throw" threw')),
    `nothing logged; got ${JSON.stringify(lines)}`,
  );
});