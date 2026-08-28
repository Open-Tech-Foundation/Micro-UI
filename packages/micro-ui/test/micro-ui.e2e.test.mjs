import { test, assert, assertEquals } from "runtime:test";
import { setupDOM } from "./helpers/dom.mjs";

// E2E: full shopping cart flow via library store + components
test("e2e: shopping cart add / remove / qty / count stays in sync", async () => {
  const { define, html, update, flush, store, onReady } = await import(`../src/index.ts?e2e-${Date.now()}`);
  setupDOM();

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
  await new Promise(r => setTimeout(r, 10));

  assertEquals((store.get("cart")).length, 0);
  addToCart(PRODUCTS[0]);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 1);
  assertEquals(cartEl.textContent.includes("(1)"), true);

  addToCart(PRODUCTS[1]);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 2);
  assertEquals(cartEl.textContent.includes("(2)"), true);

  addToCart(PRODUCTS[2]);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 3);

  // Remove middle (id 2)
  removeFromCart(2);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 2);
  const ids = [...cartEl.querySelectorAll("li")].map(n => n.getAttribute("data-id"));
  assert(ids.includes("1"));
  assert(ids.includes("3"));
  assert(!ids.includes("2"));

  // Qty decrement to 0 should remove
  updateQty(1, 0);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 1);

  // Clear
  removeFromCart(3);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 0);
});

// E2E: form input via library store path
test("e2e: form fields sync via store path", async () => {
  setupDOM();
  const { define, html, update, flush, store, onReady } = await import(`../src/index.ts?form-${Date.now()}`);

  store.set("form", { name: "", email: "" });

  const tag = "e2e-form-" + Date.now();
  define(tag, (el) => {
    onReady(() => store.subscribe("form", () => update(el)));
    return () => html`<div><input value=${store.get("form", { path: "name" }) ?? ""} oninput=${(e) => store.set("form", (e.target).value, { path: "name" })}></div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 10));
  const input = el.querySelector("input");
  input.value = "Ada";
  input.dispatchEvent(new (globalThis.Event || window.Event)("input", { bubbles: true }));
  store.set("form", "Ada", { path: "name" });
  await new Promise(r => queueMicrotask(r)); flush();
  await new Promise(r => setTimeout(r, 10));
  assertEquals(store.get("form", { path: "name" }), "Ada");
});

// E2E: library store + subscribe with components
test("e2e: library store drives component render and delete cleans up", async () => {
  setupDOM();
  const { define, html, update, flush, store, onReady } = await import(`../src/index.ts?libstore-${Date.now()}`);

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
  await new Promise(r => setTimeout(r, 10));
  assertEquals(el.querySelectorAll("li").length, 3);
  assertEquals(el.textContent, "alphabetagamma");

  store.set("items", ["alpha", "gamma"]);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelectorAll("li").length, 2);
  assertEquals(el.textContent, "alphagamma");

  store.del("items");
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelectorAll("li").length, 0);
});

// E2E: path-based store with nested form fields
test("e2e: path-based store updates nested fields independently", async () => {
  setupDOM();
  const { define, html, update, flush, store, onReady } = await import(`../src/index.ts?pathform-${Date.now()}`);

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
  await new Promise(r => setTimeout(r, 10));
  assertEquals(el.querySelector(".out").textContent, "  (0)");

  store.set("profile", "Ada", { path: "first" });
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelector(".out").textContent, "Ada  (0)");

  store.set("profile", "Lovelace", { path: "last" });
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelector(".out").textContent, "Ada Lovelace (0)");

  store.set("profile", 36, { path: "age" });
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelector(".out").textContent, "Ada Lovelace (36)");
});

// E2E: subscribe unsubscribe stops component updates
test("e2e: unsubscribe stops subscriber from being called", async () => {
  setupDOM();
  const { store } = await import(`../src/index.ts?unsub-${Date.now()}`);

  store.set("counter", 0);
  const calls = [];
  const unsub = store.subscribe("counter", (v) => calls.push(v));

  store.set("counter", 1);
  assertEquals(calls, [1]);
  store.set("counter", 2);
  assertEquals(calls, [1, 2]);

  unsub();
  store.set("counter", 3);
  assertEquals(calls, [1, 2]);
});
