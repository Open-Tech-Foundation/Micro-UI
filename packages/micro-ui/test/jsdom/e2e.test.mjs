// E2E tests ported from the FakeDOM suite (test/micro-ui.e2e.test.mjs) to run
// against a real DOM (jsdom). Full shopping-cart, form, store-path and
// subscribe flows through components.
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.mjs";

let importCounter = 0;
async function fresh() {
  return await import(`../../src/index.ts?e2e-${Date.now()}-${importCounter++}`);
}
function tick() {
  return new Promise((r) => queueMicrotask(r));
}
function delay(n = 5) {
  return new Promise((r) => setTimeout(r, n));
}
async function settle() {
  await tick();
  await delay(5);
}

// E2E: full shopping cart flow via library store + components
test("e2e: shopping cart add / remove / qty / count stays in sync", async () => {
  const { define, html, update, flush, store, onReady } = await fresh();

  store.set("cart", []);

  function addToCart(p) {
    const cart = store.get("cart");
    const ex = cart.find((i) => i.id === p.id);
    store.set("cart", ex ? cart.map((i) => i.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...cart, { ...p, qty: 1 }]);
  }
  function removeFromCart(id) { store.set("cart", (store.get("cart")).filter((i) => i.id !== id)); }
  function updateQty(id, qty) { if (qty <= 0) return removeFromCart(id); store.set("cart", (store.get("cart")).map((i) => i.id === id ? { ...i, qty } : i)); }

  const PRODUCTS = [
    { id: 1, name: "Keyboard", price: 10 },
    { id: 2, name: "Mouse", price: 20 },
    { id: 3, name: "Monitor", price: 30 },
  ];

  define("e2e-product-list", () => () => html`<div>${PRODUCTS.map(p => html`<button class="add" onclick=${() => addToCart(p)}>${p.name}</button>`)}</div>`);
  const cartTag = "e2e-cart-" + Date.now();
  define(cartTag, (el) => {
    onReady(() => store.subscribe("cart", () => update(el)));
    return () => {
      const cart = store.get("cart");
      const count = cart.reduce((s, i) => s + i.qty, 0);
      return html`<div><h3>Cart (${count})</h3><ul>${cart.map((it) => html`<li key=${it.id} data-id="${it.id}">${it.name}:${it.qty}<button class="rem" onclick=${() => removeFromCart(it.id)}>x</button></li>`)}</ul></div>`;
    };
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  const list = document.createElement("e2e-product-list");
  const cartEl = document.createElement(cartTag);
  host.appendChild(list);
  host.appendChild(cartEl);
  await tick();

  assert.equal(store.get("cart").length, 0);
  addToCart(PRODUCTS[0]);
  await settle(); flush();
  assert.equal(cartEl.querySelectorAll("li").length, 1);
  assert.equal(cartEl.textContent.includes("(1)"), true);

  addToCart(PRODUCTS[1]);
  await settle(); flush();
  assert.equal(cartEl.querySelectorAll("li").length, 2);
  assert.equal(cartEl.textContent.includes("(2)"), true);

  addToCart(PRODUCTS[2]);
  await settle(); flush();
  assert.equal(cartEl.querySelectorAll("li").length, 3);

  // Remove middle (id 2)
  removeFromCart(2);
  await settle(); flush();
  assert.equal(cartEl.querySelectorAll("li").length, 2);
  const ids = [...cartEl.querySelectorAll("li")].map(n => n.getAttribute("data-id"));
  assert.ok(ids.includes("1"));
  assert.ok(ids.includes("3"));
  assert.ok(!ids.includes("2"));

  // Qty decrement to 0 should remove
  updateQty(1, 0);
  await settle(); flush();
  assert.equal(cartEl.querySelectorAll("li").length, 1);

  // Clear
  removeFromCart(3);
  await settle(); flush();
  assert.equal(cartEl.querySelectorAll("li").length, 0);
});

// E2E: form input via library store path
test("e2e: form fields sync via store path", async () => {
  const { define, html, update, flush, store, onReady } = await fresh();

  store.set("form", { name: "", email: "" });

  const tag = "e2e-form-" + Date.now();
  define(tag, (el) => {
    onReady(() => store.subscribe("form", () => update(el)));
    return () => html`<div><input value=${store.get("form", { path: "name" }) ?? ""} oninput=${(e) => store.set("form", (e.target).value, { path: "name" })}></div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  const input = el.querySelector("input");
  input.value = "Ada";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  store.set("form", "Ada", { path: "name" });
  await settle(); flush();
  assert.equal(store.get("form", { path: "name" }), "Ada");
});

// E2E: library store + subscribe with components
test("e2e: library store drives component render and delete cleans up", async () => {
  const { define, html, update, flush, store, onReady } = await fresh();

  store.set("items", ["alpha", "beta", "gamma"]);

  const tag = "e2e-libstore-" + Date.now();
  define(tag, (el) => {
    onReady(() => store.subscribe("items", () => update(el)));
    return () => {
      const items = store.get("items") || [];
      return html`<ul>${items.map((t, i) => html`<li key=${String(i)}>${t}</li>`)}</ul>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.querySelectorAll("li").length, 3);
  assert.equal(el.textContent, "alphabetagamma");

  store.set("items", ["alpha", "gamma"]);
  await settle(); flush();
  assert.equal(el.querySelectorAll("li").length, 2);
  assert.equal(el.textContent, "alphagamma");

  store.del("items");
  await settle(); flush();
  assert.equal(el.querySelectorAll("li").length, 0);
});

// E2E: path-based store with nested form fields
test("e2e: path-based store updates nested fields independently", async () => {
  const { define, html, update, flush, store, onReady } = await fresh();

  store.set("profile", { first: "", last: "", age: 0 });

  const tag = "e2e-pathform-" + Date.now();
  define(tag, (el) => {
    onReady(() => store.subscribe("profile", () => update(el)));
    return () => {
      const p = store.get("profile") || {};
      return html`<div><span class="out">${p.first} ${p.last} (${p.age})</span></div>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await tick();
  assert.equal(el.querySelector(".out").textContent, "  (0)");

  store.set("profile", "Ada", { path: "first" });
  await settle(); flush();
  assert.equal(el.querySelector(".out").textContent, "Ada  (0)");

  store.set("profile", "Lovelace", { path: "last" });
  await settle(); flush();
  assert.equal(el.querySelector(".out").textContent, "Ada Lovelace (0)");

  store.set("profile", 36, { path: "age" });
  await settle(); flush();
  assert.equal(el.querySelector(".out").textContent, "Ada Lovelace (36)");
});

// E2E: subscribe unsubscribe stops component updates
test("e2e: unsubscribe stops subscriber from being called", async () => {
  const { store } = await fresh();

  store.set("counter", 0);
  const calls = [];
  const unsub = store.subscribe("counter", (v) => calls.push(v));

  store.set("counter", 1);
  assert.deepEqual(calls, [1]);
  store.set("counter", 2);
  assert.deepEqual(calls, [1, 2]);

  unsub();
  store.set("counter", 3);
  assert.deepEqual(calls, [1, 2]);
});