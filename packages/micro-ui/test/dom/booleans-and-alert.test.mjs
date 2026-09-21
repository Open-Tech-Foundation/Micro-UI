// A boolean is a condition, not content — and a component that fails should
// be audible, not just visible.
import { test, assert, assertEquals } from "runtime:test";

const { define, html, mount, update } = await import("../../src/index.ts");
const uniq = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const tick = () => new Promise((r) => queueMicrotask(r));

async function mountRender(render) {
  const tag = uniq("x-bool");
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => render();
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  return { el, rerender: async () => (update(ref), await tick()) };
}

test("neither true nor false reaches the page", async () => {
  const { el } = await mountRender(() => html`<p>a${true}b${false}c</p>`);
  assertEquals(el.querySelector("p").textContent, "abc");
});

test("a comparison does not print itself", async () => {
  const a = 2;
  const b = 1;
  const { el } = await mountRender(() => html`<p>${a > b}${a < b}</p>`);
  assertEquals(el.querySelector("p").textContent, "");
});

test("the && idiom still works both ways", async () => {
  const state = { on: true };
  const { el, rerender } = await mountRender(
    () => html`<div>${state.on && html`<i>yes</i>`}</div>`,
  );
  assertEquals(el.querySelector("i").textContent, "yes");
  state.on = false;
  await rerender();
  assertEquals(el.querySelector("i"), null);
  assertEquals(el.querySelector("div").textContent, "");
});

test("a boolean you actually want printed goes through String()", async () => {
  const { el } = await mountRender(() => html`<p>${String(true)}</p>`);
  assertEquals(el.querySelector("p").textContent, "true");
});

test("0 and empty string are still content", async () => {
  const { el } = await mountRender(() => html`<p>${0}|${""}|${Number.NaN}</p>`);
  assertEquals(el.querySelector("p").textContent, "0||NaN");
});

test("a boolean toggling to text and back patches in place", async () => {
  const state = { v: true };
  const { el, rerender } = await mountRender(() => html`<p>${state.v}</p>`);
  assertEquals(el.querySelector("p").textContent, "");
  state.v = "now text";
  await rerender();
  assertEquals(el.querySelector("p").textContent, "now text");
  state.v = false;
  await rerender();
  assertEquals(el.querySelector("p").textContent, "");
});

test("the error box announces itself", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tag = uniq("x-boom");
  define(tag, () => () => {
    throw new Error("boom");
  });
  const realError = console.error;
  console.error = () => {};
  mount(host, tag);
  await tick();
  console.error = realError;

  const box = host.querySelector("[data-micro-ui-error]");
  assert(box, "no error box");
  assertEquals(box.getAttribute("role"), "alert");
});