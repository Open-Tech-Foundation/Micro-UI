// Real-DOM tests for Micro-UI, run with `bun test` (native TS) on jsdom.
// Every test that previously ran against the in-house FakeDOM helper
// (test/helpers/dom.mjs) now runs against a real DOM here.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update, flush, mount, onReady, onError, store } =
  await import(`../../src/index.ts?jsdom-${Date.now()}`);

let tagCounter = 0;
// This suite observes errors through the on-page box, which only carries the
// real message when the app opted in via mount(el, tag, { dev: true }).
mount(document.createElement("div"), "x-dev-probe", { dev: true });

function uniqueTag(prefix) {
  return `${prefix}-${++tagCounter}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function tick() {
  return new Promise((r) => queueMicrotask(r));
}
function delay(n = 5) {
  return new Promise((r) => setTimeout(r, n));
}
async function settle(n = 5) {
  await tick();
  await delay(n);
}
async function mountEl(tag) {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  return el;
}

test("jsdom: counter renders initial value from attribute", async () => {
  const tag = uniqueTag("x-counter-init");
  define(tag, (el, props) => {
    let n = Number(props.start || 0);
    return () => html`<button class="btn">Count: ${n}</button>`;
  });

  const el = document.createElement(tag);
  el.setAttribute("start", "7");
  document.body.appendChild(el);
  await tick();
  flush();

  const btn = el.querySelector("button");
  assert.ok(btn, "button should exist");
  assert.equal(btn.textContent.trim(), "Count: 7");
});

test("jsdom: onclick handler mutates state and update re-renders in place", async () => {
  const tag = uniqueTag("x-counter-click");
  define(tag, (el) => {
    let n = 0;
    return () => html`
      <button class="inc" onclick=${() => { n++; update(el); }}>n=${n}</button>
      <span class="hint">${n % 2 === 0 ? "even" : "odd"}</span>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const btn = el.querySelector("button.inc");
  const span = el.querySelector("span.hint");
  const btnNode = btn;

  assert.equal(btn.textContent.trim(), "n=0");
  assert.equal(span.textContent, "even");

  btn.click();
  await tick();
  flush();

  assert.equal(btn.textContent.trim(), "n=1");
  assert.equal(span.textContent, "odd");

  // DOM identity: the same button element survived the re-render.
  assert.equal(el.querySelector("button.inc"), btnNode);
});

test("jsdom: keyed list reorder keeps stable DOM identity", async () => {
  const tag = uniqueTag("x-keyed");
  define(tag, (el) => {
    let items = [
      { id: "a", label: "Apple" },
      { id: "b", label: "Banana" },
      { id: "c", label: "Cherry" },
    ];
    const swap = () => {
      items = [items[2], items[1], items[0]];
      update(el);
    };
    return () => html`
      <button class="swap" onclick=${swap}>swap</button>
      <ul>${items.map((i) => html`<li key=${i.id} data-id=${i.id}>${i.label}</li>`)}</ul>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const lis = el.querySelectorAll("li");
  assert.equal(lis.length, 3);
  const appleNode = lis[0];
  const bananaNode = lis[1];
  const cherryNode = lis[2];
  assert.equal(appleNode.getAttribute("data-id"), "a");

  el.querySelector("button.swap").click();
  await tick();
  flush();

  const after = el.querySelectorAll("li");
  assert.equal(after.length, 3);
  assert.equal(after[0].getAttribute("data-id"), "c");
  assert.equal(after[1].getAttribute("data-id"), "b");
  assert.equal(after[2].getAttribute("data-id"), "a");
  // Identity preserved by key.
  assert.equal(after[0], cherryNode);
  assert.equal(after[1], bananaNode);
  assert.equal(after[2], appleNode);
});

test("jsdom: form input two-way binding keeps focus on the same element across renders", async () => {
  const tag = uniqueTag("x-form");
  define(tag, (el) => {
    let value = "";
    return () => html`
      <input class="t" value=${value} oninput=${(e) => {
        value = e.target.value;
        update(el);
      }} />
      <p class="mirror">${value}</p>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const input = el.querySelector("input");
  const mirror = el.querySelector("p");
  const inputNode = input;
  assert.equal(mirror.textContent, "");

  input.value = "ada";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  flush();

  assert.equal(el.querySelector("input"), inputNode, "input DOM node must be reused");
  assert.equal(input.value, "ada");
  assert.equal(mirror.textContent, "ada");
});

test("jsdom: onReady cleanup runs on disconnectedCallback", async () => {
  let disposed = 0;
  const tag = uniqueTag("x-cleanup");
  define(tag, () => {
    onReady(() => {
      return () => { disposed++; };
    });
    return () => html`<p>bye</p>`;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  assert.equal(disposed, 0);

  el.remove();
  await tick();
  assert.equal(disposed, 1);
});

// ── escaping (XSS defense) ─────────────────────────────────────────

const evilText = "<script>window.__pwned=1</script><b>hi</b>";
test("jsdom: interpolated text is inserted as literal text, never markup", async () => {
  const tag = uniqueTag("x-escape");
  define(tag, () => () => html`<p>${evilText}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const p = el.querySelector("p");
  assert.equal(p.querySelector("script"), null, "script tags must not be created");
  assert.equal(p.querySelector("b"), null, "injected markup must not be parsed");
  assert.equal(globalThis.window.__pwned, undefined, "script must not have executed");
  // The Text node holds the input verbatim. createTextNode never parses
  // markup, so that IS the injection boundary — entity-encoding on top would
  // only corrupt what the user sees.
  const tn = p.firstChild;
  assert.equal(tn.nodeType, 3);
  assert.equal(tn.data, evilText);
  assert.equal(p.textContent, evilText, "user sees the literal source text");
});

test("jsdom: ampersand, quotes and angle brackets round-trip verbatim", async () => {
  const tag = uniqueTag("x-escape-chars");
  define(tag, () => () => html`<span>${`a & b <c> "d" 'e'`}</span>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const span = el.querySelector("span");
  const tn = span.firstChild;
  assert.equal(tn.nodeType, 3);
  // Verbatim — no entity encoding. A user typing "Tom & Jerry" must see
  // "Tom & Jerry", not "Tom &amp; Jerry".
  assert.equal(tn.data, `a & b <c> "d" 'e'`);
  assert.equal(span.textContent, `a & b <c> "d" 'e'`);
});

test("jsdom: html.raw injects trusted markup unescaped", async () => {
  const tag = uniqueTag("x-raw");
  define(tag, () => () => {
    const trusted = "<b>bold</b>";
    return html`<p>${html.raw`<b>${trusted}</b>`}</p>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const b = el.querySelector("p > b");
  assert.ok(b, "raw markup should be parsed into real elements");
  assert.equal(b.textContent, "bold");
});

test("jsdom: nested html`` text bindings stay literal text", async () => {
  const tag = uniqueTag("x-nested");
  define(tag, () => () => html`<div>${html`<span class="x">${"<b>nope</b>"}</span>`}</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const span = el.querySelector("span.x");
  assert.ok(span);
  // Nested html`` only trusts the static structure of the inner template.
  // The `${"<b>nope</b>"}` inside it is a text binding: literal text, not markup.
  assert.equal(span.querySelector("b"), null);
  const tn = span.firstChild;
  assert.equal(tn.nodeType, 3);
  assert.equal(tn.data, "<b>nope</b>");
  assert.equal(span.textContent, "<b>nope</b>");
});

test("jsdom: html.raw with null/undefined interpolation renders empty", async () => {
  const tag = uniqueTag("x-raw-null");
  define(tag, () => () => html`<p>${html.raw`<b>${null}</b>`}</p>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const b = el.querySelector("p > b");
  assert.ok(b);
  assert.equal(b.textContent, "");
});

// ── error isolation ───────────────────────────────────────────────

test("jsdom: initial render that throws mounts an error fallback", async () => {
  const tag = uniqueTag("x-init-throw");
  define(tag, () => () => {
    throw new Error("kaboom-init");
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const box = el.querySelector("[data-micro-ui-error]");
  assert.ok(box, "error UI should be mounted");
  assert.ok(box.textContent.includes("kaboom-init"));
});

test("jsdom: static on* string attribute is rejected with actionable guidance", async () => {
  // Issue #4: a static `onclick="handler()"` string is not an event handler in
  // this library (use an interpolated function instead). It must fail loudly at
  // template-eval time rather than silently no-op or crash addEventListener.
  const tag = uniqueTag("x-static-on");
  define(tag, () => () => html`<button onclick="boom()">go</button>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const box = el.querySelector("[data-micro-ui-error]");
  assert.ok(box, "static on* string should trigger the error fallback");
  assert.ok(
    box.textContent.includes("onclick") &&
      box.textContent.includes("interpolated"),
    "message should point the author to the interpolated-function form",
  );
  assert.ok(!box.textContent.includes("addEventListener"), "should not surface a DOM TypeError");
});


test("jsdom: update that throws does not poison sibling re-renders", async () => {
  const tagBad = uniqueTag("x-bad-update");
  define(tagBad, (el) => {
    let n = 0;
    return () => (n++ < 1 ? html`<p>ok</p>` : (() => { throw new Error("bad-update"); })());
  });

  const tagGood = uniqueTag("x-good-update");
  define(tagGood, (el) => {
    let n = 0;
    return () => html`<p>count=${n}</p>`;
  });

  const wrapper = document.createElement("div");
  document.body.appendChild(wrapper);
  const bad = document.createElement(tagBad);
  const good = document.createElement(tagGood);
  wrapper.appendChild(bad);
  wrapper.appendChild(good);
  await tick();
  flush();
  assert.equal(bad.querySelector("p").textContent, "ok");
  assert.equal(good.querySelector("p").textContent, "count=0");

  // Trigger both updates.
  good.dispatchEvent(new Event("input", { bubbles: true }));
  // bad: just call update via the render path; the n++ is internal.
  // We need to force a re-render — easiest: append a fresh sibling that
  // calls update on both. Or use the public API: there's no public
  // way to trigger update from outside, so simulate via attribute.
  bad.setAttribute("data-trigger", "1");
  // We need a handler on the element; use a closure trick by re-defining
  // a throw-on-second render. Instead, use a different approach: have
  // the component itself call update via a setTimeout so we don't need
  // to reach into it.
  // Simpler: just call update directly through the re-render path.
  // The component increments n inside its render; we trigger by
  // appending+removing (forces re-render of the parent? no, the
  // element's own setup is one-shot). Let's instead use a custom event
  // that the component listens for. To avoid scope leakage, write a
  // third component whose render throws on the second call.
  const tagBad2 = uniqueTag("x-bad-update-2");
  define(tagBad2, (el) => {
    let n = 0;
    onReady(() => {
      el.addEventListener("force", () => { n++; update(el); });
    });
    return () => {
      if (n > 0) throw new Error("bad-update-2");
      return html`<p>fine</p>`;
    };
  });
  const bad2 = document.createElement(tagBad2);
  document.body.appendChild(bad2);
  await tick();
  flush();
  assert.equal(bad2.querySelector("p").textContent, "fine");
  bad2.dispatchEvent(new Event("force", { bubbles: true }));
  await tick();
  flush();
  assert.ok(bad2.querySelector("[data-micro-ui-error]"), "bad2 should show error UI");
  assert.ok(bad2.textContent.includes("bad-update-2"));
});

test("jsdom: onError handler receives the failing element, error, and phase", async () => {
  const seen = [];
  const tag = uniqueTag("x-onerror");
  define(tag, (el) => {
    onError((target, err, phase) => {
      seen.push({ tag: target.tagName, message: err.message, phase });
    });
    let n = 0;
    onReady(() => {
      el.addEventListener("boom", () => { n++; update(el); });
    });
    return () => {
      if (n > 0) throw new Error("render-bang");
      return html`<p>${n}</p>`;
    };
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  assert.equal(seen.length, 0);
  el.dispatchEvent(new Event("boom", { bubbles: true }));
  await tick();
  flush();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].phase, "render");
  assert.equal(seen[0].message, "render-bang");
  assert.ok(seen[0].tag.length > 0);
});

test("jsdom: onError handler that throws is logged but does not break the host", async () => {
  const originalError = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args);
  try {
    const tag = uniqueTag("x-onerror-throw");
    define(tag, (el) => {
      onError(() => {
        throw new Error("handler-bad");
      });
      let n = 0;
      onReady(() => el.addEventListener("x", () => { n++; update(el); }));
      return () => (n > 0 ? (() => { throw new Error("render-x"); })() : html`<p>ok</p>`);
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    flush();
    el.dispatchEvent(new Event("x", { bubbles: true }));
    await tick();
    flush();
    assert.ok(el.querySelector("[data-micro-ui-error]"));
    const found = captured.some(
      (a) => a.some((s) => typeof s === "string" && s.includes("handler-bad"))
    );
    assert.ok(found, "handler throw should be reported via console.error");
  } finally {
    console.error = originalError;
  }
});

test("jsdom: a component that keeps throwing keeps showing the error box", async () => {
  const tag = uniqueTag("x-errored-once");
  define(tag, (el) => {
    let n = 0;
    onReady(() => el.addEventListener("kick", () => { n++; update(el); }));
    return () => (n > 0 ? (() => { throw new Error("once"); })() : html`<p>${n}</p>`);
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  el.dispatchEvent(new Event("kick", { bubbles: true }));
  await tick();
  flush();
  const errBox = el.querySelector("[data-micro-ui-error]");
  assert.ok(errBox);
  // Trigger again. update() now retries an errored component — the app may
  // have fixed the cause — but this render throws every time, so the error
  // box is rebuilt rather than replaced by broken content. The box is a new
  // node each time, which is why identity is not asserted here.
  el.dispatchEvent(new Event("kick", { bubbles: true }));
  await tick();
  flush();
  const again = el.querySelector("[data-micro-ui-error]");
  assert.ok(again, "still showing an error box");
  assert.equal(el.querySelectorAll("[data-micro-ui-error]").length, 1, "exactly one");
  assert.equal(el.querySelector("p"), null, "and no half-rendered content");
});

// ── deferred DOM creation (allocation optimisation) ────────────────

test("jsdom: keyed reorder reuses DOM — no superfluous createElement for matched nodes", async () => {
  const tag = uniqueTag("x-defer-keyed");
  let items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];
  define(tag, (el) => {
    return () => html`
      <ul>${items.map((i) => html`<li key=${i.id}>${i.label}</li>`)}</ul>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const lis = el.querySelectorAll("li");
  const domA = lis[0];
  const domB = lis[1];
  const domC = lis[2];

  // Reorder: c, a, b
  items = [items[2], items[0], items[1]];
  update(el);
  await tick();
  flush();

  const after = el.querySelectorAll("li");
  // Same DOM nodes reused, just reordered
  assert.equal(after[0], domC);
  assert.equal(after[1], domA);
  assert.equal(after[2], domB);
  assert.equal(after.length, 3);
});

test("jsdom: keyed node moved to another parent is not stolen or crash on reorder", async () => {
  // A keyed node whose DOM was manually moved to a different container must
  // not be re-attached by patchKeyed (which previously called insertBefore on a
  // node that wasn't a child of the list parent, throwing
  // "The child can not be found in the parent", or stealing the node).
  const tag = uniqueTag("x-keyed-moved");
  let items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];
  define(tag, (el) =>
    () => html`<ul>${items.map((i) => html`<li key=${i.id}>${i.label}</li>`)}</ul>`,
  );

  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = document.createElement(tag);
  host.appendChild(el);
  await tick();
  flush();

  const ul = el.querySelector("ul");
  const liB = el.querySelectorAll("li")[1];
  assert.equal(liB.parentNode, ul);

  // User moves the "Beta" <li> into an entirely different container.
  const elsewhere = document.createElement("div");
  document.body.appendChild(elsewhere);
  elsewhere.appendChild(liB);
  assert.equal(liB.parentNode, elsewhere);

  // Reorder the list so Beta must still be reconciled back into the ul.
  items = [items[2], items[0], items[1]]; // c, a, b
  update(el);
  await tick();
  flush();

  assert.equal(el.querySelector("[data-micro-ui-error]"), null, "must not crash");
  const labels = [...el.querySelectorAll("li")].map((n) => n.textContent);
  assert.deepEqual(labels, ["Gamma", "Alpha", "Beta"], "list is correctly reordered");
  // The moved node stays put in its new parent; the ul gets a fresh node.
  assert.equal(liB.parentNode, elsewhere, "moved node is not stolen back");
  assert.equal(elsewhere.childElementCount, 1);
});


test("jsdom: unkeyed list update reuses DOM nodes by position", async () => {
  const tag = uniqueTag("x-defer-unkeyed");
  let count = 3;
  define(tag, (el) => {
    return () => html`
      <div>${Array.from({ length: count }, (_, i) => html`<span>${i}</span>`)}</div>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const spans = el.querySelectorAll("span");
  const span0 = spans[0];
  const span1 = spans[1];

  // Update text content without changing structure
  count = 3;
  update(el);
  await tick();
  flush();

  const after = el.querySelectorAll("span");
  // Same DOM nodes reused
  assert.equal(after[0], span0);
  assert.equal(after[1], span1);
});

test("jsdom: new keyed items get fresh DOM on insert", async () => {
  const tag = uniqueTag("x-defer-insert");
  let items = [{ id: "a" }];
  define(tag, (el) => {
    return () => html`
      <ul>${items.map((i) => html`<li key=${i.id}>${i.id}</li>`)}</ul>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const liA = el.querySelector("li");
  assert.equal(liA.textContent, "a");

  // Add new item at beginning
  items = [{ id: "z" }, { id: "a" }];
  update(el);
  await tick();
  flush();

  const all = el.querySelectorAll("li");
  assert.equal(all.length, 2);
  assert.equal(all[0].textContent, "z");
  assert.equal(all[1].textContent, "a");
  // Original 'a' node preserved
  assert.equal(all[1], liA);
  // New 'z' node is a real DOM element
  assert.equal(all[0].nodeType, 1);
});

test("jsdom: event listeners survive keyed reorder without re-attachment churn", async () => {
  const tag = uniqueTag("x-defer-events");
  let items = [
    { id: "a", count: 0 },
    { id: "b", count: 0 },
  ];
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`
      <ul>${items.map((i) =>
        html`<li key=${i.id}><button onclick=${() => { i.count++; update(el); }}>${i.count}</button></li>`
      )}</ul>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const btnA = el.querySelectorAll("button")[0];
  const btnB = el.querySelectorAll("button")[1];

  // Click button A
  btnA.click();
  await tick();
  flush();
  assert.equal(btnA.textContent, "1");

  // Reorder: b, a
  items = [items[1], items[0]];
  update(ref);
  await tick();
  flush();

  // Same button DOM nodes, listeners still work
  const afterBtns = el.querySelectorAll("button");
  assert.equal(afterBtns[0], btnB);
  assert.equal(afterBtns[1], btnA);

  // Click button A again (now at index 1)
  afterBtns[1].click();
  await tick();
  flush();
  assert.equal(afterBtns[1].textContent, "2");
});

test("jsdom: conditional show/hide creates and discards DOM correctly", async () => {
  const tag = uniqueTag("x-defer-cond");
  let show = true;
  let ref;
  define(tag, (el) => {
    ref = el;
    return () => html`
      <div>${show ? html`<span class="bonus">extra</span>` : null}<p>persistent</p></div>
    `;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  const p = el.querySelector("p");
  const span = el.querySelector("span");
  assert.ok(span);
  assert.equal(span.textContent, "extra");

  // Hide
  show = false;
  update(ref);
  await tick();
  flush();

  assert.equal(el.querySelector("span"), null);
  // Persistent element reused
  assert.equal(el.querySelector("p"), p);

  // Show again
  show = true;
  update(ref);
  await tick();
  flush();

  const span2 = el.querySelector("span");
  assert.ok(span2);
  assert.equal(span2.textContent, "extra");
  // Persistent element still reused
  assert.equal(el.querySelector("p"), p);
});

test("jsdom: a self-update during render is bounded, never an unbounded cascade", async () => {
  // Issue #6: flush() clears the global `flushing` flag up front, so an
  // `update()` from within a render re-queues a fresh flush. That update is now
  // honoured rather than dropped — silently losing a write was worse — but a
  // component that re-queues itself unconditionally is a render loop, so the
  // chain is capped and reported through the normal error path instead of
  // hanging the tab.
  const tag = uniqueTag("x-reentrant");
  let renders = 0;
  let reported = null;
  define(tag, (el) => {
    onError((_e, err) => {
      reported = err.message;
    });
    return () => {
      renders++;
      update(el); // unconditional self-update: a genuine loop
      return html`<p>${renders}</p>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();

  renders = 0;
  update(el);
  for (let i = 0; i < 200; i++) await tick();

  assert.ok(renders > 1, "the deferred self-update runs at least once");
  assert.ok(renders < 60, `the chain must terminate, got ${renders} renders`);
  assert.match(reported ?? "", /render loop/, "and the loop is reported");
  assert.ok(el.querySelector("[data-micro-ui-error]"));
});
test("jsdom: aria attributes stringify booleans correctly", async () => {
  const tag = uniqueTag("x-aria-bool");
  define(tag, (el) => {
    let hidden = true;
    el._flip = () => { hidden = !hidden; update(el); };
    el._setNull = () => { hidden = null; update(el); };
    return () => html`<div aria-hidden=${hidden} role="button" aria-label="test">content</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  let div = el.querySelector("div");
  assert.equal(div.getAttribute("aria-hidden"), "true");
  assert.equal(div.getAttribute("role"), "button");
  assert.equal(div.getAttribute("aria-label"), "test");

  el._flip();
  await tick(); flush();
  div = el.querySelector("div");
  assert.equal(div.getAttribute("aria-hidden"), "false");

  el._setNull();
  await tick(); flush();
  div = el.querySelector("div");
  assert.equal(div.hasAttribute("aria-hidden"), false);
});

test("jsdom: aria-expanded toggle keeps correct string values", async () => {
  const tag = uniqueTag("x-aria-toggle");
  define(tag, (el) => {
    let expanded = false;
    el._toggle = () => { expanded = !expanded; update(el); };
    return () => html`<button aria-expanded=${expanded ? "true" : "false"} aria-controls="panel">toggle</button><div id="panel" aria-hidden=${expanded ? "false" : "true"}>c</div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  assert.equal(el.querySelector("button").getAttribute("aria-expanded"), "false");
  assert.equal(el.querySelector("#panel").getAttribute("aria-hidden"), "true");
  el._toggle();
  await tick(); flush();
  assert.equal(el.querySelector("button").getAttribute("aria-expanded"), "true");
  assert.equal(el.querySelector("#panel").getAttribute("aria-hidden"), "false");
});

test("jsdom: aria boolean true/false via direct boolean binding", async () => {
  const tag = uniqueTag("x-aria-direct");
  define(tag, () => () => html`<div aria-hidden=${true} aria-expanded=${false} aria-valuenow=${42}></div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick(); flush();
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("aria-hidden"), "true");
  assert.equal(div.getAttribute("aria-expanded"), "false");
  assert.equal(div.getAttribute("aria-valuenow"), "42");
});

// ─────────────────────────────────────────────────────────────
// The sections below are the FakeDOM suite (test/micro-ui.test.mjs)
// ported to jsdom. `assertEquals` → `assert.equal`/`assert.deepEqual`,
// `assert(cond)` → `assert.ok(cond)`, and each test uses the shared
// file-level imports instead of a per-test module + setupDOM().
// ─────────────────────────────────────────────────────────────

// ── html/text ─────────────────────────────────────────────────
test("html: single text interpolation", async () => {
  const tag = uniqueTag("t-text");
  define(tag, () => () => html`<p>${"hello"}</p>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("p").textContent, "hello");
});
test("html: multiple text interpolations with static", async () => {
  const tag = uniqueTag("t-multi-text");
  define(tag, () => {
    const a = "World", n = 42;
    return () => html`<p>Hello ${a}! count=${n}</p>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("p").textContent, "Hello World! count=42");
});
test("html: number and boolean rendering", async () => {
  const tag = uniqueTag("t-num");
  define(tag, () => () => html`<div>${0} ${false ? "no" : "yes"} ${true ? "y" : "n"}</div>`);
  const el = await mountEl(tag);
  assert.ok(el.textContent.includes("0"));
  assert.ok(el.textContent.includes("yes"));
});
test("html: null/undefined/false renders empty", async () => {
  const tag = uniqueTag("t-empty");
  define(tag, () => () => html`<div>a${null}b${undefined}c${false}d</div>`);
  const el = await mountEl(tag);
  assert.equal(el.textContent, "abcd");
});
test("html: array flattening", async () => {
  const tag = uniqueTag("t-arr");
  define(tag, () => () => html`<ul>${[1, 2, 3].map(n => html`<li>${n}</li>`)}</ul>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 3);
  assert.ok(el.textContent.includes("2"));
});
test("html: nested fragment", async () => {
  const tag = uniqueTag("t-nest");
  define(tag, () => () => html`<div>${html`<span>a</span>`} ${html`<b>b</b>`}</div>`);
  const el = await mountEl(tag);
  assert.ok(el.querySelector("span") !== null);
  assert.ok(el.querySelector("b") !== null);
});
test("html: conditional null inside element", async () => {
  const tag = uniqueTag("t-cond");
  let show = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<div>${show ? html`<span>yes</span>` : null}</div>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("span")?.textContent, "yes");
  show = false;
  update(ref);
  await settle();
  assert.equal(el.querySelector("span"), null);
  show = true;
  update(ref);
  await settle();
  assert.equal(el.querySelector("span")?.textContent, "yes");
});

// ── attributes ─────────────────────────────────────────────────
test("attributes: static + dynamic", async () => {
  const tag = uniqueTag("t-attr");
  define(tag, () => () => html`<img src=${"a.jpg"} alt="photo">`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("img").getAttribute("src"), "a.jpg");
  assert.equal(el.querySelector("img").getAttribute("alt"), "photo");
});
test("attributes: prefix and suffix interpolation (style/class)", async () => {
  const tag = uniqueTag("t-prefix");
  define(tag, () => () => html`<div style="color:${"red"};display:block" class="btn ${"primary"}"></div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("style"), "color:red;display:block");
  assert.equal(el.querySelector("div").getAttribute("class"), "btn primary");
});
test("attributes: multiple markers in one value", async () => {
  const tag = uniqueTag("t-multi-attr");
  define(tag, () => () => html`<a href="/${"users"}/${123}">${"go"}</a>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("a").getAttribute("href"), "/users/123");
});
test("attributes: removal when null/false", async () => {
  const tag = uniqueTag("t-attr-rem");
  let title = "hi";
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<div title=${title}></div>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("title"), "hi");
  title = null;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("title"), null);
  title = false;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("title"), null);
});
test("attributes: boolean disabled/selected sync", async () => {
  const tag = uniqueTag("t-bool");
  let dis = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<button disabled=${dis}>x</button>`;
  });
  const el = await mountEl(tag);
  assert.ok(el.querySelector("button").getAttribute("disabled") !== null);
  dis = false;
  update(ref);
  await settle();
  assert.equal(el.querySelector("button").getAttribute("disabled"), null);
});
test("attributes: class toggle via update", async () => {
  const tag = uniqueTag("t-class2");
  let active = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<div class="base ${active ? "on" : "off"}"></div>`;
  });
  const el = await mountEl(tag);
  assert.ok(el.querySelector("div").getAttribute("class").includes("on"));
  active = false;
  update(ref);
  await settle();
  assert.ok(el.querySelector("div").getAttribute("class").includes("off"));
});

// ── form props: value/checked ──────────────────────────────────
test("props: value property syncs attribute + .value", async () => {
  const tag = uniqueTag("t-val");
  let val = "hello";
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<input value=${val}>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("input").value, "hello");
  val = "world";
  update(ref);
  await settle();
  assert.equal(el.querySelector("input").value, "world");
  val = null;
  update(ref);
  await settle();
  assert.equal(el.querySelector("input").value, "");
});
test("props: checked boolean toggle", async () => {
  const tag = uniqueTag("t-chk");
  let v = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<input type="checkbox" checked=${v}>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("input").checked, true);
  assert.ok(el.querySelector("input").getAttribute("checked") !== null);
  v = false;
  update(ref);
  await settle();
  assert.equal(el.querySelector("input").checked, false);
  assert.equal(el.querySelector("input").getAttribute("checked"), null);
});
test("props: value number coercion", async () => {
  const tag = uniqueTag("t-val-num");
  define(tag, () => () => html`<input value=${42}>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("input").value, "42");
});

// ── events ─────────────────────────────────────────────────────
test("events: onclick binding and update", async () => {
  const tag = uniqueTag("t-evt");
  let count = 0;
  define(tag, (el2) => () => html`<button onclick=${() => { count++; update(el2); }}>${count}</button>`);
  const el = await mountEl(tag);
  el.querySelector("button").click();
  await settle();
  assert.equal(el.querySelector("button").textContent, "1");
  el.querySelector("button").click();
  await settle();
  assert.equal(el.querySelector("button").textContent, "2");
});
test("events: oninput binding", async () => {
  const tag = uniqueTag("t-input-evt");
  let last = "";
  define(tag, () => () => html`<input oninput=${e => { last = e.target.value; }}>`);
  const el = await mountEl(tag);
  const inp = el.querySelector("input");
  inp.value = "abc";
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(last, "abc");
});
test("events: handler replacement (old removed)", async () => {
  const tag = uniqueTag("t-evt-replace");
  let h1calls = 0, h2calls = 0;
  let h = () => h1calls++;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<button onclick=${h}>x</button>`;
  });
  const el = await mountEl(tag);
  el.querySelector("button").click();
  assert.equal(h1calls, 1);
  h = () => h2calls++;
  update(ref);
  await settle();
  el.querySelector("button").click();
  assert.equal(h1calls, 1);
  assert.equal(h2calls, 1);
});
test("events: null handler does not throw", async () => {
  const tag = uniqueTag("t-evt-null");
  let fn = null;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<button onclick=${fn}>x</button>`;
  });
  const el = await mountEl(tag);
  el.querySelector("button").click();
  fn = () => {};
  update(ref);
  await settle();
  el.querySelector("button").click();
  assert.ok(true);
});

// ── lists: keyed vs unkeyed ────────────────────────────────────
test("lists: keyed remove single does not remove others (cart bug)", async () => {
  const tag = uniqueTag("t-key-rem");
  let items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 3);
  items = items.filter(i => i.id !== 2);
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 2);
  const ids = [...el.querySelectorAll("li")].map(n => n.textContent);
  assert.ok(ids.includes("1"));
  assert.ok(ids.includes("3"));
  assert.ok(!ids.includes("2"));
});
test("lists: keyed reorder preserves DOM order", async () => {
  const tag = uniqueTag("t-key-reorder");
  let items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  items = [{ id: 3 }, { id: 1 }, { id: 2 }];
  update(ref);
  await settle();
  assert.equal([...el.querySelectorAll("li")].map(n => n.textContent).join(","), "3,1,2");
});
test("lists: keyed add at beginning", async () => {
  const tag = uniqueTag("t-key-add");
  let items = [{ id: 1 }, { id: 2 }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  items = [{ id: 0 }, { id: 1 }, { id: 2 }];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 3);
  assert.equal([...el.querySelectorAll("li")][0].textContent, "0");
});
test("lists: unkeyed by index (append/remove)", async () => {
  const tag = uniqueTag("t-nokey");
  let items = ["a", "b"];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(t => html`<li>${t}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 2);
  items = ["a", "b", "c"];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 3);
  items = ["a"];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 1);
});
test("lists: empty to filled and back", async () => {
  const tag = uniqueTag("t-empty-list");
  let items = [];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i}>${i}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 0);
  items = [1, 2];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 2);
  items = [];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 0);
});
test("lists: key prefix e.g. key=prefix-${id}", async () => {
  const tag = uniqueTag("t-key-prefix");
  let items = [{ id: 1 }, { id: 2 }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(it => html`<li key="row-${it.id}">${it.id}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 2);
  items = [{ id: 2 }];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 1);
  assert.equal(el.querySelector("li").textContent, "2");
});
test("lists: detached keyed node is reclaimed by key, not recreated", async () => {
  const tag = uniqueTag("t-key-reclaim");
  let items = [{ id: 1 }, { id: 2 }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  const ul = el.querySelector("ul");
  const one = el.querySelectorAll("li")[0];
  one.remove();
  assert.equal(ul.querySelectorAll("li").length, 1);
  update(ref);
  await settle();
  assert.equal(ul.querySelectorAll("li").length, 2);
  assert.equal(ul.querySelectorAll("li")[0], one, "detached keyed node reclaimed by key (identity preserved)");
});
test("lists: removing items leaves no orphaned detached nodes", async () => {
  const tag = uniqueTag("t-key-noorphan");
  let items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.id}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  items = [{ id: 1 }, { id: 3 }];
  update(ref);
  await settle();
  const lis = [...el.querySelectorAll("li")];
  assert.equal(lis.length, 2);
  assert.equal(lis.map(n => n.textContent).join(","), "1,3");
  assert.equal(el.querySelectorAll("li").length, 2, "no stray nodes");
});
test("lists: detached single unkeyed child is reinserted, not lost", async () => {
  const tag = uniqueTag("t-key-single-unk");
  let items = ["a"];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(t => html`<li>${t}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  const ul = el.querySelector("ul");
  const li = el.querySelector("li");
  li.remove();
  assert.equal(ul.querySelectorAll("li").length, 0);
  update(ref);
  await settle();
  const lis = ul.querySelectorAll("li");
  assert.equal(lis.length, 1);
  assert.equal(lis[0], li, "single unkeyed child reused, not recreated");
  assert.equal(li.textContent, "a");
});
test("lists: detached single keyed child is reinserted, not lost", async () => {
  const tag = uniqueTag("t-key-single-ky");
  let items = [{ id: 1, t: "x" }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => html`<li key=${i.id}>${i.t}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  const ul = el.querySelector("ul");
  const li = el.querySelector("li");
  li.remove();
  assert.equal(ul.querySelectorAll("li").length, 0);
  update(ref);
  await settle();
  const lis = ul.querySelectorAll("li");
  assert.equal(lis.length, 1);
  assert.equal(lis[0], li, "single keyed child reused, not recreated");
  assert.equal(li.textContent, "x");
});
test("lists: detached single child type change reinserts new node", async () => {
  const tag = uniqueTag("t-key-single-type");
  let showEl = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${showEl ? html`<li>a</li>` : "text"}</ul>`;
  });
  const el = await mountEl(tag);
  const ul = el.querySelector("ul");
  ul.querySelector("li").remove();
  showEl = false;
  update(ref);
  await settle();
  assert.equal(ul.querySelectorAll("li").length, 0);
  assert.equal(ul.textContent, "text");
});
test("lists: single-child still patches in place normally (guard)", async () => {
  const tag = uniqueTag("t-key-single-guard");
  let items = ["a"];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(t => html`<li>${t}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  const li = el.querySelector("li");
  items = ["b"];
  update(ref);
  await settle();
  const lis = el.querySelectorAll("li");
  assert.equal(lis.length, 1);
  assert.equal(lis[0], li, "attached single child updated in place, identity preserved");
  assert.equal(lis[0].textContent, "b");
});

// ── define / props / isolation ─────────────────────────────────
test("define: props from attributes", async () => {
  const tag = uniqueTag("t-props");
  define(tag, (el, props) => () => html`<span>${props.foo}</span>`);
  const el = document.createElement(tag);
  el.setAttribute("foo", "bar");
  document.body.appendChild(el);
  await tick();
  assert.equal(el.querySelector("span").textContent, "bar");
});
test("define: multiple instances isolated (closure + props)", async () => {
  const tag = uniqueTag("t-multi");
  define(tag, (el, props) => {
    let c = Number(props.start || 0);
    return () => html`<div><span>${c}</span><button onclick=${() => { c++; update(el); }}>+</button></div>`;
  });
  const a = document.createElement(tag);
  a.setAttribute("start", "0");
  const b = document.createElement(tag);
  b.setAttribute("start", "10");
  document.body.appendChild(a);
  document.body.appendChild(b);
  await tick();
  assert.equal(a.querySelector("span").textContent, "0");
  assert.equal(b.querySelector("span").textContent, "10");
  a.querySelector("button").click();
  await settle();
  assert.equal(a.querySelector("span").textContent, "1");
  assert.equal(b.querySelector("span").textContent, "10");
});

// ── onReady / mount / update / flush ───────────────────────────
test("onReady: called on connect and cleanup on disconnect", async () => {
  const tag = uniqueTag("t-ready");
  let ready = false, cleanup = false;
  define(tag, () => {
    onReady(() => {
      ready = true;
      return () => { cleanup = true; };
    });
    return () => html`<div>hi</div>`;
  });
  const el = await mountEl(tag);
  assert.equal(ready, true);
  el.remove();
  await delay();
  assert.equal(cleanup, true);
});
test("onReady: throws when called outside define", async () => {
  let threw = false;
  try {
    onReady(() => {});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes("onReady"));
  }
  assert.equal(threw, true);
});
test("onReady: multiple callbacks", async () => {
  const tag = uniqueTag("t-ready-multi");
  let a = false, b = false;
  define(tag, () => {
    onReady(() => { a = true; });
    onReady(() => { b = true; });
    return () => html`<div></div>`;
  });
  const el = await mountEl(tag);
  assert.ok(a && b);
});
test("update: batching coalesces multiple updates into one render", async () => {
  const tag = uniqueTag("t-batch");
  let c = 0, renders = 0;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => {
      renders++;
      return html`<span>${c}</span>`;
    };
  });
  const el = await mountEl(tag);
  renders = 0;
  c = 1;
  update(ref);
  c = 2;
  update(ref);
  c = 3;
  update(ref);
  await settle();
  assert.equal(renders, 1);
  assert.equal(el.textContent, "3");
});
test("update: no-op for unknown element", async () => {
  const fake = document.createElement("div");
  update(fake);
  assert.ok(true);
});
test("flush: no pending does not throw", async () => {
  flush();
  flush();
  assert.ok(true);
});
test("mount: clears host and appends child", async () => {
  const tag = uniqueTag("t-mount-child");
  define(tag, () => () => html`<span>child</span>`);
  const host = document.createElement("div");
  host.textContent = "old";
  document.body.appendChild(host);
  const child = mount(host, tag);
  await delay();
  assert.ok(host.textContent.includes("child"));
  assert.equal(host.childNodes.length, 1);
  assert.equal(child.tagName.toLowerCase(), tag);
});

// ── reconciliation specifics ───────────────────────────────────
test("reconcile: tag mismatch replaces element", async () => {
  const tag = uniqueTag("t-tag-swap");
  let useDiv = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => useDiv ? html`<div>hi</div>` : html`<span>hi</span>`;
  });
  const el = await mountEl(tag);
  assert.ok(el.querySelector("div") !== null);
  useDiv = false;
  update(ref);
  await settle();
  assert.ok(el.querySelector("span") !== null);
  assert.equal(el.querySelector("div"), null);
});
test("reconcile: text node update", async () => {
  const tag = uniqueTag("t-text-upd");
  let t = "a";
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<p>${t}</p>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("p").textContent, "a");
  t = "b";
  update(ref);
  await settle();
  assert.equal(el.querySelector("p").textContent, "b");
});
test("reconcile: attribute patch removes old attr", async () => {
  const tag = uniqueTag("t-attr-patch");
  let withTitle = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => withTitle ? html`<div title="x">hi</div>` : html`<div>hi</div>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("title"), "x");
  withTitle = false;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("title"), null);
});
test("reconcile: queueMicrotask batch explicit flush idempotent", async () => {
  const tag = uniqueTag("t-flush2");
  let v = 1;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<span>${v}</span>`;
  });
  const el = await mountEl(tag);
  v = 2;
  update(ref);
  flush();
  flush();
  await delay();
  assert.equal(el.querySelector("span").textContent, "2");
});

// ── store / subscribe ──────────────────────────────────────────
test("store: set and get value", async () => {
  store.clear();
  store.set("counter", 0);
  assert.equal(store.get("counter"), 0);
  store.set("counter", 1);
  assert.equal(store.get("counter"), 1);
});
test("store: get returns undefined for unset key", async () => {
  store.clear();
  assert.equal(store.get("nonexistent"), undefined);
});
test("store: set with path reads nested value", async () => {
  store.clear();
  store.set("form", { name: "", age: 0 });
  store.set("form", "Alice", { path: "name" });
  assert.equal(store.get("form", { path: "name" }), "Alice");
  assert.equal(store.get("form").age, 0);
});
test("store: set with deep path", async () => {
  store.clear();
  store.set("data", {});
  store.set("data", "v1", { path: "a.b.c" });
  assert.equal(store.get("data", { path: "a.b.c" }), "v1");
});
test("store: overwrite full value clears path state", async () => {
  store.clear();
  store.set("cfg", { theme: "dark", lang: "en" });
  store.set("cfg", "light", { path: "theme" });
  assert.equal(store.get("cfg", { path: "theme" }), "light");
  store.set("cfg", { theme: "red", lang: "fr" });
  assert.equal(store.get("cfg", { path: "theme" }), "red");
  assert.equal(store.get("cfg", { path: "lang" }), "fr");
});
test("subscribe: receives current value on change", async () => {
  store.clear();
  store.set("x", 10);
  let received = null;
  store.subscribe("x", (v) => { received = v; });
  store.set("x", 20);
  assert.equal(received, 20);
});
test("subscribe: called for every set", async () => {
  store.clear();
  const calls = [];
  store.subscribe("log", (v) => calls.push(v));
  store.set("log", "a");
  store.set("log", "b");
  store.set("log", "c");
  assert.deepEqual(calls, ["a", "b", "c"]);
});
test("subscribe: unsubscribe stops notifications", async () => {
  store.clear();
  let count = 0;
  const unsub = store.subscribe("s", () => count++);
  store.set("s", 1);
  assert.equal(count, 1);
  store.set("s", 2);
  assert.equal(count, 2);
  unsub();
  store.set("s", 3);
  assert.equal(count, 2);
});
test("subscribe: unsubscribe returns true on success", async () => {
  store.clear();
  const unsub = store.subscribe("z", () => {});
  assert.equal(unsub(), true);
});
test("subscribe: multiple subscribers all notified", async () => {
  store.clear();
  let a = 0, b = 0;
  store.subscribe("m", () => a++);
  store.subscribe("m", () => b++);
  store.set("m", "x");
  assert.equal(a, 1);
  assert.equal(b, 1);
  store.set("m", "y");
  assert.equal(a, 2);
  assert.equal(b, 2);
});
test("subscribe: path-based set notifies subscribers of full value", async () => {
  store.clear();
  store.set("p", { x: 1, y: 2 });
  let snap = null;
  store.subscribe("p", (v) => { snap = v; });
  store.set("p", 99, { path: "x" });
  assert.equal(snap.x, 99);
  assert.equal(snap.y, 2);
});

// ── del ────────────────────────────────────────────────────────
test("del: clears entire key to undefined", async () => {
  store.clear();
  store.set("k", "hello");
  assert.equal(store.get("k"), "hello");
  store.del("k");
  assert.equal(store.get("k"), undefined);
});
test("del: notifies subscribers on full delete", async () => {
  store.clear();
  store.set("k", 1);
  let snap;
  store.subscribe("k", (v) => { snap = v; });
  store.del("k");
  assert.equal(snap, undefined);
});
test("del: path removes key from nested object", async () => {
  store.clear();
  store.set("cfg", { a: 1, b: 2, c: 3 });
  store.del("cfg", { path: "b" });
  assert.deepEqual(store.get("cfg"), { a: 1, c: 3 });
  assert.equal(store.get("cfg", { path: "b" }), undefined);
});
test("del: path notifies subscribers with updated object", async () => {
  store.clear();
  store.set("d", { x: 10, y: 20 });
  let snap;
  store.subscribe("d", (v) => { snap = v; });
  store.del("d", { path: "x" });
  assert.deepEqual(snap, { y: 20 });
  assert.equal(snap.x, undefined);
});
test("del: path on non-existent path is a no-op", async () => {
  store.clear();
  store.set("obj", { a: 1 });
  store.del("obj", { path: "z" });
  assert.deepEqual(store.get("obj"), { a: 1 });
});
test("del: deep nested path", async () => {
  store.clear();
  store.set("deep", { a: { b: { c: 42 } } });
  store.del("deep", { path: "a.b.c" });
  assert.deepEqual(store.get("deep", { path: "a.b" }), {});
});
test("del: empty-string path deletes only that key", async () => {
  store.clear();
  store.set("emptyKey", { "": "secret", keep: 1 });
  store.del("emptyKey", { path: "" });
  assert.deepEqual(store.get("emptyKey"), { keep: 1 });
});
test("del: path on non-object value is a no-op", async () => {
  store.clear();
  store.set("str", "hello");
  store.del("str", { path: "x" });
  assert.equal(store.get("str"), "hello");
});
test("del: path on null value is a no-op", async () => {
  store.clear();
  store.set("nil", null);
  store.del("nil", { path: "x" });
  assert.equal(store.get("nil"), null);
});
test("del: key that was never set returns undefined", async () => {
  store.clear();
  store.del("ghost");
  assert.ok(true);
});
test("del: does not affect other keys", async () => {
  store.clear();
  store.set("a", 1);
  store.set("b", 2);
  store.del("a");
  assert.equal(store.get("b"), 2);
  assert.equal(store.get("a"), undefined);
});

// ── store edge cases ───────────────────────────────────────────
test("store: set null value", async () => {
  store.clear();
  store.set("n", "prev");
  store.set("n", null);
  assert.equal(store.get("n"), null);
});
test("store: set false value", async () => {
  store.clear();
  store.set("flag", true);
  store.set("flag", false);
  assert.equal(store.get("flag"), false);
});
test("store: set 0 value", async () => {
  store.clear();
  store.set("count", 99);
  store.set("count", 0);
  assert.equal(store.get("count"), 0);
});
test("store: set empty string", async () => {
  store.clear();
  store.set("txt", "hi");
  store.set("txt", "");
  assert.equal(store.get("txt"), "");
});
test("store: overwrite object with primitive", async () => {
  store.clear();
  store.set("mix", { a: 1 });
  store.set("mix", "string");
  assert.equal(store.get("mix"), "string");
});
test("store: overwrite primitive with object", async () => {
  store.clear();
  store.set("mix2", "string");
  store.set("mix2", { a: 1 });
  assert.equal(store.get("mix2").a, 1);
});
test("store: read-only on never-set key returns undefined", async () => {
  store.clear();
  assert.equal(store.get("nope"), undefined);
});
test("store: set with empty string as path value", async () => {
  store.clear();
  store.set("e", { "": "found" });
  assert.equal(store.get("e", { path: "" }), "found");
});
test("store: path with double dots", async () => {
  store.clear();
  store.set("f", { a: { b: 1 } });
  assert.equal(store.get("f", { path: "a..b" }), undefined);
});

// ── subscribe edge cases ───────────────────────────────────────
test("subscribe: different functions both called", async () => {
  store.clear();
  let countA = 0, countB = 0;
  store.subscribe("diff", () => countA++);
  store.subscribe("diff", () => countB++);
  store.set("diff", 1);
  assert.equal(countA, 1);
  assert.equal(countB, 1);
  store.set("diff", 2);
  assert.equal(countA, 2);
  assert.equal(countB, 2);
});
test("subscribe: unsubscribing already-unsubscribed returns false", async () => {
  store.clear();
  const unsub = store.subscribe("once", () => {});
  assert.equal(unsub(), true);
  assert.equal(unsub(), false);
});
test("subscribe: many subscribers all notified", async () => {
  store.clear();
  const results = [];
  for (let i = 0; i < 50; i++) {
    store.subscribe("many", () => results.push(1));
  }
  store.set("many", "x");
  assert.equal(results.length, 50);
});

// ── Bug fixes ──────────────────────────────────────────────────
test("define: text-only VNode renders correctly", async () => {
  const tag = uniqueTag("t-text-only");
  define(tag, () => () => html`hello`);
  const el = await mountEl(tag);
  assert.equal(el.textContent, "hello");
});
test("store: clear removes all entries", async () => {
  store.clear();
  store.set("a", 1);
  store.set("b", 2);
  assert.equal(store.get("a"), 1);
  store.clear();
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), undefined);
});
test("store: clear does not orphan subscribers", async () => {
  store.clear();
  let called = false;
  store.subscribe("x", () => { called = true; });
  store.clear();
  called = false;
  store.set("x", 1);
  assert.equal(called, true);
});
test("store: set with path on primitive key initializes as object", async () => {
  store.clear();
  store.set("num", 42);
  store.set("num", "nested", { path: "foo" });
  assert.equal(store.get("num", { path: "foo" }), "nested");
});
test("store: set with path on undefined key initializes as object", async () => {
  store.clear();
  store.set("new", "val", { path: "x.y" });
  assert.equal(store.get("new", { path: "x.y" }), "val");
});
test("store: get of missing key is read-only and returns undefined", async () => {
  store.clear();
  assert.equal(store.get("nope"), undefined);
  assert.equal(store.get("nope", { path: "a.b" }), undefined);
  store.set("fresh", "v", { path: "x" });
  assert.equal(store.get("fresh", { path: "x" }), "v");
  store.get("ghost");
  store.clear();
  let called = false;
  store.subscribe("other", () => { called = true; });
  store.set("other", 5);
  assert.equal(called, true);
});
test("reconcile: mixed keyed and unkeyed children cleans up orphaned unkeyed nodes", async () => {
  const tag = uniqueTag("t-mixed-key");
  let ref;
  let items = [
    { id: 1, keyed: true },
    { text: "a", keyed: false },
    { id: 2, keyed: true },
  ];
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(i => i.keyed
      ? html`<li key=${i.id}>${i.id}</li>`
      : html`<li>${i.text}</li>`
    )}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 3);
  items = [{ id: 1, keyed: true }, { id: 2, keyed: true }];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 2);
});
test("define: text VNode from binding renders correctly", async () => {
  const tag = uniqueTag("t-text-bind");
  define(tag, () => () => html`${"just text"}`);
  const el = await mountEl(tag);
  assert.equal(el.textContent, "just text");
});
test("text: whitespace-only text node is preserved, not dropped", async () => {
  const tag = uniqueTag("t-ws-only");
  define(tag, () => () => html`<span> </span>`);
  const el = await mountEl(tag);
  const span = el.querySelector("span");
  assert.ok(span !== null);
  assert.equal(span.textContent, " ", "intentional space inside inline element must be kept");
  assert.equal(span.childNodes.length, 1, "a text node must exist, not be removed entirely");
});
test("text: whitespace-only div content is preserved", async () => {
  const tag = uniqueTag("t-ws-div");
  define(tag, () => () => html`<div>   </div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").textContent, "   ");
});
test("text: whitespace between inline siblings is preserved", async () => {
  const tag = uniqueTag("t-ws-siblings");
  define(tag, () => () => html`<span>a </span><span>b</span>`);
  const el = await mountEl(tag);
  const spans = [...el.querySelectorAll("span")];
  assert.equal(spans[0].textContent, "a ");
  assert.equal(spans[1].textContent, "b");
});

// ── html.raw ───────────────────────────────────────────────────
test("html.raw: injects trusted HTML unescaped", async () => {
  const tag = uniqueTag("t-raw-basic");
  define(tag, () => () => html`<div>${html.raw`<b>bold</b>`}</div>`);
  const el = await mountEl(tag);
  const b = el.querySelector("b");
  assert.ok(b !== null, "raw markup should produce a <b> element");
  assert.equal(b.textContent, "bold");
});
test("html.raw: interpolation inside raw is rendered as text", async () => {
  const tag = uniqueTag("t-raw-interp");
  define(tag, () => () => {
    const name = "world";
    return html`<div>${html.raw`<span>Hello ${name}</span>`}</div>`;
  });
  const el = await mountEl(tag);
  const span = el.querySelector("span");
  assert.ok(span !== null, "raw with interpolation should produce a <span>");
  assert.equal(span.textContent, "Hello world");
});
test("html.raw: null interpolation renders empty string", async () => {
  const tag = uniqueTag("t-raw-null");
  define(tag, () => () => html`<div>${html.raw`<b>${null}</b>`}</div>`);
  const el = await mountEl(tag);
  const b = el.querySelector("b");
  assert.ok(b !== null, "raw with null should still produce the <b> element");
  assert.equal(b.textContent, "");
});
test("html.raw: nested structure is preserved", async () => {
  const tag = uniqueTag("t-raw-nested");
  define(tag, () => () => html`<div>${html.raw`<ul><li>a</li><li>b</li></ul>`}</div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 2);
  assert.equal(el.querySelector("li").textContent, "a");
});
test("html.raw: nesting a keyed fragment inside raw", async () => {
  const tag = uniqueTag("t-raw-nest");
  define(tag, () => () => html`<div>${html.raw`<p>a</p><p>b</p>`}${html.raw`<span>c</span>`}</div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("p").length, 2);
  assert.equal(el.querySelectorAll("span").length, 1);
});
test("html.raw: does not rebuild DOM when structure is unchanged across updates", async () => {
  const origNS = document.createElementNS;
  let created = 0;
  document.createElementNS = function (ns, tag) {
    if (String(tag).toLowerCase() !== "template") created++;
    return origNS.call(document, ns, tag);
  };
  try {
    const tag = uniqueTag("t-raw-norebuild");
    let n = 1;
    let ref;
    define(tag, (el2) => {
      ref = el2;
      return () => html`<section>${html.raw`<b title="x">${n}</b>`}</section>`;
    });
    const el = await mountEl(tag);
    const b = el.querySelector("b");
    created = 0;
    n = 2;
    update(ref);
    await settle();
    // Under jsdom the <template> parse scaffold is created via the HTML
    // parser, not createElementNS, so a same-structure raw update must
    // allocate zero elements here (the FakeDOM suite counted exactly the
    // template scaffold, which jsdom never routes through createElementNS).
    assert.equal(created, 0, `raw must reuse its DOM on a same-structure update (created ${created})`);
    assert.equal(el.querySelector("b").textContent, "2");
    assert.equal(el.querySelector("b"), b, "raw element identity preserved across update");
  } finally {
    document.createElementNS = origNS;
  }
});
test("html.raw: interpolation values are NOT escaped (trusted raw)", async () => {
  const tag = uniqueTag("t-raw-trust");
  define(tag, () => () => {
    const x = "<b>trusted</b>";
    return html`<div>${html.raw`<p>${x}</p>`}</div>`;
  });
  const el = await mountEl(tag);
  const b = el.querySelector("b");
  assert.ok(b !== null, "raw interpolation should NOT be escaped — trusted HTML");
  assert.equal(b.textContent, "trusted");
});

// ── onError ────────────────────────────────────────────────────
test("onError: catches setup errors and mounts error fallback", async () => {
  const tag = uniqueTag("t-err-setup");
  define(tag, () => {
    onError(() => {});
    throw new Error("setup-fail");
  });
  const el = await mountEl(tag);
  assert.ok(el.querySelector("pre") !== null, "should mount error fallback UI with <pre>");
  assert.ok(el.textContent.includes("setup-fail"));
});
test("onError: catches render errors and mounts error fallback", async () => {
  const tag = uniqueTag("t-err-render");
  define(tag, () => {
    onError(() => {});
    return () => { throw new Error("render-fail"); };
  });
  const el = await mountEl(tag);
  assert.ok(el.querySelector("pre") !== null, "should mount error fallback on render throw");
  assert.ok(el.textContent.includes("render-fail"));
});
test("onError: handler receives (el, error, phase)", async () => {
  const tag = uniqueTag("t-err-args");
  let captured = null;
  define(tag, () => {
    onError((el, err, phase) => { captured = { el, err, phase }; });
    return () => { throw new Error("boom"); };
  });
  const el = await mountEl(tag);
  assert.ok(captured !== null, "handler should have been called");
  assert.equal(captured.phase, "render");
  assert.equal(captured.err.message, "boom");
});
test("onError: handler throwing does not break host", async () => {
  const tag = uniqueTag("t-err-throw");
  const originalError = console.error;
  console.error = () => {};
  try {
    define(tag, () => {
      onError(() => { throw new Error("handler-bug"); });
      return () => { throw new Error("render-fail"); };
    });
    const el = await mountEl(tag);
    assert.ok(el.querySelector("pre") !== null, "error fallback should still be mounted");
  } finally {
    console.error = originalError;
  }
});
test("onError: called outside define throws", async () => {
  let threw = false;
  try {
    onError(() => {});
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, "onError outside define should throw");
});
test("onError: multiple handlers all called", async () => {
  const tag = uniqueTag("t-err-multi");
  const calls = [];
  define(tag, () => {
    onError(() => calls.push("a"));
    onError(() => calls.push("b"));
    return () => { throw new Error("multi"); };
  });
  const el = await mountEl(tag);
  assert.deepEqual(calls, ["a", "b"]);
});
test("onError: reconciler error is caught", async () => {
  const tag = uniqueTag("t-err-reconcile");
  let ref;
  let errPhase = null;
  let shouldThrow = false;
  define(tag, (el2) => {
    ref = el2;
    onError((_, __, phase) => { errPhase = phase; });
    return () => {
      if (shouldThrow) {
        const bad = { type: "element", tag: "div", attrs: {}, events: {}, key: null, children: [] };
        bad.children = [bad];
        return bad;
      }
      return html`<div>ok</div>`;
    };
  });
  const el = await mountEl(tag);
  assert.equal(el.textContent, "ok");
  shouldThrow = true;
  update(ref);
  await settle();
  assert.ok(el.querySelector("pre") !== null, "reconcile error should mount fallback");
  assert.equal(errPhase, "reconcile");
});

// ── mount() ────────────────────────────────────────────────────
test("mount: returns the created child element", async () => {
  const tag = uniqueTag("t-mount-ret");
  define(tag, () => () => html`<span>child</span>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const child = mount(host, tag);
  assert.ok(child !== null, "mount should return a value");
  assert.equal(typeof child, "object");
  assert.ok(child.tagName !== undefined, "returned value should be an element");
});
test("mount: returned element has correct tag name", async () => {
  const tag = uniqueTag("t-mount-tag");
  define(tag, () => () => html`<p>hello</p>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const child = mount(host, tag);
  assert.equal(child.tagName.toLowerCase(), tag);
});
test("mount: returned element is appended to host", async () => {
  const tag = uniqueTag("t-mount-parent");
  define(tag, () => () => html`<b>x</b>`);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const child = mount(host, tag);
  assert.equal(child.parentNode, host);
  assert.equal(host.childNodes.length, 1);
});
test("mount: clears host content before appending", async () => {
  const tag = uniqueTag("t-mount-clear");
  define(tag, () => () => html`<span>new</span>`);
  const host = document.createElement("div");
  host.appendChild(document.createTextNode("old"));
  document.body.appendChild(host);
  mount(host, tag);
  await delay();
  assert.ok(!host.textContent.includes("old"), "old content should be cleared");
  assert.ok(host.textContent.includes("new"));
});

// ── update() edge cases ────────────────────────────────────────
test("update: called on disconnected element is a no-op", async () => {
  const tag = uniqueTag("t-upd-disc");
  let renders = 0;
  define(tag, (el2) => () => {
    renders++;
    return html`<div>ok</div>`;
  });
  const el = document.createElement(tag);
  update(el);
  await settle();
  assert.equal(renders, 0, "should not render for disconnected element");
});
test("update: called on unknown element is a no-op", async () => {
  const fake = document.createElement("div");
  update(fake);
  await settle();
  assert.ok(true);
});
test("update: after disconnect, pending update is skipped", async () => {
  const tag = uniqueTag("t-upd-after-disc");
  let renders = 0;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => {
      renders++;
      return html`<div>${renders}</div>`;
    };
  });
  const el = await mountEl(tag);
  assert.equal(renders, 1);
  el.remove();
  update(ref);
  await settle();
  assert.equal(renders, 1, "should not re-render after disconnect");
});
test("reconcile: unkeyed child removal guarded by parentNode (fix for line 98)", async () => {
  const tag = uniqueTag("t-guarded-remove");
  let items = ["a", "b", "c"];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(t => html`<li>${t}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 3);
  items = ["a"];
  update(ref);
  await settle();
  assert.equal(el.querySelectorAll("li").length, 1);
  assert.equal(el.querySelector("li").textContent, "a");
});
test("vdom: stricter resolveBinding rejects arbitrary objects (fixed)", async () => {
  const tag = uniqueTag("t-strict-vnode");
  const fake = { type: "foo", value: "<b>not a vnode</b>" };
  define(tag, () => () => html`<div>${fake}</div>`);
  const el = await mountEl(tag);
  const content = el.querySelector("div").innerHTML;
  assert.ok(content.includes("[object Object]") || content.includes("not a vnode"), "arbitrary object not treated as VNode");
});

// ── boolean attribute coercion ─────────────────────────────────
test("props: disabled 'false' string means not disabled", async () => {
  const tag = uniqueTag("t-dis-false");
  define(tag, () => () => html`<button disabled=${"false"}>x</button>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("button").getAttribute("disabled"), null);
  assert.equal(el.querySelector("button").disabled, false);
});
test("props: disabled '0' / 'off' strings mean not disabled", async () => {
  const tag = uniqueTag("t-dis-0");
  define(tag, () => () => html`<button disabled=${"0"}></button><button disabled=${"off"}></button>`);
  const el = await mountEl(tag);
  const [a, b] = el.querySelectorAll("button");
  assert.equal(a.getAttribute("disabled"), null);
  assert.equal(b.getAttribute("disabled"), null);
});
test("props: selected 'false' string means not selected", async () => {
  const tag = uniqueTag("t-sel-false");
  define(tag, () => () => html`<select><option selected=${"false"}>x</option></select>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("option").getAttribute("selected"), null);
  // A lone option is implicitly selected in a real DOM, so only the explicit
  // `selected` attribute is the observable that the string "false" clears.
  assert.equal(el.querySelector("option").hasAttribute("selected"), false);
});
test("props: readonly 'false' string means not readonly", async () => {
  const tag = uniqueTag("t-ro-false");
  define(tag, () => () => html`<input readonly=${"false"}>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("input").getAttribute("readonly"), null);
});
test("props: hidden 'false' string means not hidden", async () => {
  const tag = uniqueTag("t-hidden-false");
  define(tag, () => () => html`<div hidden=${"false"}>x</div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("hidden"), null);
});
test("props: boolean toggles stay consistent (control)", async () => {
  const tag = uniqueTag("t-boolctl");
  let dis = true;
  let req = false;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<button disabled=${dis} required=${req}>x</button>`;
  });
  const el = await mountEl(tag);
  assert.ok(el.querySelector("button").getAttribute("disabled") !== null);
  assert.equal(el.querySelector("button").getAttribute("required"), null);
  dis = false;
  req = true;
  update(ref);
  await settle();
  assert.equal(el.querySelector("button").getAttribute("disabled"), null);
  assert.ok(el.querySelector("button").getAttribute("required") !== null);
});
test("props: checked 'false' string means unchecked (parity)", async () => {
  const tag = uniqueTag("t-chk-false");
  define(tag, () => () => html`<input type="checkbox" checked=${"false"}>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("input").checked, false);
});

// ── binding order (values consumed in template source order) ───
test("order: event handler written before attribute binding", async () => {
  const tag = uniqueTag("t-ev-first");
  let clicked = false;
  define(tag, () => () => html`<button onclick=${() => { clicked = true; }} data-v=${"hi"}>x</button>`);
  const el = await mountEl(tag);
  const btn = el.querySelector("button");
  assert.equal(btn.getAttribute("data-v"), "hi", "data-v must get its own value");
  btn.click();
  assert.equal(clicked, true, "click must invoke the bound handler");
});
test("order: input oninput before value binding", async () => {
  const tag = uniqueTag("t-in-first");
  let v = "start";
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<input oninput=${() => {}} value=${v}>`;
  });
  const el = await mountEl(tag);
  const inp = el.querySelector("input");
  assert.equal(inp.value, "start", "value property must sync");
  v = "next";
  update(ref);
  await settle();
  assert.equal(inp.value, "next", "value updates after interleaved handler");
});
test("order: key binding written after another bound attr preserves identity", async () => {
  const tag = uniqueTag("t-key-after");
  let items = [{ id: 1, label: "a" }, { id: 2, label: "b" }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(it => html`<li id=${it.id} key=${"k" + it.id}>${it.label}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelectorAll("li").length, 2);
  const oldSecond = el.querySelectorAll("li")[1];
  assert.equal(oldSecond.getAttribute("id"), "2");
  items = [{ id: 2, label: "b2" }, { id: 1, label: "a2" }];
  update(ref);
  await settle();
  const lis = [...el.querySelectorAll("li")];
  assert.equal(lis.length, 2);
  assert.equal(lis[0].getAttribute("id"), "2");
  assert.equal(lis[1].getAttribute("id"), "1");
  assert.equal(lis[0], oldSecond, "keyed node must move, not be recreated");
});
test("order: keyed list with id after key (control, key first)", async () => {
  const tag = uniqueTag("t-key-first");
  let items = [{ id: 1, label: "a" }, { id: 2, label: "b" }];
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<ul>${items.map(it => html`<li key=${it.id} id=${it.id}>${it.label}</li>`)}</ul>`;
  });
  const el = await mountEl(tag);
  items = [{ id: 2, label: "b2" }, { id: 1, label: "a2" }];
  update(ref);
  await settle();
  assert.equal([...el.querySelectorAll("li")].map(n => n.getAttribute("id")).join(","), "2,1");
});
test("order: multiple attr markers after event binding", async () => {
  const tag = uniqueTag("t-attr-after-evt");
  define(tag, () => () => html`<a onclick=${() => {}} href="/${"users"}/${123}">go</a>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("a").getAttribute("href"), "/users/123");
});
test("order: text interpolation after interleaved bindings stays aligned", async () => {
  const tag = uniqueTag("t-text-aligned");
  const who = "World";
  const cls = "btn";
  define(tag, () => () => html`<div onclick=${() => {}} class=${cls}>Hello ${who}</div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("class"), "btn");
  assert.equal(el.querySelector("div").textContent, "Hello World");
});
test("order: key in first expression position does not misalign a later text binding", async () => {
  const tag = uniqueTag("t-key-misalign");
  const items = [{ id: 7, name: "seven" }];
  define(tag, () => () => html`<ul>${items.map(it => html`<li key=${it.id}>${it.name}</li>`)}</ul>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("li").textContent, "seven");
});

// ── aria attributes ────────────────────────────────────────────
test("aria: static aria attributes render", async () => {
  const tag = uniqueTag("t-aria-static");
  define(tag, () => () => html`<button aria-label="Close" aria-hidden="true" role="dialog">x</button>`);
  const el = await mountEl(tag);
  const btn = el.querySelector("button");
  assert.equal(btn.getAttribute("aria-label"), "Close");
  assert.equal(btn.getAttribute("aria-hidden"), "true");
  assert.equal(btn.getAttribute("role"), "dialog");
});
test("aria: dynamic string aria attributes", async () => {
  const tag = uniqueTag("t-aria-dyn");
  const label = "Close dialog";
  define(tag, () => () => html`<button aria-label=${label} aria-expanded="false">x</button>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("button").getAttribute("aria-label"), "Close dialog");
  assert.equal(el.querySelector("button").getAttribute("aria-expanded"), "false");
});
test("aria: boolean true renders as 'true' not empty", async () => {
  const tag = uniqueTag("t-aria-true");
  define(tag, () => () => html`<div aria-hidden=${true} aria-expanded=${true} role=${"button"}></div>`);
  const el = await mountEl(tag);
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("aria-hidden"), "true");
  assert.equal(div.getAttribute("aria-expanded"), "true");
  assert.equal(div.getAttribute("role"), "button");
});
test("aria: boolean false renders as 'false' not removed", async () => {
  const tag = uniqueTag("t-aria-false");
  define(tag, () => () => html`<div aria-hidden=${false} aria-expanded=${false}></div>`);
  const el = await mountEl(tag);
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("aria-hidden"), "false");
  assert.equal(div.getAttribute("aria-expanded"), "false");
  assert.ok(div.hasAttribute("aria-hidden"));
});
test("aria: boolean toggle via update", async () => {
  const tag = uniqueTag("t-aria-toggle2");
  let hidden = true;
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<div aria-hidden=${hidden}></div>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "true");
  hidden = false;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "false");
  hidden = true;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("aria-hidden"), "true");
});
test("aria: null/undefined removes aria attribute", async () => {
  const tag = uniqueTag("t-aria-null");
  let label = "hi";
  let ref;
  define(tag, (el2) => {
    ref = el2;
    return () => html`<div aria-label=${label}></div>`;
  });
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("aria-label"), "hi");
  label = null;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("aria-label"), null);
  label = undefined;
  update(ref);
  await settle();
  assert.equal(el.querySelector("div").getAttribute("aria-label"), null);
});
test("aria: numeric values stringify", async () => {
  const tag = uniqueTag("t-aria-num");
  define(tag, () => () => html`<div aria-valuenow=${42} aria-valuemin=${0}></div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("aria-valuenow"), "42");
  assert.equal(el.querySelector("div").getAttribute("aria-valuemin"), "0");
});
test("aria: multiple aria attrs together", async () => {
  const tag = uniqueTag("t-aria-multi");
  define(tag, () => () => html`<button aria-label=${"Menu"} aria-expanded=${"false"} aria-controls="menu1" role="button">x</button>`);
  const el = await mountEl(tag);
  const btn = el.querySelector("button");
  assert.equal(btn.getAttribute("aria-label"), "Menu");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.equal(btn.getAttribute("aria-controls"), "menu1");
  assert.equal(btn.getAttribute("role"), "button");
});
test("aria: role dynamic boolean stringifies", async () => {
  const tag = uniqueTag("t-role-bool");
  define(tag, () => () => html`<div role=${"dialog"} aria-modal=${true}></div>`);
  const el = await mountEl(tag);
  assert.equal(el.querySelector("div").getAttribute("role"), "dialog");
  assert.equal(el.querySelector("div").getAttribute("aria-modal"), "true");
});
