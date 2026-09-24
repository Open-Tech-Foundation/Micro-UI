// "Form-friendly — inputs, video, canvas, focus, and scroll position all
// survive re-renders" is the README's fourth headline feature and had no test
// behind it: not one file touched activeElement, focus(), scrollTop,
// selectionStart, canvas or video.
//
// What holds it up is DOM identity — the reconciler patches nodes in place and
// never rebuilds them — plus not *moving* a node needlessly, since re-inserting
// an element blurs it. esdev's test DOM models identity, focus, selection and
// media properties, and insertBefore drops focus just as a browser does. What
// it cannot model is layout: without it a scroll offset clamps straight back
// to 0, so the offset half of the scroll contract lives in test.html (test 20)
// at the repo root, where there is real scrolling. What it also cannot model
// is paint and real playback; those still want a browser too.
import { test, assert, assertEquals } from "runtime:test";

const { define, html, update } = await import("../../src/index.ts");

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
  assert(document.activeElement === input);

  label = "b";
  rerender();
  await tick();

  assert(el.querySelector("input") === input, "same node");
  assert(document.activeElement === input, "still focused");
  assertEquals(el.querySelector("span").textContent, "b", "and it did re-render");
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

  assert(el.querySelector("#i2") === target);
  assert(document.activeElement === target, "adding siblings must not blur");
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
  assert(document.activeElement === target);

  const next = items.slice();
  [next[2], next[17]] = [next[17], next[2]];
  items = next;
  rerender();
  await tick();

  assertEquals(
    [...el.querySelectorAll("input")].map((n) => n.id).join(","),
    next.map((i) => `f${i}`).join(","),
    "the swap happened",
  );
  assert(document.activeElement === target, "the untouched row kept focus");
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

  assert(el.querySelector("input") === input);
  assertEquals(input.value, "typed by hand");
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

  assert(document.activeElement === input);
  assertEquals(input.selectionStart, 3, "selection start");
  assertEquals(input.selectionEnd, 7, "selection end");
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

  assert(el.querySelector("input") === box);
  assertEquals(box.checked, true);
});

// ── scroll ─────────────────────────────────────────────────────────────────

test("identity: scroll position survives a re-render", async () => {
  let n = 0;
  const { el, rerender } = await mount(
    () => () =>
      html`<div class="pane"><b>${String(n)}</b><p>long content</p></div>`,
  );
  const pane = el.querySelector(".pane");

  n = 1;
  rerender();
  await tick();

  assert(el.querySelector(".pane") === pane, "the scroller was not rebuilt");
  // The offset itself is pinned in test.html (test 20): without layout this
  // DOM clamps scrollTop back to 0, so asserting a value here can only fail.
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

  items = items.map((i) => (i.id === 2 ? { ...i, v: "B" } : i));
  rerender();
  await tick();

  // The list's offset is pinned in test.html (test 20), where there is real
  // scrolling to hold it. Here only node identity is observable.
  for (let i = 0; i < rows.length; i++)
    assert(ul.children[i] === rows[i], `row ${i} is the same node`);
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

  assert(el.querySelector("video") === video, "a rebuilt <video> restarts");
  assertEquals(video.currentTime, 12);
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

  assert(el.querySelector("canvas") === canvas);
  assertEquals(canvas.dataset.painted, "yes");
  assertEquals(canvas.width, 80, "the surface was not resized (which clears it)");
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

  assert(el.querySelector("iframe") === frame);
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

  assert(el.querySelector("#v3") === video, "moved, not rebuilt");
  assertEquals(video.currentTime, 7, "playback position survived the move");
  assert(el.querySelector("ul").children[0].querySelector("video") === video);
});