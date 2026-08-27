import { define, html, update, onReady } from "@opentf/micro-ui";
import { store, subscribe } from "./store";

const PRODUCTS = [
  { id: 1, name: "Mechanical Keyboard", price: 149.99, emoji: "⌨️" },
  { id: 2, name: "Wireless Mouse", price: 79.99, emoji: "🖱️" },
  { id: 3, name: "4K Monitor", price: 449.99, emoji: "🖥️" },
  { id: 4, name: "USB-C Hub", price: 59.99, emoji: "🔌" },
  { id: 5, name: "Noise Cancelling Headphones", price: 299.99, emoji: "🎧" },
  { id: 6, name: "Webcam HD", price: 89.99, emoji: "📷" },
];

// ── cart actions ───────────────────────────────────────────────────

function addToCart(product: typeof PRODUCTS[number]) {
  const cart = store("cart") as any[];
  const existing = cart.find((i: any) => i.id === product.id);
  store("cart", existing
    ? cart.map((i: any) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
    : [...cart, { ...product, qty: 1 }]
  );
}

function removeFromCart(id: number) {
  store("cart", (store("cart") as any[]).filter((i: any) => i.id !== id));
}

function updateQty(id: number, qty: number) {
  if (qty <= 0) return removeFromCart(id);
  store("cart", (store("cart") as any[]).map((i: any) => i.id === id ? { ...i, qty } : i));
}

function cartTotal() {
  return (store("cart") as any[]).reduce((sum: number, i: any) => sum + i.price * i.qty, 0);
}

function cartCount() {
  return (store("cart") as any[]).reduce((sum: number, i: any) => sum + i.qty, 0);
}

// ── init store ─────────────────────────────────────────────────────

store("cart", []);

// ── product list ───────────────────────────────────────────────────

define("x-product-list", (el) => {
  return () => html`
    <div class="card">
      <h3>Products</h3>
      <div class="product-grid">
        ${PRODUCTS.map((p) => html`<div key=${p.id} class="product-card">
            <span class="product-emoji">${p.emoji}</span>
            <div class="product-info">
              <div class="product-name">${p.name}</div>
              <div class="product-price">$${p.price.toFixed(2)}</div>
            </div>
            <button class="btn-add" onclick=${() => addToCart(p)}>Add to Cart</button>
          </div>
        `)}
      </div>
    </div>
  `;
});

// ── cart display ───────────────────────────────────────────────────

define("x-cart", (el) => {
  onReady(() => {
    const unsub = subscribe("cart", () => update(el));
    return unsub;
  });

  return () => {
    const cart = store("cart") as any[];
    return html`
      <div class="card">
        <h3>Cart ${cartCount() > 0 ? `(${cartCount()})` : ""}</h3>
        ${cart.length === 0
          ? html`<p class="empty-cart">Your cart is empty</p>`
          : html`
            <ul class="cart-list">
              ${cart.map((item: any) => html`<li key=${item.id} class="cart-item">
                  <span class="cart-item-emoji">${item.emoji}</span>
                  <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                  <div class="cart-item-qty">
                    <button onclick=${() => updateQty(item.id, item.qty - 1)}>-</button>
                    <span>${item.qty}</span>
                    <button onclick=${() => updateQty(item.id, item.qty + 1)}>+</button>
                  </div>
                  <button class="cart-item-remove" onclick=${() => removeFromCart(item.id)}>×</button>
                </li>
              `)}
            </ul>
            <div class="cart-footer">
              <div class="cart-total">
                <span>Total</span>
                <span>$${cartTotal().toFixed(2)}</span>
              </div>
              <button class="btn-checkout" onclick=${() => alert("Checkout — $" + cartTotal().toFixed(2))}>Checkout</button>
            </div>
          `}
      </div>
    `;
  };
});

// ── shop page ──────────────────────────────────────────────────────

define("x-shop", (el) => {
  return () => html`
    <div class="shop-layout">
      <x-product-list></x-product-list>
      <x-cart></x-cart>
    </div>
  `;
});
