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
