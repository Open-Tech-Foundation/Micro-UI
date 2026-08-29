// Two lifecycle contracts:
//   1. Re-parenting an element is a move, not a remount — state survives.
//   2. update() from inside a render is deferred to the next flush, not
//      dropped, and a runaway chain is reported rather than hanging the tab.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update, onReady, onError } = await import(
  `../../src/index.ts?move-${Date.now()}`
);

function uniqueTag(p) {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
function macro() {
  return new Promise((r) => setTimeout(r, 0));
}

// ── moving an element ──────────────────────────────────────────────
test("move: re-parenting does not re-run setup or cleanups", async () => {
  const tag = uniqueTag("x-move");
  let setups = 0;
  let cleanups = 0;
  define(tag, () => {
    setups++;
    onReady(() => () => {
      cleanups++;
    });
    return () => html`<i>x</i>`;
  });

  const el = document.createElement(tag);
  const a = document.createElement("div");
  const b = document.createElement("div");
  document.body.append(a, b);
  a.appendChild(el);
  await tick();
  assert.equal(setups, 1);

  b.appendChild(el);
  await tick();
  await macro();

  assert.equal(setups, 1, "setup must not re-run on a move");
  assert.equal(cleanups, 0, "cleanups must not fire on a move");
  assert.equal(el.parentNode, b);
});

test("move: component state survives re-parenting", async () => {
  const tag = uniqueTag("x-move-state");
  let ref;
  define(tag, (host) => {
    ref = host;
    let count = 0;
    return () => html`<b>${String(++count)}</b>`;
  });

  const el = document.createElement(tag);
  const a = document.createElement("div");
  const b = document.createElement("div");
  document.body.append(a, b);
  a.appendChild(el);
  await tick();
  assert.equal(el.textContent, "1");

  update(ref);
  await tick();
  assert.equal(el.textContent, "2");

  b.appendChild(el);
  await tick();
  await macro();

  update(ref);
  await tick();
  assert.equal(el.textContent, "3", "counter kept counting, it did not reset");
});

test("move: a real removal still tears the component down", async () => {
  const tag = uniqueTag("x-remove");
  let setups = 0;
  let cleanups = 0;
  define(tag, () => {
    setups++;
    onReady(() => () => {
      cleanups++;
    });
    return () => html`<i>x</i>`;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  el.remove();
  await tick();
  await macro();

  assert.equal(cleanups, 1, "a genuine disconnect must still clean up");

  document.body.appendChild(el);
  await tick();
  assert.equal(setups, 2, "re-adding later is a fresh mount");
});

test("move: re-adding in a later task is a remount, not a move", async () => {
  const tag = uniqueTag("x-late");
  let setups = 0;
  define(tag, () => {
    setups++;
    return () => html`<i>x</i>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  el.remove();
  await macro();
  await macro();
  document.body.appendChild(el);
  await tick();

  assert.equal(setups, 2);
});

// ── update() during render ─────────────────────────────────────────
test("reentry: a self-update during render is applied, not dropped", async () => {
  const tag = uniqueTag("x-reentry");
  let renders = 0;
  let ref;
  define(tag, (host) => {
    ref = host;
    return () => {
      renders++;
      // Render 1 is the mount render, which runs before the instance exists;
      // trigger on 2 so this fires from inside a real flush.
      if (renders === 2) update(host);
      return html`<b>${String(renders)}</b>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(renders, 1);

  update(ref);
  await tick();
  await tick();
  await tick();

  assert.equal(renders, 3, "the deferred self-update must run, not be dropped");
  assert.equal(el.textContent, "3");
});

test("reentry: a runaway self-update reports instead of hanging", async () => {
  const tag = uniqueTag("x-runaway");
  let caught;
  define(tag, (host) => {
    onError((_el, err, phase) => {
      caught = { message: err.message, phase };
    });
    return () => {
      update(host); // unconditional: a genuine render loop
      return html`<b>x</b>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  update(el);
  for (let i = 0; i < 40; i++) await tick();

  assert.ok(caught, "the loop must surface through onError");
  assert.equal(caught.phase, "render");
  assert.match(caught.message, /render loop/);
  assert.ok(el.querySelector("[data-micro-ui-error]"), "and mount the error UI");
});

test("reentry: a bounded self-update does not trip the loop guard", async () => {
  const tag = uniqueTag("x-bounded");
  let renders = 0;
  let errored = false;
  define(tag, (host) => {
    onError(() => {
      errored = true;
    });
    return () => {
      renders++;
      if (renders >= 2 && renders < 4) update(host);
      return html`<b>${String(renders)}</b>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  update(el);
  for (let i = 0; i < 12; i++) await tick();

  assert.equal(errored, false, "a couple of passes is legitimate, not a loop");
  assert.equal(renders, 4);
});

test("reentry: update() during the mount render is a no-op", async () => {
  // connectedCallback calls render() before instances.set(), so there is no
  // instance to queue against. The tree being built IS the pending update, so
  // there is nothing to re-render — but the behaviour is worth pinning.
  const tag = uniqueTag("x-mount-update");
  let renders = 0;
  define(tag, (host) => () => {
    renders++;
    update(host);
    return html`<b>${String(renders)}</b>`;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  for (let i = 0; i < 5; i++) await tick();

  assert.equal(renders, 1, "no loop, and no deferred re-render");
  assert.equal(el.textContent, "1");
});

test("reentry: repeated short self-update bursts never trip a false loop", async () => {
  // The depth counter must reset once a render settles without re-queueing.
  // Otherwise bursts accumulate across unrelated updates and a perfectly
  // healthy component eventually gets reported as a render loop.
  const tag = uniqueTag("x-bursts");
  let remaining = 0;
  let renders = 0;
  let errored = null;
  let ref;
  define(tag, (host) => {
    ref = host;
    onError((_el, err) => {
      errored = err.message;
    });
    return () => {
      renders++;
      if (remaining > 0) {
        remaining--;
        update(host);
      }
      return html`<b>${String(renders)}</b>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  // 20 bursts of 2 self-updates each: 40 total, well past the cap of 25,
  // but no single unbroken chain ever exceeds 2.
  for (let burst = 0; burst < 20; burst++) {
    remaining = 2;
    update(ref);
    for (let i = 0; i < 6; i++) await tick();
  }

  assert.equal(errored, null, `bursts must not be treated as a loop: ${errored}`);
  assert.equal(remaining, 0);
  assert.ok(renders > 40, `all bursts ran, got ${renders} renders`);
});
