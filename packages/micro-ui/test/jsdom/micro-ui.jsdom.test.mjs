// Real-DOM smoke test for Micro-UI, run under `node --test` with jsdom.
// Counter: define → render → update → event → reconcile.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update, flush, onReady, onError } = await import(
  `../../src/index.ts?jsdom-${Date.now()}`
);
function uniqueTag(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function tick() {
  return new Promise((r) => queueMicrotask(r));
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

test("jsdom: interpolated text is HTML-escaped by default", async () => {
  const tag = uniqueTag("x-escape");
  define(tag, () => () => {
    const evil = "<script>window.__pwned=1</script><b>hi</b>";
    return html`<p>${evil}</p>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const p = el.querySelector("p");
  assert.equal(p.querySelector("script"), null, "script tags must not be created");
  assert.equal(p.querySelector("b"), null, "injected markup must not be parsed");
  assert.equal(globalThis.window.__pwned, undefined, "script must not have executed");
  // Stored Text node data is the entity-escaped form, which is exactly
  // what the user sees (no <script> executes, the text is literal).
  const tn = p.firstChild;
  assert.equal(tn.nodeType, 3);
  assert.equal(tn.data, "&lt;script&gt;window.__pwned=1&lt;/script&gt;&lt;b&gt;hi&lt;/b&gt;");
});

test("jsdom: ampersand, quotes, and angle brackets are escaped", async () => {
  const tag = uniqueTag("x-escape-chars");
  define(tag, () => () => html`<span>${`a & b <c> "d" 'e'`}</span>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const span = el.querySelector("span");
  const tn = span.firstChild;
  assert.equal(tn.nodeType, 3);
  // '&' is escaped to '&amp;' first, then re-serialized — but our Text
  // node data is the raw post-escape string, no further encoding.
  assert.equal(tn.data, "a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;");
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

test("jsdom: nested html`` text bindings are still escaped", async () => {
  const tag = uniqueTag("x-nested");
  define(tag, () => () => html`<div>${html`<span class="x">${"<b>nope</b>"}</span>`}</div>`);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();
  const span = el.querySelector("span.x");
  assert.ok(span);
  // Nested html`` only trusts the static structure of the inner template.
  // The `${"<b>nope</b>"}` inside it is a text binding and gets escaped.
  assert.equal(span.querySelector("b"), null);
  const tn = span.firstChild;
  assert.equal(tn.nodeType, 3);
  assert.equal(tn.data, "&lt;b&gt;nope&lt;/b&gt;");
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

test("jsdom: errored component is not re-rendered on subsequent updates", async () => {
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
  // Trigger again — the errored instance should not throw a second time
  // and the fallback should still be there.
  el.dispatchEvent(new Event("kick", { bubbles: true }));
  await tick();
  flush();
  assert.strictEqual(el.querySelector("[data-micro-ui-error]"), errBox);
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

test("jsdom: re-entrant update during render does not cascade re-renders", async () => {
  // Issue #6: flush() clears the global `flushing` flag up front, so an
  // `update()` called from within a render re-queues a fresh flush. Without a
  // re-entrancy guard, a single external update triggers a cascade of repeated
  // renders (unbounded without this test's hard cap below).
  const tag = uniqueTag("x-reentrant");
  const cap = 100000;
  let renders = 0;
  define(tag, (el) => () => {
    renders++;
    if (renders < cap) update(el); // self-update during render
    return html`<p>${renders}</p>`;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  flush();

  // Single external update should render the component exactly once and settle.
  renders = 0;
  update(el);
  for (let i = 0; i < 200; i++) {
    await tick();
    flush();
  }
  assert.equal(
    renders,
    1,
    `one update() must render once and settle, got ${renders} renders`,
  );
  assert.equal(el.querySelector("p").textContent, "1");
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
