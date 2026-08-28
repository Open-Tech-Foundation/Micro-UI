import { define, html, onReady, store, update } from "@opentf/micro-ui";

const PRODUCTS = [
  { id: 1, name: "Mechanical Keyboard", price: 149.99, emoji: "\u2328\uFE0F" },
  { id: 2, name: "Wireless Mouse", price: 79.99, emoji: "\uD83D\uDDB1\uFE0F" },
  { id: 3, name: "4K Monitor", price: 449.99, emoji: "\uD83D\uDDA5\uFE0F" },
  { id: 4, name: "USB-C Hub", price: 59.99, emoji: "\uD83D\uDD0C" },
  {
    id: 5,
    name: "Noise Cancelling Headphones",
    price: 299.99,
    emoji: "\uD83C\uDFA7",
  },
  { id: 6, name: "Webcam HD", price: 89.99, emoji: "\uD83D\uDCF7" },
];

// ── cart actions ───────────────────────────────────────────────────

function addToCart(product: (typeof PRODUCTS)[number]) {
  const cart = store.get("cart") as any[];
  const existing = cart.find((i: any) => i.id === product.id);
  store.set(
    "cart",
    existing
      ? cart.map((i: any) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i,
        )
      : [...cart, { ...product, qty: 1 }],
  );
}

function removeFromCart(id: number) {
  store.set(
    "cart",
    (store.get("cart") as any[]).filter((i: any) => i.id !== id),
  );
}

function updateQty(id: number, qty: number) {
  if (qty <= 0) return removeFromCart(id);
  store.set(
    "cart",
    (store.get("cart") as any[]).map((i: any) =>
      i.id === id ? { ...i, qty } : i,
    ),
  );
}

function cartTotal() {
  return (store.get("cart") as any[]).reduce(
    (sum: number, i: any) => sum + i.price * i.qty,
    0,
  );
}

function cartCount() {
  return (store.get("cart") as any[]).reduce(
    (sum: number, i: any) => sum + i.qty,
    0,
  );
}

// ── init store ─────────────────────────────────────────────────────

store.set("cart", []);

// ── product list ───────────────────────────────────────────────────

define("x-product-list", (_el) => {
  return () => html`
    <div class="card">
      <h3>Products</h3>
      <div class="product-grid">
        ${PRODUCTS.map(
          (p) => html`<div key=${p.id} class="product-card">
            <span class="product-emoji">${p.emoji}</span>
            <div class="product-info">
              <div class="product-name">${p.name}</div>
              <div class="product-price">$${p.price.toFixed(2)}</div>
            </div>
            <button class="ui-btn ui-btn-primary" onclick=${() => addToCart(p)}>Add to Cart</button>
          </div>
        `,
        )}
      </div>
    </div>
  `;
});

// ── cart display ───────────────────────────────────────────────────

define("x-cart", (el) => {
  onReady(() => {
    const unsub = store.subscribe("cart", () => update(el));
    return unsub;
  });

  return () => {
    const cart = store.get("cart") as any[];
    return html`
      <div class="card">
        <h3>Cart ${cartCount() > 0 ? `(${cartCount()})` : ""}</h3>
        ${
          cart.length === 0
            ? html`<p class="empty-cart">Your cart is empty</p>`
            : html`
            <ul class="cart-list">
              ${cart.map(
                (item: any) => html`<li key=${item.id} class="cart-item">
                  <span class="cart-item-emoji">${item.emoji}</span>
                  <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                  <div class="cart-item-qty">
                    <button class="ui-btn ui-btn-secondary ui-btn-icon" onclick=${() => updateQty(item.id, item.qty - 1)}>-</button>
                    <span>${item.qty}</span>
                    <button class="ui-btn ui-btn-secondary ui-btn-icon" onclick=${() => updateQty(item.id, item.qty + 1)}>+</button>
                  </div>
                  <button class="ui-btn ui-btn-danger ui-btn-icon" onclick=${() => removeFromCart(item.id)}>\u00d7</button>
                </li>
              `,
              )}
            </ul>
            <div class="cart-footer">
              <div class="cart-total">
                <span>Total</span>
                <span>$${cartTotal().toFixed(2)}</span>
              </div>
              <button class="ui-btn ui-btn-success" onclick=${() => alert(`Checkout — $${cartTotal().toFixed(2)}`)}>Checkout</button>
            </div>
          `
        }
      </div>
    `;
  };
});

// ── shop page ──────────────────────────────────────────────────────

define("x-shop", (_el) => {
  return () => html`
    <div class="shop-layout">
      <x-product-list></x-product-list>
      <x-cart></x-cart>
    </div>
  `;
});
