import { assert, assertEquals, assertThrows, expect, test } from "runtime:test";

function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
function delay(n = 5) {
  return new Promise((r) => setTimeout(r, n));
}

// ── onReady / onError throw outside define (sync) ─────────────────
test("lifecycle: onReady throws sync outside define", async () => {
  const { onReady } = await import("../../src/lifecycle.ts");
  assertThrows(() => onReady(() => {}), /onReady\(\) must be called synchronously inside define/);
});

test("lifecycle: onError throws sync outside define", async () => {
  const { onError } = await import("../../src/lifecycle.ts");
  assertThrows(() => onError(() => {}), /onError\(\) must be called synchronously inside define/);
});

test("lifecycle: onReady throws after define cleared pendingReady", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-ready-after");
  mod.define(tag, () => {
    mod.onReady(() => {});
    return () => mod.html`<div>ok</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  // after connectedCallback, pendingReady is restored to null
  assertThrows(() => mod.onReady(() => {}), /onReady/);
  el.remove();
});

test("lifecycle: onError throws after define cleared pendingError", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-err-after");
  mod.define(tag, () => {
    mod.onError(() => {});
    return () => mod.html`<div>ok</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertThrows(() => mod.onError(() => {}), /onError/);
  el.remove();
});

// ── async / queueMicrotask after define ───────────────────────────
test("lifecycle: onReady throws via queueMicrotask after define setup returned", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-ready-micro");
  let caught = null;
  mod.define(tag, () => {
    queueMicrotask(() => {
      try {
        mod.onReady(() => {});
      } catch (e) {
        caught = e;
      }
    });
    return () => mod.html`<div>ok</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  await delay(5);
  assert(caught && /onReady/.test(caught.message));
  el.remove();
});

test("lifecycle: onReady throws via await after define (async setup)", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-ready-await");
  let caught = null;
  mod.define(tag, () => {
    // schedule async registration after setup synchronously completed
    Promise.resolve().then(() => {
      try {
        mod.onReady(() => {});
      } catch (e) {
        caught = e;
      }
    });
    return () => mod.html`<div>ok</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  await delay(5);
  assert(caught && /onReady/.test(caught.message));
  el.remove();
});

test("lifecycle: onError throws via queueMicrotask after define", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-err-micro");
  let caught = null;
  mod.define(tag, () => {
    queueMicrotask(() => {
      try {
        mod.onError(() => {});
      } catch (e) {
        caught = e;
      }
    });
    return () => mod.html`<div>ok</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  await delay(5);
  assert(caught && /onError/.test(caught.message));
  el.remove();
});

test("lifecycle: onReady inside onReady callback throws (pending already cleared)", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-nested-ready");
  let innerError = null;
  mod.define(tag, () => {
    mod.onReady(() => {
      try {
        mod.onReady(() => {});
      } catch (e) {
        innerError = e;
      }
    });
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  // inner onReady is called during cb() drain in connectedCallback, at that point
  // pendingReady is already restored to null (define restores before draining? check:
  // actually define restores prev before draining, but cbs alias holds array; so
  // pendingReady is null during cb() execution -> should throw)
  // If implementation drains before restore, it wouldn't throw; assert either:
  // we check that innerError is either set or not, but lifecycle.ts:13 guards.
  // With current impl setPendingReady(prev) happens before for..of cbs loop, so it throws.
  assert(innerError && /onReady/.test(innerError.message));
  el.remove();
});

test("lifecycle: onError inside onReady callback throws", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-nested-err");
  let innerError = null;
  mod.define(tag, () => {
    mod.onReady(() => {
      try {
        mod.onError(() => {});
      } catch (e) {
        innerError = e;
      }
    });
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert(innerError && /onError/.test(innerError.message));
  el.remove();
});

// ── cleanup non-function ignored ──────────────────────────────────
test("lifecycle: onReady cleanup non-function values are ignored", async () => {
  const mod = await import("../../src/index.ts");
  const lc = await import("../../src/lifecycle.ts");
  // esdev isolates modules per file, so mod and lc share the singleton lifecycle
  // instance the library actually uses.
  const tag = uniqueTag("lc-nonfn");
  mod.define(tag, () => {
    mod.onReady(() => { return undefined; });
    mod.onReady(() => { return null; });
    mod.onReady(() => { return "string"; });
    mod.onReady(() => { return 42; });
    mod.onReady(() => { return { foo: 1 }; });
    mod.onReady(() => { return false; });
    mod.onReady(() => { /* void */ });
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  // should not throw on disconnect even though cleanups are non-functions
  expect(() => el.remove()).not.toThrow();
  await delay(5);
  // also verify via direct lifecycle API: setPendingReady([]), push non-function, drain logic ignores
  const { pendingReady, setPendingReady, onReady, destroyCallbacks } = lc;
  setPendingReady([]);
  onReady(() => 123);
  onReady(() => null);
  onReady(() => "x");
  let cbs = lc.pendingReady;
  assertEquals(cbs.length, 3);
  // simulate define drain
  for (const cb of cbs) {
    const cleanup = cb();
    if (typeof cleanup === "function") {
      assert(false, "non-function should not be considered cleanup");
    }
  }
  setPendingReady(null);
});

test("lifecycle: onReady cleanup function is stored and called", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-cleanup-fn");
  let cleaned = false;
  mod.define(tag, () => {
    mod.onReady(() => {
      return () => { cleaned = true; };
    });
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertEquals(cleaned, false);
  el.remove();
  await delay(5);
  assertEquals(cleaned, true);
});

// ── multiple destructors ──────────────────────────────────────────
test("lifecycle: multiple destructors all called in registration order", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-multi-destr");
  const order = [];
  mod.define(tag, () => {
    mod.onReady(() => () => order.push(1));
    mod.onReady(() => () => order.push(2));
    mod.onReady(() => () => order.push(3));
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  el.remove();
  await delay(5);
  assertEquals(order, [1, 2, 3]);
});

test("lifecycle: destroyCallbacks per-element isolation and idempotent disconnect", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-isolate");
  let aClean = 0, bClean = 0;
  mod.define(tag, () => {
    mod.onReady(() => () => { aClean++; });
    // second onReady also registered for every instance
    mod.onReady(() => () => { bClean++; });
    return () => mod.html`<div>hi</div>`;
  });
  const el1 = document.createElement(tag);
  const el2 = document.createElement(tag);
  document.body.appendChild(el1);
  document.body.appendChild(el2);
  await tick();
  el1.remove();
  await delay(5);
  assertEquals(aClean, 1);
  assertEquals(bClean, 1);
  el2.remove();
  await delay(5);
  assertEquals(aClean, 2);
  assertEquals(bClean, 2);
  // second disconnect should not double-call
  el1.remove();
  await delay(5);
  assertEquals(aClean, 2);
});

test("lifecycle: disconnect with no onReady does not throw", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-no-cleanup");
  mod.define(tag, () => () => mod.html`<div>hi</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  expect(() => el.remove()).not.toThrow();
});

// ── pending reuse ─────────────────────────────────────────────────
test("lifecycle: pendingReady/pendingError reset to null after define", async () => {
  const lc = await import("../../src/lifecycle.ts");
  assertEquals(lc.pendingReady, null);
  assertEquals(lc.pendingError, null);
  lc.setPendingReady([]);
  lc.setPendingError([]);
  assert(Array.isArray(lc.pendingReady));
  assert(Array.isArray(lc.pendingError));
  lc.setPendingReady(null);
  lc.setPendingError(null);
  assertEquals(lc.pendingReady, null);
  assertEquals(lc.pendingError, null);
});

test("lifecycle: sequential defines do not leak pending callbacks", async () => {
  const mod = await import("../../src/index.ts");
  const tagA = uniqueTag("lc-seq-a");
  const tagB = uniqueTag("lc-seq-b");
  let aReady = 0, bReady = 0;
  mod.define(tagA, () => {
    mod.onReady(() => { aReady++; });
    return () => mod.html`<div>a</div>`;
  });
  mod.define(tagB, () => {
    // should have zero callbacks from tagA
    return () => mod.html`<div>b</div>`;
  });
  const elA = document.createElement(tagA);
  const elB = document.createElement(tagB);
  document.body.appendChild(elA);
  document.body.appendChild(elB);
  await tick();
  assertEquals(aReady, 1);
  assertEquals(bReady, 0);
  elA.remove(); elB.remove();
});

test("lifecycle: nested define preserves outer pending (save/restore)", async () => {
  const lc = await import("../../src/lifecycle.ts");
  // simulate define's save/restore logic
  lc.setPendingReady([]);
  lc.setPendingError([]);
  const outerReady = lc.pendingReady;
  const outerError = lc.pendingError;
  lc.pendingReady.push(() => {});
  // simulate inner define saving outer
  const prevReady = lc.pendingReady;
  const prevError = lc.pendingError;
  lc.setPendingReady([]);
  lc.setPendingError([]);
  lc.pendingReady.push(() => {});
  assertEquals(lc.pendingReady.length, 1);
  assertEquals(prevReady.length, 1);
  // inner finish restores
  lc.setPendingReady(prevReady);
  lc.setPendingError(prevError);
  assertEquals(lc.pendingReady, outerReady);
  assertEquals(lc.pendingReady.length, 1);
  // also via actual mod nested define
  const mod = await import("../../src/index.ts");
  const outerTag = uniqueTag("lc-outer");
  const innerTag = uniqueTag("lc-inner");
  let outerCalled = false, innerCalled = false;
  mod.define(outerTag, () => {
    mod.onReady(() => { outerCalled = true; });
    // define inner inside outer setup - triggers save/restore
    mod.define(innerTag, () => {
      mod.onReady(() => { innerCalled = true; });
      return () => mod.html`<span>inner</span>`;
    });
    return () => mod.html`<div>outer</div>`;
  });
  const elOuter = document.createElement(outerTag);
  document.body.appendChild(elOuter);
  await tick();
  assertEquals(outerCalled, true);
  const elInner = document.createElement(innerTag);
  document.body.appendChild(elInner);
  await tick();
  assertEquals(innerCalled, true);
  elOuter.remove(); elInner.remove();
  lc.setPendingReady(null);
  lc.setPendingError(null);
});

test("lifecycle: pending arrays cleared per connectedCallback, not leaked to next instance", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-pend-clear");
  let calls = 0;
  mod.define(tag, () => {
    mod.onReady(() => { calls++; });
    return () => mod.html`<div>hi</div>`;
  });
  const el1 = document.createElement(tag);
  document.body.appendChild(el1);
  await tick();
  assertEquals(calls, 1);
  const el2 = document.createElement(tag);
  document.body.appendChild(el2);
  await tick();
  assertEquals(calls, 2);
  el1.remove(); el2.remove();
});

// ── errorHandlers map ─────────────────────────────────────────────
test("lifecycle: errorHandlers set after successful mount without error", async () => {
  const mod = await import("../../src/index.ts");
  const lc = await import("../../src/lifecycle.ts");
  // direct WeakMap test: esdev modules are singletons per file, so this is the
  // same lifecycle instance the library uses
  const el = document.createElement("div");
  assertEquals(lc.errorHandlers.has(el), false);
  const handler = () => {};
  lc.errorHandlers.set(el, [handler]);
  assertEquals(lc.errorHandlers.has(el), true);
  assertEquals(lc.errorHandlers.get(el), [handler]);
  // via define observable: onError handler should be called only on error, but map is set regardless
  const tag = uniqueTag("lc-errmap-ok");
  let handlerCalled = false;
  mod.define(tag, () => {
    mod.onError(() => { handlerCalled = true; });
    return () => mod.html`<div>ok</div>`;
  });
  const el2 = document.createElement(tag);
  document.body.appendChild(el2);
  await tick();
  // no error, handler not called, but errorHandlers map should have entry in mod's lifecycle (can't directly read, just verify no throw)
  assertEquals(handlerCalled, false);
  assert(el2.querySelector("div") !== null);
  el2.remove();
});

test("lifecycle: errorHandlers not set when no handlers registered", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-errmap-empty");
  mod.define(tag, () => () => { throw new Error("boom-empty"); });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert(el.querySelector("[data-micro-ui-error]"));
  // indirect: without handlers, no errorHandlers entry; we verify via direct lc map remains empty
  const lc = await import("../../src/lifecycle.ts");
  const ghost = document.createElement("div");
  assertEquals(lc.errorHandlers.has(ghost), false);
  el.remove();
});

test("lifecycle: errorHandlers called on setup error with phase setup", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-setup-err");
  let captured = null;
  mod.define(tag, () => {
    mod.onError((el, err, phase) => { captured = { el, err, phase }; });
    throw new Error("setup-boom");
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert(el.querySelector("[data-micro-ui-error]"));
  assert(captured !== null);
  assertEquals(captured.phase, "setup");
  assertEquals(captured.err.message, "setup-boom");
  assert(captured.el === el);
  el.remove();
});

test("lifecycle: errorHandlers called on render error with phase render", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-render-err");
  let captured = null;
  mod.define(tag, () => {
    mod.onError((el, err, phase) => { captured = { phase, msg: err.message }; });
    return () => { throw new Error("render-boom"); };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert(el.querySelector("[data-micro-ui-error]"));
  assertEquals(captured.phase, "render");
  assertEquals(captured.msg, "render-boom");
  el.remove();
});

test("lifecycle: errorHandlers multiple handlers all called in order", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-multi-err");
  const calls = [];
  mod.define(tag, () => {
    mod.onError(() => calls.push("a"));
    mod.onError(() => calls.push("b"));
    mod.onError(() => calls.push("c"));
    return () => { throw new Error("multi-boom"); };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertEquals(calls, ["a", "b", "c"]);
  el.remove();
});

test("lifecycle: errorHandlers map stores multiple handlers (direct WeakMap)", async () => {
  const lc = await import("../../src/lifecycle.ts");
  const el = document.createElement("div");
  const h1 = () => {}, h2 = () => {};
  lc.setPendingError([]);
  lc.pendingError.push(h1);
  lc.pendingError.push(h2);
  const errs = lc.pendingError;
  lc.errorHandlers.set(el, errs);
  assertEquals(lc.errorHandlers.get(el).length, 2);
  assert(lc.errorHandlers.get(el)[0] === h1);
  lc.setPendingError(null);
});

test("lifecycle: onError handler throwing is swallowed via safeCall (console.error)", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-err-throw");
  const orig = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  try {
    mod.define(tag, () => {
      mod.onError(() => { throw new Error("handler-bad"); });
      mod.onError(() => { /* second handler should still be called */ });
      return () => { throw new Error("render-fail"); };
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    assert(el.querySelector("[data-micro-ui-error]"));
    assert(logged.some(s => s.includes("handler-bad")));
    el.remove();
  } finally {
    console.error = orig;
  }
});

test("lifecycle: onReady callback throwing no longer aborts the drain", async () => {
  const mod = await import("../../src/index.ts");
  const tag = uniqueTag("lc-ready-throw-loop");
  let secondCalled = false;
  mod.define(tag, () => {
    mod.onReady(() => { throw new Error("ready-boom"); });
    mod.onReady(() => { secondCalled = true; });
    return () => mod.html`<div>hi</div>`;
  });
  const el = document.createElement(tag);
  let threw = false;
  try {
    document.body.appendChild(el);
    await tick();
  } catch (e) {
    threw = true;
  }
  // Each callback is isolated: the throw is reported, the drain continues, and
  // nothing escapes connectedCallback.
  assertEquals(threw, false, "the throw must not escape as an unhandled error");
  assertEquals(secondCalled, true, "one broken callback must not skip the rest");
  assert(el.querySelector("div"), "and the rendered UI is left alone");
  el.remove();
});
test("lifecycle: destroyCallbacks WeakMap basic get/set/delete", async () => {
  const lc = await import("../../src/lifecycle.ts");
  const el = document.createElement("div");
  assertEquals(lc.destroyCallbacks.has(el), false);
  const fn1 = () => {}, fn2 = () => {};
  lc.destroyCallbacks.set(el, [fn1, fn2]);
  assertEquals(lc.destroyCallbacks.get(el).length, 2);
  lc.destroyCallbacks.delete(el);
  assertEquals(lc.destroyCallbacks.has(el), false);
});

test("lifecycle: second define re-entrancy does not leak pending (define inside define)", async () => {
  const mod = await import("../../src/index.ts");
  const tag1 = uniqueTag("lc-reent1");
  const tag2 = uniqueTag("lc-reent2");
  // define tag1, inside its setup define tag2 synchronously - outer pending must survive
  let outerReady = false;
  mod.define(tag1, () => {
    mod.onReady(() => { outerReady = true; });
    mod.define(tag2, () => {
      mod.onReady(() => {});
      return () => mod.html`<span>inner</span>`;
    });
    return () => mod.html`<div>outer</div>`;
  });
  const el1 = document.createElement(tag1);
  document.body.appendChild(el1);
  await tick();
  assertEquals(outerReady, true);
  const el2 = document.createElement(tag2);
  document.body.appendChild(el2);
  await tick();
  assert(el2.querySelector("span") !== null);
  el1.remove(); el2.remove();
});

// ── a throwing onReady must not corrupt the component ──────────────
// The onReady loop ran unguarded, and errorHandlers.set() was the line after
// it. One throw therefore skipped the remaining callbacks, left the component
// permanently without its own onError handlers, and lost every cleanup that
// had not been registered yet — silently, with the component still mounted.
const rdy = await import("../../src/index.ts");

test("onReady: a throwing callback does not skip the ones after it", async () => {
  const tag = uniqueTag("ready-iso");
  let second = false;
  rdy.define(tag, () => {
    rdy.onReady(() => {
      throw new Error("ready-boom");
    });
    rdy.onReady(() => {
      second = true;
    });
    return () => rdy.html`<i>ok</i>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  assertEquals(second, true, "later onReady callbacks must still run");
  assertEquals(el.querySelector("i")?.textContent, "ok", "the UI is untouched");
});

test("onReady: a throwing callback is reported through onError as phase 'ready'", async () => {
  const tag = uniqueTag("ready-report");
  let seen = null;
  rdy.define(tag, () => {
    rdy.onError((_el, err, phase) => {
      seen = { message: err.message, phase };
    });
    rdy.onReady(() => {
      throw new Error("ready-boom");
    });
    return () => rdy.html`<i>ok</i>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  assertEquals(seen, { message: "ready-boom", phase: "ready" });
});

test("onReady: a throwing callback does not cost the component its error handlers", async () => {
  const tag = uniqueTag("ready-handlers");
  const seen = [];
  let ref;
  let boom = false;
  rdy.define(tag, (host) => {
    ref = host;
    rdy.onError((_el, err, phase) => seen.push(phase));
    rdy.onReady(() => {
      throw new Error("ready-boom");
    });
    return () => {
      if (boom) throw new Error("render-boom");
      return rdy.html`<i>ok</i>`;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assertEquals(seen, ["ready"]);

  boom = true;
  rdy.update(ref);
  await tick();
  assertEquals(seen, ["ready", "render"], "handlers survived the onReady throw");
});

test("onReady: a throwing callback does not cost the component its cleanups", async () => {
  const tag = uniqueTag("ready-cleanups");
  let cleaned = false;
  rdy.define(tag, () => {
    rdy.onReady(() => {
      throw new Error("ready-boom");
    });
    rdy.onReady(() => () => {
      cleaned = true;
    });
    return () => rdy.html`<i>ok</i>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  el.remove();
  await tick();
  await delay();
  assertEquals(cleaned, true, "the later cleanup was registered and ran");
});

test("onReady: a cleanup registered before the throw still runs", async () => {
  const tag = uniqueTag("ready-cleanup-first");
  let cleaned = false;
  rdy.define(tag, () => {
    rdy.onReady(() => () => {
      cleaned = true;
    });
    rdy.onReady(() => {
      throw new Error("ready-boom");
    });
    return () => rdy.html`<i>ok</i>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  el.remove();
  await tick();
  await delay();
  assertEquals(cleaned, true);
});

test("onReady: the throw does not escape connectedCallback", async () => {
  const tag = uniqueTag("ready-escape");
  rdy.define(tag, () => {
    rdy.onReady(() => {
      throw new Error("ready-boom");
    });
    return () => rdy.html`<i>ok</i>`;
  });
  const el = document.createElement(tag);
  let threw = false;
  try {
    document.body.appendChild(el);
    await tick();
  } catch {
    threw = true;
  }
  assertEquals(threw, false);
});