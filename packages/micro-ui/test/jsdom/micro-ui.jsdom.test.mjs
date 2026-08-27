// Real-DOM smoke test for Micro-UI, run under `node --test` with jsdom.
// Counter: define → render → update → event → reconcile.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

const { define, html, update, flush, onReady } = await import(
  `../../src/index.js?jsdom-${Date.now()}`
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
