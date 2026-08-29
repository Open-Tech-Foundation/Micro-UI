<div align="center">

# Micro-UI

*An [Open Tech Foundation](https://opentechf.org/) project*

A tiny runtime for AI-generated micro-apps


</div>

> *A tiny functional JavaScript UI library for AI agents to generate lightweight, interactive micro-apps.*

## Features

* **Lightweight** — zero dependencies, no build step, ~5 KB gzipped.
* **Simple state management** — use plain variables or the built-in `store` for shared state.
* **Smooth updates** — changes are batched and applied efficiently, no flicker or jank.
* **Form-friendly** — inputs, video, canvas, focus, and scroll position all survive re-renders.
* **Stable lists** — reorder, add, or remove items without losing element state.
* **Dynamic attributes** — bind classes, styles, and props with simple template expressions.
* **Secure by default** — interpolated content is inserted as text, never parsed as HTML.
* **Fault tolerant** — one broken component won't crash the rest of your app.
* **AI-ready** — minimal API surface that agents can generate without a toolchain.

## How it works

Micro-UI parses each `html` template **once** and caches the resulting static
description on the template literal itself, so re-renders only re-evaluate the
`${...}` bindings rather than rebuilding a description of the whole tree.

Rendering produces a small virtual tree, which is diffed against the previous
one and applied to the DOM. It is a virtual DOM, deliberately a minimal one:
no compiler, no signals, no fiber or scheduler, and one reconciliation root
per custom element rather than a single app-wide tree.

## Installation

```sh
pnpm add @opentf/micro-ui
# or
npm i @opentf/micro-ui
# or
yarn add @opentf/micro-ui
# or
bun add @opentf/micro-ui
```

## Import

### CDN

#### jsDelivr

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@opentf/micro-ui/dist/styles.min.css">

<script type="module">
  import { define, html, update } from
    "https://cdn.jsdelivr.net/npm/@opentf/micro-ui/dist/index.min.js";
</script>
```

#### unpkg

```html
<link rel="stylesheet"
      href="https://unpkg.com/@opentf/micro-ui/dist/styles.min.css">

<script type="module">
  import { define, html, update } from
    "https://unpkg.com/@opentf/micro-ui/dist/index.min.js";
</script>
```

#### esm.sh

```js
import { define, html, update } from
  "https://esm.sh/@opentf/micro-ui?min";
```

### npm

```js
import { define, html, update } from "@opentf/micro-ui";
```

## Quick Start

```html
<script type="module">
import { define, html, update } from "https://esm.sh/@opentf/micro-ui?min";

define("x-counter", (el, props) => {
  let count = Number(props.count || 0);

  return () => html`
    <button onclick=${() => { count++; update(el); }}>
      Count: ${count}
    </button>
  `;
});
</script>

<x-counter count="0"></x-counter>
```

## Usage

### Lifecycle

```js
define("x-demo", (el, props) => {
  let data = [];

  // Post-render setup & cleanup
  onReady(() => {
    const interval = setInterval(() => update(el), 1000);
    return () => clearInterval(interval); // cleanup on disconnect
  });

  // Error handling
  onError((target, err, phase) => {
    console.error(`Failed in ${phase}:`, err);
  });

  return () => html`<p>${data.length} items</p>`;
});
```

### State & updates

```js
define("x-counter", (el) => {
  let count = 0;

  return () => html`
    <button onclick=${() => { count++; update(el); }}>
      ${count}
    </button>
  `;
});
```

### Composition

```js
define("x-child", (el, props) => {
  return () => html`<span>${props.name}</span>`;
});

define("x-parent", (el) => {
  let name = "World";
  return () => html`<x-child name=${name}></x-child>`;
});
```

## API

### `define(tag, setup)`

Registers a custom element. `setup(el, props)` runs once on connect and must return a render function.

```js
define("x-greeting", (el, props) => {
  let name = props.name || "World";
  return () => html`<h2>Hello, ${name}</h2>`;
});
```

#### Attributes and `props`

`props` holds the element's attributes as strings. It is the same object for the
lifetime of the component, and it is refreshed from the DOM on every render — so
read it inside the render function to always see current values:

```js
define("x-greeting", (el, props) => {
  const initial = props.name;                        // captured once, never updates
  return () => html`<h2>Hello, ${props.name}</h2>`;  // read per render, always current
});
```

Micro-UI has no automatic reactivity. Changing an attribute does not re-render,
exactly like changing a variable or a store value does not. Call `update(el)`:

```js
el.setAttribute("name", "Ada");
update(el);                       // now it re-renders, with name = "Ada"
```

There is no `observedAttributes` or `attributeChangedCallback` — an attribute
changed from outside is picked up by the next `update()`, not observed as it
happens. Attributes bound from a parent template are the exception: the parent's
own re-render already patches and updates the child for you.

```js
define("x-parent", () => () => html`<x-child label=${label}></x-child>`);
// updating the parent updates x-child too — no explicit update(child) needed
```

### `html`

Tagged template that produces a renderable tree. Supports text, attributes, events, keyed lists, conditionals, and nesting. Text interpolations are inserted as text nodes, never parsed as markup.

```js
html`<button onclick=${handler} class="btn ${active}">Click</button>`
```

### `html.raw`

Trusted HTML opt-in — bypasses escaping. Never pass user input.

```js
html.raw`<div>${trustedMarkup}</div>`
```

### `update(el)`

Triggers a re-render. Multiple calls are batched into a single update. No-op on errored components.

### `flush()`

Immediately processes pending updates synchronously.

```js
update(el);
flush(); // DOM is now up to date
```

### `mount(el, tag, options?)`

Clears `el`, creates `<tag>` inside it, and returns the new element.

```js
const app = mount(document.getElementById("app"), "x-app");
```

`options.dev` turns on developer diagnostics for the whole app:

```js
mount(document.getElementById("app"), "x-app", { dev: true });
```

With `dev` off — the default — a component that throws renders a neutral
message rather than the error text:

```html
<div data-micro-ui-error><pre>Something went wrong.</pre></div>
```

A thrown error can carry a URL, a token or an internal path, and the error box
renders wherever the failing component sits — which may be somewhere a user is
looking. So the message is withheld from the page unless you ask for it.

Nothing is lost either way: the full error always goes to `console.error`, and
`onError` handlers always receive the real `Error` object. Turn `dev` on while
developing to see the message in the page as well.

### `store.get(key)` / `store.set(key, value)`

Simple key-value store. Get with `store.get`, set with `store.set`. Does not trigger DOM updates — connect to components via `store.subscribe`.

```js
store.set("counter", 0);
store.get("counter"); // 0
store.set("counter", 1);
```

### `store.set(key, value, { path })`

Set a nested value by dot-separated path. Immutably clones the object tree along the path — the value you passed in is never mutated.

```js
store.set("form", { name: "", email: "" });
store.set("form", "Ada", { path: "name" });
store.get("form", { path: "name" }); // "Ada"
```

Arrays are cloned as arrays, so numeric segments address list items and the
container stays a list:

```js
store.set("todos", { items: ["a", "b", "c"] });
store.set("todos", "z", { path: "items.0" });
store.get("todos").items;          // ["z", "b", "c"] — still an array
```

### `store.subscribe(key, fn)`

Listen for changes to a store key. Returns an unsubscribe function. Call inside `onReady` to connect store changes to component re-renders.

```js
define("x-counter", (el) => {
  onReady(() => store.subscribe("counter", () => update(el)));
  return () => html`<span>${store.get("counter")}</span>`;
});
```

### `store.del(key)` / `store.del(key, { path })`

Delete a store key (resets to `undefined`) or remove a nested key from an object value. Notifies subscribers.

```js
store.del("counter");                   // full key deleted
store.del("form", { path: "name" });   // only removes "name", rest intact
store.del("todos", { path: "items.1" }); // splices index 1 out of the array
```

### `store.clear()`

Reset every key to `undefined` and notify all subscribers. Existing
subscriptions stay live — a component subscribed before `clear()` still
receives later `set()` calls for its key.

## Security

### Text is never parsed as HTML

Every `${value}` text interpolation is inserted as a DOM text node. No HTML
parser runs on that path, so injected markup cannot become elements and
scripts cannot execute:

```js
const userInput = '<script>alert("xss")</script>';
html`<p>${userInput}</p>` // renders as literal text, not markup
```

Values are displayed exactly as written — they are **not** entity-encoded, so
`&`, `<`, `>`, `"` and `'` render as themselves:

```js
html`<p>${"Tom & Jerry"}</p>`   // shows: Tom & Jerry
html`<p>${"5 < 10"}</p>`        // shows: 5 < 10
```

### Trusted HTML opt-in (`html.raw`)

When you need to render trusted markup, use `html.raw`:

```js
html.raw`<b>${boldText}</b>` // parsed as real HTML
```

`html.raw` still stringifies interpolated values, but the entire result is treated as markup and parsed via `innerHTML`. **Never pass user-controlled input to `html.raw`.**

### Error isolation

Every component is its own boundary. A throwing `setup`, `render`, or
`reconcile` is caught where it happens: that component is replaced with an
error box and its own `onError` handlers run, while everything around it keeps
working.

Errors do **not** travel up. A parent cannot catch or render a fallback for a
failing child — the child shows its own error box in place, and the parent's
`onError` is not called. There is no ancestor error boundary.

Errors thrown from event handlers are outside this: they are ordinary DOM
event callbacks and reach `window.onerror`, not `onError`.

A throwing `onReady` callback is isolated too: the remaining callbacks still
run, the rendered UI is left alone (the component itself rendered fine), and
the failure is reported to `onError` with phase `"ready"`.

- The failed element is replaced with a small inline error box (`<div data-micro-ui-error>`).
- The instance is marked `errored` — further `update()` calls are no-ops.
- The host page and all sibling components continue running normally.
- Recovery requires removing the element from the DOM and creating a fresh one.

```js
define("x-safe", (el) => {
  onError((target, err, phase) => {
    console.error(`Error in ${phase}:`, err);
  });

  return () => {
    if (Math.random() > 0.5) throw new Error("boom");
    return html`<p>Works</p>`;
  };
});
```

# Micro-UI Utils

A tiny, semantic, framework-free CSS utility and component layer for building **Micro-UI apps**.

**No Tailwind. No Bootstrap. No build step required.**

```js
import "@opentf/micro-ui/styles.css"; // full bundle (tokens + base + components)
```

Split imports — pay only for what you use:

```js
import "@opentf/micro-ui/styles/tokens.css";     // vars only
import "@opentf/micro-ui/styles/base.css";        // reset + layout
import "@opentf/micro-ui/styles/components.css"; // buttons, forms, cards...
```

Or via CDN:

```html
<link rel="stylesheet" href="https://unpkg.com/@opentf/micro-ui/dist/styles.min.css">
```

## Class Reference

| Category | Classes |
|----------|---------|
| **Layout** | `ui-container`, `ui-stack`, `ui-row`, `ui-grid`, `ui-grid-2/3/4`, `ui-wrap`, `ui-center`, `ui-between`, `ui-grow` |
| **Spacing** | `ui-gap-{1,2,3,4,5,6,8,10,12}`, `ui-p-{0,2,3,4,5,6,8}`, `ui-px-{4,6}`, `ui-py-{2,4,6}`, `ui-mt-{2,4,6,8}`, `ui-mb-{2,4,6,8}` |
| **Typography** | `ui-title`, `ui-heading`, `ui-text`, `ui-muted`, `ui-label`, `ui-caption`, `ui-error-text`, `ui-link` |
| **Buttons** | `ui-btn`, `ui-btn-primary`, `ui-btn-secondary`, `ui-btn-ghost`, `ui-btn-danger`, `ui-btn-success`, `ui-btn-sm`, `ui-btn-lg`, `ui-btn-icon` |
| **Forms** | `ui-field`, `ui-input`, `ui-textarea`, `ui-select`, `ui-checkbox`, `ui-radio`, `ui-switch` |
| **Surfaces** | `ui-card`, `ui-card-flat`, `ui-card-hover`, `ui-panel`, `ui-section` |
| **Badges** | `ui-badge`, `ui-badge-primary/success/warning/danger/info` |
| **Alerts** | `ui-alert`, `ui-alert-info/success/warning/danger` |
| **Progress** | `ui-progress`, `ui-progress-bar`, `ui-progress-success/danger` |
| **Loading** | `ui-spinner`, `ui-spinner-sm/lg` |
| **Avatar** | `ui-avatar`, `ui-avatar-sm/lg` |
| **Lists** | `ui-list`, `ui-list-item`, `ui-list-item-hover` |
| **Tables** | `ui-table-wrap`, `ui-table`, `ui-table-hover` |
| **Navigation** | `ui-tabs`, `ui-tab`, `ui-breadcrumbs`, `ui-pagination` |
| **Menus** | `ui-menu`, `ui-menu-item`, `ui-menu-divider` |
| **Dialogs** | `ui-modal`, `ui-dialog`, `ui-dialog-header/body/footer` |
| **Drawer** | `ui-drawer`, `ui-drawer-left/right`, `ui-drawer-header/body` |
| **Tooltip** | `ui-tooltip`, `ui-tooltip-content` |
| **Empty State** | `ui-empty`, `ui-empty-icon` |
| **Skeleton** | `ui-skeleton` |
| **Status** | `ui-status`, `ui-status-success/warning/danger/info` |
| **Drag & Drop** | `ui-draggable`, `ui-dropzone`, `ui-dragging` |
| **Utilities** | `ui-hidden`, `ui-visible`, `ui-w-full`, `ui-rounded-*`, `ui-shadow-*`, `ui-relative/absolute/fixed/sticky` |
| **States** | `is-active`, `is-disabled`, `is-loading`, `is-invalid`, `is-dragover`, `is-dragging` |

## Theming

Override CSS custom properties for theming:

```css
:root {
  --ui-primary: #2563eb;
  --ui-primary-hover: #1d4ed8;
}
```

Dark mode — automatic via `@media (prefers-color-scheme: dark)` in tokens. Override it on any element with `data-theme="dark"` or `data-theme="light"`; an explicit attribute always wins over the system preference (and you can theme individual containers).

Layers — all rules are in `@layer micro-ui.*` so your app CSS wins without `!important`:
```css
@layer micro-ui, app; /* app layer after micro-ui */
```

Opt-in CSS — `package.json` has `"sideEffects": ["*.css"]` so JS tree-shakes, import CSS only where needed.

> **[Full CSS Documentation](./docs/css-utils.md)**

---

## Design

- **State**: ordinary JavaScript closures. Optional built-in `store`/`subscribe`/`del` for shared state — still no signals or reactive primitives.
- **Composition**: native Custom Elements. `<x-parent>` contains `<x-child>` as regular HTML.
- **DOM identity**: elements, inputs, videos, canvases survive updates. No `innerHTML` rebuilds.
- **Reconciliation**: positional by default; keyed when `key` present (`key=${id}`) — stable DOM reuse for cart / data lists. Matches old and new children by index or key. Unchanged nodes are reused. Changed nodes are patched in place.

## What This Is Not

- Not a React/Vue/Angular replacement for large apps
- Not optimized (v0 uses a full internal tree for correctness)
- Not a build tool or compiler
- No SSR/hydration — client islands only; updates are batched via `queueMicrotask`

## License

MIT
