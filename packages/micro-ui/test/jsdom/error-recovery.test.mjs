// A component that threw once used to be dead for the life of the page:
// flush() skipped any instance with errored=true, and nothing ever cleared it.
// Fixing the cause and calling update() did nothing. The only way back was to
// remove the element and re-add it.
//
// update() now retries. The two halves have to be reset together — the error
// box replaced the host's children, and inst.tree still described the DOM from
// before the failure — or the retry patches nodes that are no longer there.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update, flush, onError, onReady } = await import(
  `../../src/index.ts?recover-${Date.now()}`
);

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
const quiet = () => {
  const real = console.error;
  console.error = () => {};
  return () => {
    console.error = real;
  };
};

test("recovery: fixing the cause and calling update brings the component back", async () => {
  const restore = quiet();
  const tag = uniqueTag("x-rec");
  let broken = false;
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => {
      if (broken) throw new Error("boom");
      return html`<p>healthy</p>`;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.textContent, "healthy");

  broken = true;
  update(ref);
  await tick();
  flush();
  assert.ok(el.querySelector("[data-micro-ui-error]"), "it failed");

  broken = false;
  update(ref);
  await tick();
  flush();
  restore();

  assert.equal(el.querySelector("[data-micro-ui-error]"), null, "box is gone");
  assert.equal(el.textContent, "healthy", "and the component rendered again");
});

test("recovery: the recovered component keeps re-rendering normally", async () => {
  const restore = quiet();
  const tag = uniqueTag("x-rec-again");
  let broken = false;
  let n = 0;
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => {
      if (broken) throw new Error("boom");
      return html`<p>${String(n)}</p>`;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  broken = true;
  update(ref);
  await tick();
  flush();
  broken = false;
  update(ref);
  await tick();
  flush();
  restore();

  n = 7;
  update(ref);
  await tick();
  flush();
  assert.equal(el.textContent, "7");

  n = 8;
  update(ref);
  await tick();
  flush();
  assert.equal(el.textContent, "8", "not a one-shot recovery");
});

test("recovery: no leftovers from the error box or the pre-failure tree", async () => {
  const restore = quiet();
  const tag = uniqueTag("x-rec-clean");
  let broken = false;
  let ref;
  define(tag, (el) => {
    ref = el;
    return () =>
      broken
        ? (() => {
            throw new Error("boom");
          })()
        : html`<ul><li>one</li><li>two</li></ul>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  broken = true;
  update(ref);
  await tick();
  flush();
  broken = false;
  update(ref);
  await tick();
  flush();
  restore();

  assert.equal(el.querySelectorAll("[data-micro-ui-error]").length, 0);
  assert.equal(el.querySelectorAll("ul").length, 1, "one list, not two");
  assert.equal(el.querySelectorAll("li").length, 2);
  assert.equal(el.textContent, "onetwo");
});

test("recovery: a failure in reconcile recovers too", async () => {
  const restore = quiet();
  const tag = uniqueTag("x-rec-reconcile");
  let broken = false;
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => {
      const tree = html`<div><span>ok</span></div>`;
      if (broken) {
        // A tree whose dom the reconciler cannot patch.
        tree.children[0].children[0] = {
          type: "element",
          tag: "b",
          ns: null,
          attrs: null,
          events: {},
          key: undefined,
          children: [],
        };
      }
      return tree;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  broken = true;
  update(ref);
  await tick();
  flush();
  const failed = el.querySelector("[data-micro-ui-error]") !== null;

  broken = false;
  update(ref);
  await tick();
  flush();
  restore();

  if (failed) {
    assert.equal(el.querySelector("[data-micro-ui-error]"), null);
  }
  assert.equal(el.textContent, "ok");
});

test("recovery: onError still fires on every failure, not just the first", async () => {
  const restore = quiet();
  const tag = uniqueTag("x-rec-onerror");
  const phases = [];
  let broken = false;
  let ref;
  define(tag, (el) => {
    ref = el;
    onError((_el, _err, phase) => phases.push(phase));
    return () => {
      if (broken) throw new Error("boom");
      return html`<p>ok</p>`;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  for (let i = 0; i < 2; i++) {
    broken = true;
    update(ref);
    await tick();
    flush();
    broken = false;
    update(ref);
    await tick();
    flush();
  }
  restore();

  assert.deepEqual(phases, ["render", "render"], "reported both times");
  assert.equal(el.textContent, "ok");
});

test("recovery: a setup failure reports the same error instead of blanking", async () => {
  // setup() runs once per element and cannot be re-run, so there is nothing to
  // recover to. A retry must not quietly replace the error box with nothing.
  const restore = quiet();
  const tag = uniqueTag("x-rec-setup");
  define(tag, () => {
    throw new Error("setup exploded");
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.ok(el.querySelector("[data-micro-ui-error]"));

  update(el);
  await tick();
  flush();
  restore();

  assert.ok(
    el.querySelector("[data-micro-ui-error]"),
    "still reports, rather than rendering an empty component",
  );
  assert.equal(el.querySelectorAll("[data-micro-ui-error]").length, 1);
});

test("recovery: cleanups registered before the failure still run on removal", async () => {
  const restore = quiet();
  const tag = uniqueTag("x-rec-cleanup");
  let cleaned = 0;
  let broken = false;
  let ref;
  define(tag, (el) => {
    ref = el;
    onReady(() => () => {
      cleaned++;
    });
    return () => {
      if (broken) throw new Error("boom");
      return html`<p>ok</p>`;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  broken = true;
  update(ref);
  await tick();
  flush();
  broken = false;
  update(ref);
  await tick();
  flush();
  restore();

  el.remove();
  await tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(cleaned, 1, "the error round trip did not lose the cleanup");
});
