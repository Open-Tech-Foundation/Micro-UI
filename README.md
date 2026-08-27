# Micro-UI

A tiny functional Web Components library. ~200 lines.

Native Custom Elements + closure state + explicit updates + DOM reconciliation. No VDOM, no signals, no compiler.

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

Props are derived from the element's HTML attributes (strings).

### `html` strings

Tagged template that produces an internal tree. Supports:

- **Text interpolation**: `<p>${value}</p>`
- **Mixed content**: `<p>Hello ${name}!</p>`
- **Attribute interpolation**: `<img src=${url}>`
- **Event binding**: `<button onclick=${handler}>`
- **Conditional**: `${show ? html`<span>Yes</span>` : null}`
- **Lists**: `${items.map(i => html`<li>${i}</li>`)}`
- **Nested html**: `${childTemplate}`

### `update(el)`

Triggers a re-render of the component. The render function is called again, producing a new tree. The library reconciles old vs new, reusing DOM nodes wherever the structure matches.

## Design

- **State**: ordinary JavaScript closures. No signals, stores, or reactive primitives.
- **Composition**: native Custom Elements. `<x-parent>` contains `<x-child>` as regular HTML.
- **DOM identity**: elements, inputs, videos, canvases survive updates. No `innerHTML` rebuilds.
- **Reconciliation**: positional. Matches old and new children by index. Unchanged nodes are reused. Changed nodes are patched in place.

## File Structure

```
packages/micro-ui/src/index.js  # The entire library (~400 lines)
src/micro-ui.js                 # Standalone copy
test.html                       # 15 automated tests
demo/                           # Shopping cart / Form / Data demo
```

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
