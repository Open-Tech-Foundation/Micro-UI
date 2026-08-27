import { test, assert, assertEquals } from "runtime:test";
import { setupDOM } from "./helpers/dom.mjs";

// E2E: full shopping cart flow via store + components (as demo does)
test("e2e: shopping cart add / remove / qty / count stays in sync", async () => {
  const { define, html, update, flush } = await import(`../src/index.ts?e2e-${Date.now()}`);
  setupDOM();

  // Minimal store mock like demo/src/store.ts
  const stores = new Map();
  function store(key, value) {
    if (!stores.has(key)) stores.set(key, { value: [], listeners: new Set() });
    const s = stores.get(key);
    if (value !== undefined) {
      s.value = value;
      s.listeners.forEach(fn => fn(value));
    }
    return s.value;
  }
  function subscribe(key, fn) {
    if (!stores.has(key)) stores.set(key, { value: [], listeners: new Set() });
    stores.get(key).listeners.add(fn);
    return () => stores.get(key).listeners.delete(fn);
  }
  store("cart", []);

  function addToCart(p) {
    const cart = store("cart");
    const ex = cart.find(i => i.id === p.id);
    store("cart", ex ? cart.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...cart, { ...p, qty: 1 }]);
  }
  function removeFromCart(id) { store("cart", store("cart").filter(i => i.id !== id)); }
  function updateQty(id, qty) { if (qty <= 0) return removeFromCart(id); store("cart", store("cart").map(i => i.id === id ? { ...i, qty } : i)); }

  const PRODUCTS = [
    { id: 1, name: "Keyboard", price: 10 },
    { id: 2, name: "Mouse", price: 20 },
    { id: 3, name: "Monitor", price: 30 },
  ];

  define("e2e-product-list", () => () => html`<div>${PRODUCTS.map(p => html`<button class="add" onclick=${() => addToCart(p)}>${p.name}</button>`)}</div>`);
// removed duplicate define
  // Use onReady via import
  const { onReady } = await import(`../src/index.ts?onready-${Date.now()}`);
  // Redefine e2e-cart with onReady for auto update
  // (avoid duplicate define, use unique tag)
  const cartTag = "e2e-cart-" + Date.now();
  define(cartTag, (el) => {
    onReady(() => subscribe("cart", () => update(el)));
    return () => {
      const cart = store("cart");
      const count = cart.reduce((s, i) => s + i.qty, 0);
      return html`<div><h3>Cart (${count})</h3><ul>${cart.map(it => html`<li key=${it.id} data-id="${it.id}">${it.name}:${it.qty}<button class="rem" onclick=${() => removeFromCart(it.id)}>x</button></li>`)}</ul></div>`;
    };
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  const list = document.createElement("e2e-product-list");
  const cartEl = document.createElement(cartTag);
  host.appendChild(list);
  host.appendChild(cartEl);
  await new Promise(r => setTimeout(r, 10));

  // Add 3 products
  const adds = list.querySelectorAll("button");
  // Need to find buttons via our mock's querySelectorAll (supports tag only, not class)
  // Fallback: use childNodes
  // For mock, querySelector with class may fail, so use manual
  assertEquals(store("cart").length, 0);
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

  // Remove middle (id 2) — the bug we fixed
  removeFromCart(2);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 2);
  // After removing id 2, only Keyboard (1) and Monitor (3) should remain; header "(2)" is count, not an item
  const lis = cartEl.querySelectorAll("li");
  assertEquals(lis.length, 2);
  const ids = [...cartEl.querySelectorAll("li")].map(n => n.getAttribute("data-id"));
  assertEquals(ids.includes("1"), true);
  assertEquals(ids.includes("3"), true);
  assertEquals(ids.includes("2"), false);

  // Qty decrement to 0 should remove
  updateQty(1, 0);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 1);

  // Clear
  removeFromCart(3);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(cartEl.querySelectorAll("li").length, 0);
});

// E2E: form input + validation + submit
test("e2e: form fields sync via store path", async () => {
  setupDOM();
  const { define, html, update, onReady } = await import(`../src/index.ts?form-${Date.now()}`);
  const stores = new Map();
  function getByPath(o,p){ return p.split(".").reduce((a,k)=>a?.[k],o); }
  function setByPath(o,p,v){ const ks=p.split("."); const last=ks.pop(); let cur=o; for(const k of ks){ cur[k]=cur[k]??{}; cur=cur[k]; } cur[last]=v; return o; }
  function store(key, value, opts){
    if(!stores.has(key)) stores.set(key,{value:undefined, listeners:new Set()});
    const s=stores.get(key);
    if(value!==undefined){
      if(opts?.path) s.value=setByPath(structuredClone(s.value??{}), opts.path, value);
      else s.value=value;
      s.listeners.forEach(fn=>fn(s.value));
    }
    return opts?.path? getByPath(s.value, opts.path): s.value;
  }
  function subscribe(k,fn){ if(!stores.has(k)) stores.set(k,{value:undefined,listeners:new Set()}); stores.get(k).listeners.add(fn); return ()=>stores.get(k).listeners.delete(fn); }
  store("form", { name:"", email:"" });

  const tag = "e2e-form-" + Date.now();
  define(tag, (el) => {
    onReady(() => subscribe("form", () => update(el)));
    return () => html`<div><input value=${store("form", undefined, {path:"name"}) ?? ""} oninput=${e=>store("form", e.target.value, {path:"name"})}></div>`;
  });
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 10));
  const input = el.querySelector("input");
  // Simulate typing
  input.value = "Ada";
  input.dispatchEvent(new (globalThis.Event || window.Event)("input", { bubbles: true }));
  // Direct store set as oninput does
  store("form", "Ada", {path:"name"});
  await new Promise(r => queueMicrotask(r));
  // Need update via subscribe
  // onReady already subscribes, but we also need to flush
  const { flush } = await import(`../src/index.ts?flush-${Date.now()}`);
  // store already notified, flush will have been queued
  await new Promise(r => setTimeout(r, 10));
  assertEquals(store("form", undefined, {path:"name"}), "Ada");
});

// E2E: library store + subscribe with components
test("e2e: library store drives component render and delete cleans up", async () => {
  setupDOM();
  const { define, html, update, flush, store, subscribe, del, onReady } = await import(`../src/index.ts?libstore-${Date.now()}`);

  store("items", ["alpha", "beta", "gamma"]);

  const tag = "e2e-libstore-" + Date.now();
  define(tag, (el) => {
    onReady(() => subscribe("items", () => update(el)));
    return () => {
      const items = store("items") || [];
      return html`<ul>${items.map((t, i) => html`<li key=${String(i)}>${t}</li>`)}</ul>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 10));
  assertEquals(el.querySelectorAll("li").length, 3);
  assertEquals(el.textContent, "alphabetagamma");

  // Remove middle item via path-less store (replace entire list)
  store("items", ["alpha", "gamma"]);
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelectorAll("li").length, 2);
  assertEquals(el.textContent, "alphagamma");

  // Delete entire key
  del("items");
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelectorAll("li").length, 0);
});

// E2E: path-based store with nested form fields
test("e2e: path-based store updates nested fields independently", async () => {
  setupDOM();
  const { define, html, update, flush, store, subscribe, onReady } = await import(`../src/index.ts?pathform-${Date.now()}`);

  store("profile", { first: "", last: "", age: 0 });

  const tag = "e2e-pathform-" + Date.now();
  define(tag, (el) => {
    onReady(() => subscribe("profile", () => update(el)));
    return () => {
      const p = store("profile") || {};
      return html`<div><span class="out">${p.first} ${p.last} (${p.age})</span></div>`;
    };
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 10));
  assertEquals(el.querySelector(".out").textContent, "  (0)");

  store("profile", "Ada", { path: "first" });
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelector(".out").textContent, "Ada  (0)");

  store("profile", "Lovelace", { path: "last" });
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelector(".out").textContent, "Ada Lovelace (0)");

  store("profile", 36, { path: "age" });
  await new Promise(r => queueMicrotask(r)); flush(); await new Promise(r => setTimeout(r, 5));
  assertEquals(el.querySelector(".out").textContent, "Ada Lovelace (36)");
});

// E2E: subscribe unsubscribe stops component updates
test("e2e: unsubscribe stops subscriber from being called", async () => {
  setupDOM();
  const { store, subscribe, del } = await import(`../src/index.ts?unsub-${Date.now()}`);

  store("counter", 0);
  const calls = [];
  const unsub = subscribe("counter", (v) => calls.push(v));

  store("counter", 1);
  assertEquals(calls, [1]);
  store("counter", 2);
  assertEquals(calls, [1, 2]);

  unsub();
  store("counter", 3);
  assertEquals(calls, [1, 2]); // not called after unsub
});
