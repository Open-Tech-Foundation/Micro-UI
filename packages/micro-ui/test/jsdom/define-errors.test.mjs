// define() used to hand back whatever the platform threw:
// "Name argument is not a valid custom element name" for anything wrong with
// the tag, and nothing at all for a setup argument that was not a function —
// that one surfaced much later, per element, as "render is not a function".
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html } = await import(
  `../../src/index.ts?define-err-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
const render = () => () => html`<i>x</i>`;

function thrownBy(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

// ── the name ───────────────────────────────────────────────────────────────

test("define: a name without a dash says so, and suggests one", () => {
  const err = thrownBy(() => define("counter", render));
  assert.ok(err, "must throw");
  assert.ok(err instanceof Error, "an Error, not a DOMException");
  assert.match(err.message, /must contain a dash/);
  assert.match(err.message, /x-counter/, "suggests a working name");
  assert.match(err.message, /"counter"/, "names the tag it was given");
});

test("define: an uppercase name says so, and suggests the lowercase form", () => {
  const err = thrownBy(() => define("X-Counter", render));
  assert.match(err.message, /must be lowercase/);
  assert.match(err.message, /x-counter/);
});

test("define: an empty or non-string name is rejected clearly", () => {
  assert.match(thrownBy(() => define("", render)).message, /non-empty string/);
  assert.match(thrownBy(() => define(null, render)).message, /non-empty string/);
  assert.match(
    thrownBy(() => define(42, render)).message,
    /non-empty string/,
  );
});

test("define: a name that does not start with a letter is rejected", () => {
  assert.match(
    thrownBy(() => define("1-counter", render)).message,
    /start with a lowercase letter/,
  );
});

test("define: a name with whitespace is rejected", () => {
  assert.match(
    thrownBy(() => define("x counter", render)).message,
    /whitespace|dash/,
  );
});

// ── the setup argument ─────────────────────────────────────────────────────

test("define: a setup that is not a function fails at define time", () => {
  // It used to be accepted silently and blow up per element, much later.
  const err = thrownBy(() => define(uniqueTag("x-bad"), html`<i>x</i>`));
  assert.ok(err, "must throw at define time");
  assert.match(err.message, /must be a setup function/);
  assert.match(err.message, /got object/);
});

test("define: a missing setup argument fails at define time", () => {
  const err = thrownBy(() => define(uniqueTag("x-none")));
  assert.match(err.message, /must be a setup function/);
  assert.match(err.message, /got undefined/);
});

// ── registering twice ──────────────────────────────────────────────────────

test("define: registering the same name twice explains why", () => {
  const tag = uniqueTag("x-dup");
  define(tag, render);
  const err = thrownBy(() => define(tag, render));
  assert.ok(err instanceof Error);
  assert.match(err.message, /already defined/);
  assert.match(err.message, /module ran twice/, "names the likely cause");
  assert.match(err.message, /customElements\.get/, "and the way out");
  assert.ok(err.message.includes(tag), "names the tag");
});

test("define: a failed re-registration leaves the first definition working", async () => {
  const tag = uniqueTag("x-keep");
  define(tag, () => () => html`<p>first</p>`);
  thrownBy(() => define(tag, () => () => html`<p>second</p>`));

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.textContent, "first");
});

// ── setup returning the wrong thing ────────────────────────────────────────

test("define: setup returning a template instead of a function is reported", async () => {
  const real = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a);
  const tag = uniqueTag("x-tpl");
  // The usual slip: () => html`...` rather than () => () => html`...`
  define(tag, () => html`<p>oops</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  console.error = real;

  assert.ok(el.querySelector("[data-micro-ui-error]"), "shows the error box");
  const text = logged.flat().map(String).join(" ");
  assert.match(text, /must return a render function/);
  assert.match(text, /html`\.\.\.`/, "shows the shape it wanted");
});

test("define: a valid name still registers", async () => {
  const tag = uniqueTag("x-fine");
  define(tag, () => () => html`<p>ok</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.textContent, "ok");
});
