<div align="center">

# Micro-UI

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> *A tiny functional JavaScript UI library for AI agents to generate lightweight, interactive micro-apps.*

## Features

* **Tiny & functional** — ~400 lines, no dependencies, no VDOM, no signals, no compiler.
* **Native Custom Elements** — `define(tag, setup)` creates real Web Components, composable as `<x-parent><x-child></x-parent>`.
* **Closure state** — ordinary `let` variables, no stores or reactive primitives.
* **Explicit updates** — `update(el)` batched via `queueMicrotask`, full control over re-render.
* **DOM identity** — inputs, videos, canvases survive updates — no `innerHTML` rebuilds.
* **Keyed reconciliation** — `key=${id}` for stable lists (cart, data), positional fallback.
* **Attribute interpolation** — `src=${url}`, `style="background:${color}"`, `class="btn ${active}"`.
* **AI-agent friendly** — `define`/`html`/`update` + `mount` — easy for agents to generate micro-apps without toolchain.

## Installation

```sh
pnpm add @opentf/micro-ui
# or
npm i @opentf/micro-ui
```

```js
import { define, html, update } from "@opentf/micro-ui";
```

## Quick Start

```html
<script type="module">
import { define, html, update } from "@opentf/micro-ui";

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

## API

### `define(tag, setup)`

Registers a custom element. `setup(el, props)` is called once on connect and must return a render function.

```js
define("x-greeting", (el, props) => {
  let name = props.name || "World";

  return () => html`
    <h2>Hello, ${name}</h2>
    <input value=${name} oninput=${(e) => { name = e.target.value; update(el); }}>
  `;
});
```

Props are derived from the element's HTML attributes (strings) and stay reactive — parent `html`<x-child name=${label}>` updates child via explicit `update` + `patchAttrs` sync.

### `html` strings

Tagged template that produces an internal tree. Supports:

- **Text interpolation**: `<p>${value}</p>`
- **Mixed content**: `<p>Hello ${name}!</p>`
- **Attribute interpolation**: `<img src=${url}>`, `style="background:${color}"`, `class="btn ${active}"` (prefix/suffix + multiple interpolations)
- **Event binding**: `<button onclick=${handler}>` (via `on*`)
- **Keyed lists**: `<li key=${id}>` for stable reorder / remove
- **Conditional**: `${show ? html`<span>Yes</span>` : null}`
- **Lists**: `${items.map(i => html`<li key=${i.id}>${i.name}</li>`)}`
- **Nested html**: `${childTemplate}`

### `update(el)`

Triggers a re-render (batched via `queueMicrotask`). The render function is called again, producing a new tree. The library reconciles old vs new, reusing DOM nodes wherever the structure matches. Controlled `value`/`checked` are synced as properties, not just attributes.

## Design

- **State**: ordinary JavaScript closures. No signals, stores, or reactive primitives.
- **Composition**: native Custom Elements. `<x-parent>` contains `<x-child>` as regular HTML.
- **DOM identity**: elements, inputs, videos, canvases survive updates. No `innerHTML` rebuilds.
- **Reconciliation**: positional by default; keyed when `key` present (`key=${id}`) — stable DOM reuse for cart / data lists. Matches old and new children by index or key. Unchanged nodes are reused. Changed nodes are patched in place.

## Running

Serve the project root with any static server (ES modules require it):

```sh
npx serve .
# or
python3 -m http.server
```

Then open `test.html` or `demo.html`.

## What This Is Not

- Not a React/Vue/Angular replacement for large apps
- Not optimized (v0 uses a full internal tree for correctness)
- Not a build tool or compiler
- No SSR/hydration — client islands only; updates are batched via `queueMicrotask`

## License

MIT
