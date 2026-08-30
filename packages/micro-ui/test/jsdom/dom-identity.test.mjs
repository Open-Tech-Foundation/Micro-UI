// "Form-friendly — inputs, video, canvas, focus, and scroll position all
// survive re-renders" is the README's fourth headline feature and had no test
// behind it: not one file touched activeElement, focus(), scrollTop,
// selectionStart, canvas or video.
//
// What holds it up is DOM identity — the reconciler patches nodes in place and
// never rebuilds them — plus not *moving* a node needlessly, since re-inserting
// an element blurs it. jsdom models both: activeElement, selection ranges,
// scrollTop and media properties all behave, and insertBefore drops focus just
// as a browser does. What it cannot model is paint, real scrolling and real
// playback; those still want a browser (test.html at the repo root).
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update } = await import(
  `../../src/index.ts?identity-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
async function mount(render) {
  const tag = uniqueTag("x-id");
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

// ── focus ──────────────────────────────────────────────────────────────────

test("identity: the focused input keeps focus across a re-render", async () => {
  let label = "a";
  const { el, rerender } = await mount(
    () => () => html`<div><span>${label}</span><input name="q"></div>`,
  );
  const input = el.querySelector("input");
  input.focus();
  assert.equal(document.activeElement, input);

  label = "b";
  rerender();
  await tick();

  assert.equal(el.querySelector("input"), input, "same node");
  assert.equal(document.activeElement, input, "still focused");
  assert.equal(el.querySelector("span").textContent, "b", "and it did re-render");
});

test("identity: focus survives rows being added around it", async () => {
  let items = [1, 2, 3];
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map((i) => html`<li key=${i}><input id=${`i${i}`}></li>`)}</ul>`,
  );
  const target = el.querySelector("#i2");
  target.focus();

  items = [0, 1, 2, 3, 4];
  rerender();
  await tick();

  assert.equal(el.querySelector("#i2"), target);
  assert.equal(document.activeElement, target, "adding siblings must not blur");
});

test("identity: focus survives a reorder that does not move the focused row", async () => {
  // The reason patchKeyed moves only the rows on the longest increasing
  // subsequence: re-inserting a node blurs it, so a swap at the edges of a
  // list must not disturb a field the user is typing in.
  let items = Array.from({ length: 20 }, (_, i) => i);
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map((i) => html`<li key=${i}><input id=${`f${i}`}></li>`)}</ul>`,
  );
  const target = el.querySelector("#f10");
  target.focus();
  assert.equal(document.activeElement, target);

  const next = items.slice();
  [next[2], next[17]] = [next[17], next[2]];
  items = next;
  rerender();
  await tick();

  assert.equal(
    [...el.querySelectorAll("input")].map((n) => n.id).join(","),
    next.map((i) => `f${i}`).join(","),
    "the swap happened",
  );
  assert.equal(document.activeElement, target, "the untouched row kept focus");
});

// ── uncontrolled state ─────────────────────────────────────────────────────

test("identity: an unbound input keeps what the user typed", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () => html`<div><b>${String(n)}</b><input></div>`,
  );
  const input = el.querySelector("input");
  input.value = "typed by hand";

  n = 1;
  rerender();
  await tick();

  assert.equal(el.querySelector("input"), input);
  assert.equal(input.value, "typed by hand");
});

test("identity: the caret position survives a re-render", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () => html`<div><b>${String(n)}</b><input></div>`,
  );
  const input = el.querySelector("input");
  input.value = "hello world";
  input.focus();
  input.setSelectionRange(3, 7);

  n = 1;
  rerender();
  await tick();

  assert.equal(document.activeElement, input);
  assert.equal(input.selectionStart, 3, "selection start");
  assert.equal(input.selectionEnd, 7, "selection end");
});

test("identity: an unbound checkbox keeps its checked state", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () => html`<div><b>${String(n)}</b><input type="checkbox"></div>`,
  );
  const box = el.querySelector("input");
  box.checked = true;

  n = 1;
  rerender();
  await tick();

  assert.equal(el.querySelector("input"), box);
  assert.equal(box.checked, true);
});

// ── scroll ─────────────────────────────────────────────────────────────────

test("identity: scroll position survives a re-render", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () =>
      html`<div class="pane"><b>${String(n)}</b><p>long content</p></div>`,
  );
  const pane = el.querySelector(".pane");
  pane.scrollTop = 120;

  n = 1;
  rerender();
  await tick();

  assert.equal(el.querySelector(".pane"), pane, "the scroller was not rebuilt");
  assert.equal(pane.scrollTop, 120);
});

test("identity: a scrolled list is not rebuilt when one row changes", async () => {
  let items = [
    { id: 1, v: "a" },
    { id: 2, v: "b" },
    { id: 3, v: "c" },
  ];
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map((i) => html`<li key=${i.id}>${i.v}</li>`)}</ul>`,
  );
  const ul = el.querySelector("ul");
  const rows = [...ul.children];
  ul.scrollTop = 64;

  items = items.map((i) => (i.id === 2 ? { ...i, v: "B" } : i));
  rerender();
  await tick();

  assert.equal(ul.scrollTop, 64);
  for (let i = 0; i < rows.length; i++)
    assert.equal(ul.children[i], rows[i], `row ${i} is the same node`);
});

// ── media and canvas ───────────────────────────────────────────────────────

test("identity: a <video> is not rebuilt, so playback state survives", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () => html`<div><b>${String(n)}</b><video src="clip.mp4"></video></div>`,
  );
  const video = el.querySelector("video");
  video.currentTime = 12;

  n = 1;
  rerender();
  await tick();

  assert.equal(el.querySelector("video"), video, "a rebuilt <video> restarts");
  assert.equal(video.currentTime, 12);
});

test("identity: a <canvas> is not rebuilt, so what was drawn stays drawn", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () => html`<div><b>${String(n)}</b><canvas width="80" height="40"></canvas></div>`,
  );
  const canvas = el.querySelector("canvas");
  // jsdom has no 2d context without node-canvas; node identity is the thing
  // that decides whether pixels survive, so that is what is asserted.
  canvas.dataset.painted = "yes";

  n = 1;
  rerender();
  await tick();

  assert.equal(el.querySelector("canvas"), canvas);
  assert.equal(canvas.dataset.painted, "yes");
  assert.equal(canvas.width, 80, "the surface was not resized (which clears it)");
});

test("identity: an <iframe> is not rebuilt, so it does not reload", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () => html`<div><b>${String(n)}</b><iframe src="about:blank"></iframe></div>`,
  );
  const frame = el.querySelector("iframe");

  n = 1;
  rerender();
  await tick();

  assert.equal(el.querySelector("iframe"), frame);
});

// ── the guarantee under a keyed list ───────────────────────────────────────

test("identity: media inside a keyed row survives the row moving", async () => {
  let items = [1, 2, 3];
  const { el, rerender } = await mount(
    () => () =>
      html`<ul>${items.map(
        (i) => html`<li key=${i}><video id=${`v${i}`} src="c.mp4"></video></li>`,
      )}</ul>`,
  );
  const video = el.querySelector("#v3");
  video.currentTime = 7;

  items = [3, 1, 2];
  rerender();
  await tick();

  assert.equal(el.querySelector("#v3"), video, "moved, not rebuilt");
  assert.equal(video.currentTime, 7, "playback position survived the move");
  assert.equal(el.querySelector("ul").children[0].querySelector("video"), video);
});
