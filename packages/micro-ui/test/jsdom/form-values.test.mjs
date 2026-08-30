// The two ways a bound value goes wrong on a real form.
//
// A <select>'s value is one of its options, so setting it before the options
// exist selects nothing — wrong exactly when the initial selection is not the
// first option. And assigning .value collapses the caret to the end, which is
// invisible while a binding only echoes what was typed and ruins any field
// that rewrites it: an uppercase field, a currency or phone mask, a trim.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?form-values-${Date.now()}`
);
const uniq = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const tick = () => new Promise((r) => queueMicrotask(r));

async function mount(render) {
  const tag = uniq("x-form");
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

// ── <select> ───────────────────────────────────────────────────────

test("a select selects the bound option on first render", async () => {
  const { el } = await mount(
    () => html`
      <select value=${"grace"}>
        <option value="ada">Ada</option>
        <option value="grace">Grace</option>
      </select>
    `,
  );
  const sel = el.querySelector("select");
  assert.equal(sel.value, "grace");
  assert.equal(sel.selectedIndex, 1);
});

test("a select whose options are interpolated", async () => {
  const people = ["ada", "grace", "linus"];
  const { el } = await mount(
    () => html`<select value=${"linus"}>${people.map((p) => html`<option value=${p}>${p}</option>`)}</select>`,
  );
  assert.equal(el.querySelector("select").value, "linus");
});

test("a select follows its binding when the value changes", async () => {
  const state = { pick: "ada" };
  const { el, rerender } = await mount(
    () => html`
      <select value=${state.pick}>
        <option value="ada">Ada</option>
        <option value="grace">Grace</option>
      </select>
    `,
  );
  const sel = el.querySelector("select");
  state.pick = "grace";
  await rerender();
  assert.equal(sel.value, "grace");
});

test("a select keeps its binding when the selected option is removed", async () => {
  const state = { people: ["ada", "grace", "linus"], pick: "linus" };
  const { el, rerender } = await mount(
    () => html`<select value=${state.pick}>${state.people.map((p) => html`<option key=${p} value=${p}>${p}</option>`)}</select>`,
  );
  const sel = el.querySelector("select");
  assert.equal(sel.value, "linus");

  // Grace leaves; the binding still says linus, and linus is still there.
  state.people = ["ada", "linus"];
  await rerender();
  assert.equal(sel.value, "linus", "removing another option stole the selection");
});

test("a select the user changed is not fought over by an unchanged binding", async () => {
  const state = { label: "a", pick: "ada" };
  const { el, rerender } = await mount(
    () => html`
      <div>
        <span>${state.label}</span>
        <select value=${state.pick}>
          <option value="ada">Ada</option>
          <option value="grace">Grace</option>
        </select>
      </div>
    `,
  );
  const sel = el.querySelector("select");
  sel.value = "grace"; // the user picks
  state.label = "b"; // something unrelated re-renders
  await rerender();
  assert.equal(sel.value, "grace");
});

test("a textarea with a value binding", async () => {
  const state = { text: "one" };
  const { el, rerender } = await mount(() => html`<textarea value=${state.text}></textarea>`);
  const ta = el.querySelector("textarea");
  assert.equal(ta.value, "one");
  state.text = "two";
  await rerender();
  assert.equal(ta.value, "two");
});

// ── the caret ──────────────────────────────────────────────────────

test("the caret survives a value the app rewrote", async () => {
  const state = { text: "hello" };
  const { el, rerender } = await mount(
    () => html`<input value=${state.text.toUpperCase()} />`,
  );
  const input = el.querySelector("input");
  input.focus();
  // The user types "X" at offset 3.
  input.value = "helXlo";
  input.setSelectionRange(4, 4);
  state.text = "helXlo";
  await rerender();

  assert.equal(input.value, "HELXLO");
  assert.equal(input.selectionStart, 4, "the caret jumped");
  assert.equal(input.selectionEnd, 4);
});

test("a shorter value clamps the caret instead of throwing", async () => {
  const state = { text: "abcdefgh" };
  const { el, rerender } = await mount(() => html`<input value=${state.text} />`);
  const input = el.querySelector("input");
  input.focus();
  input.setSelectionRange(8, 8);
  state.text = "ab";
  await rerender();
  assert.equal(input.value, "ab");
  assert.equal(input.selectionStart, 2);
});

test("a selection range is kept, not collapsed", async () => {
  const state = { text: "hello" };
  const { el, rerender } = await mount(
    () => html`<input value=${state.text.toUpperCase()} />`,
  );
  const input = el.querySelector("input");
  input.focus();
  input.value = "hello!";
  input.setSelectionRange(1, 4);
  state.text = "hello!";
  await rerender();
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 4);
});

test("an unfocused input is left alone", async () => {
  const state = { text: "one" };
  const { el, rerender } = await mount(() => html`<input value=${state.text} />`);
  const input = el.querySelector("input");
  const other = document.createElement("input");
  document.body.appendChild(other);
  other.focus();
  state.text = "two";
  await rerender();
  assert.equal(input.value, "two");
  assert.equal(document.activeElement, other, "focus moved");
});

test("a value the DOM already holds is not written again", async () => {
  const state = { text: "a" };
  const { el, rerender } = await mount(() => html`<input value=${state.text} />`);
  const input = el.querySelector("input");
  input.focus();
  // The user types, so the DOM already matches what the next render produces.
  input.value = "ab";
  input.setSelectionRange(1, 1);
  state.text = "ab";
  await rerender();
  assert.equal(input.selectionStart, 1, "an identical value still moved the caret");
});

test("value=${null} clears the field", async () => {
  const state = { text: "something" };
  const { el, rerender } = await mount(() => html`<input value=${state.text} />`);
  const input = el.querySelector("input");
  state.text = null;
  await rerender();
  assert.equal(input.value, "");
  assert.equal(input.hasAttribute("value"), false);
});

test("a select recovers its binding when the selection is destroyed", async () => {
  // Unkeyed options: the patch rebuilds them, so the selected element itself
  // goes away and the browser is left with no selection at all.
  const state = { people: ["ada", "grace"], pick: "grace" };
  const { el, rerender } = await mount(
    () => html`<select value=${state.pick}>${state.people.map((p) => html`<option value=${p}>${p}</option>`)}</select>`,
  );
  const sel = el.querySelector("select");
  assert.equal(sel.value, "grace");

  sel.value = ""; // whatever emptied it — a rebuilt option list, a reset
  state.people = ["ada", "grace", "linus"];
  await rerender();
  assert.equal(sel.value, "grace", "the binding was not restored");
});

test("a select follows its binding when the options shift under it", async () => {
  // Unkeyed options patched in place: option[0]'s own value changes from
  // "grace" to "ada", so the browser's selection now means something else.
  const state = { people: ["grace"], pick: "grace" };
  const { el, rerender } = await mount(
    () => html`<select value=${state.pick}>${state.people.map((p) => html`<option value=${p}>${p}</option>`)}</select>`,
  );
  const sel = el.querySelector("select");
  assert.equal(sel.value, "grace");

  state.people = ["ada", "grace"];
  await rerender();
  assert.equal(sel.value, "grace", "the selection slid onto another option");
});
