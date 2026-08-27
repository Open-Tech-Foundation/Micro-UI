import { define, html, update, onReady } from "@opentf/micro-ui";

/**
 * Counter — basic text update + event handling.
 */
define("x-counter", (el, props) => {
  let count = Number(props.count || 0);
  onReady(() => console.log("x-counter ready", el));

  return () => html`
    <div class="card">
      <h3>Counter</h3>
      <p class="count">${count}</p>
      <div class="btn-row">
        <button onclick=${() => { count--; update(el); }}>-1</button>
        <button onclick=${() => { count = 0; update(el); }}>Reset</button>
        <button onclick=${() => { count++; update(el); }}>+1</button>
      </div>
    </div>
  `;
});

/**
 * Timer — attribute update, shows live DOM identity preservation.
 */
define("x-timer", (el, props) => {
  let seconds = Number(props.seconds || 0);
  onReady(() => {
    console.log("x-timer ready", el);
    const interval = setInterval(() => { seconds++; update(el); }, 1000);
    return () => {
      console.log("x-timer destroyed", el);
      clearInterval(interval);
    };
  });

  return () => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return html`
      <div class="card">
        <h3>Timer</h3>
        <p class="timer">${m}:${s}</p>
        <p class="hint">same &lt;p&gt; node — value updates in place</p>
      </div>
    `;
  };
});

/**
 * Color picker — attribute binding + conditional rendering.
 */
define("x-color", (_el, _props) => {
  let color = "#3b82f6";
  let showPreview = true;
  onReady(() => console.log("x-color ready", _el));

  return () => html`
    <div class="card">
      <h3>Color Picker</h3>
      <div class="btn-row">
        <button onclick=${() => { color = "#ef4444"; update(_el); }}>Red</button>
        <button onclick=${() => { color = "#22c55e"; update(_el); }}>Green</button>
        <button onclick=${() => { color = "#3b82f6"; update(_el); }}>Blue</button>
      </div>
      <div class="btn-row" style="margin-top:.5rem">
        <button onclick=${() => { showPreview = !showPreview; update(_el); }}>
          ${showPreview ? "Hide" : "Show"} preview
        </button>
      </div>
      ${showPreview
        ? html`<div class="swatch" style="background:${color}"></div>`
        : null}
      <p class="hint">conditional DOM — swatch node added/removed</p>
    </div>
  `;
});

/**
 * Todo list — array rendering with positional reconciliation.
 */
define("x-todos", (el, _props) => {
  let items = [
    { text: "Learn Micro-UI", done: true },
    { text: "Build something", done: false },
  ];
  let input = "";
  onReady(() => console.log("x-todos ready", el));

  const add = () => {
    if (!input.trim()) return;
    items = [...items, { text: input.trim(), done: false }];
    input = "";
    update(el);
  };

  const toggle = (i: number) => {
    items = items.map((it, idx) => idx === i ? { ...it, done: !it.done } : it);
    update(el);
  };

  const remove = (i: number) => {
    items = items.filter((_, idx) => idx !== i);
    update(el);
  };

  return () => html`
    <div class="card">
      <h3>Todos</h3>
      <div class="todo-input">
        <input
          value=${input}
          placeholder="Add a task…"
          oninput=${(e: InputEvent) => { input = (e.target as HTMLInputElement).value; }}
          onkeydown=${(e: KeyboardEvent) => { if (e.key === "Enter") add(); }}
        />
        <button onclick=${add}>Add</button>
      </div>
      <ul class="todo-list">
        ${items.map((item, i) => html`
          <li class="${item.done ? "done" : ""}">
            <span onclick=${() => toggle(i)}>${item.text}</span>
            <button class="rm" onclick=${() => remove(i)}>×</button>
          </li>
        `)}
      </ul>
      <p class="hint">${items.length} item${items.length !== 1 ? "s" : ""} — positional reconciliation</p>
    </div>
  `;
});

/**
 * Nested — child components keep their own closure state.
 */
define("x-nested-parent", (el, _props) => {
  let label = "Parent";
  onReady(() => console.log("x-nested-parent ready", el));

  return () => html`
    <div class="card">
      <h3>Nested Components</h3>
      <input value=${label} oninput=${(e: InputEvent) => {
        label = (e.target as HTMLInputElement).value;
        update(el);
      }} />
      <x-nested-child name=${label}></x-nested-child>
      <p class="hint">child owns its own counter — parent re-render does not reset it</p>
    </div>
  `;
});

define("x-nested-child", (el, props) => {
  let count = 0;
  onReady(() => console.log("x-nested-child ready", el, "name:", props.name));

  return () => html`
    <div class="child">
      <span>${props.name}'s count: <strong>${count}</strong></span>
      <button onclick=${() => { count++; update(el); }}>+1</button>
    </div>
  `;
});

/**
 * App — root component with navigation.
 */
define("x-app", (el) => {
  let page = "demos";
  onReady(() => console.log("x-app ready", el));

  return () => html`
    <header>
      <h1>Micro-UI</h1>
      <p class="tagline">~400 lines. Native Custom Elements + closure state + explicit updates.</p>
      <nav class="nav">
        <button class="${page === "demos" ? "active" : ""}" onclick=${() => { page = "demos"; update(el); }}>Demos</button>
        <button class="${page === "shop" ? "active" : ""}" onclick=${() => { page = "shop"; update(el); }}>Shopping Cart</button>
        <button class="${page === "form" ? "active" : ""}" onclick=${() => { page = "form"; update(el); }}>Form</button>
        <button class="${page === "data" ? "active" : ""}" onclick=${() => { page = "data"; update(el); }}>Data</button>
        <button class="${page === "gravity" ? "active" : ""}" onclick=${() => { page = "gravity"; update(el); }}>Gravity</button>
      </nav>
    </header>

    ${page === "demos"
      ? html`
        <section class="grid">
          <x-counter count="0"></x-counter>
          <x-timer seconds="0"></x-timer>
          <x-color></x-color>
        </section>
        <section class="grid">
          <x-todos></x-todos>
          <x-nested-parent></x-nested-parent>
        </section>
      `
      : page === "shop"
        ? html`<x-shop></x-shop>`
        : page === "form"
          ? html`<x-form-page></x-form-page>`
          : page === "data"
            ? html`<x-data-page></x-data-page>`
            : html`<x-gravity-page></x-gravity-page>`}

    <footer>
      <p>No VDOM. No signals. No compiler. Just <code>define</code>, <code>html</code>, <code>update</code>, <code>mount</code>.</p>
    </footer>
  `;
});
