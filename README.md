<div align="center">

# Micro-UI

*An [Open Tech Foundation](https://opentechf.org/) project*

A tiny runtime for AI-generated micro-apps

![Micro-UI Screenshot](Screenshot.png)

</div>

> *A tiny functional JavaScript UI library for AI agents to generate lightweight, interactive micro-apps.*

## Features

* **Lightweight** — zero dependencies, no build step, ~6.3 KB gzipped.
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

#### Passing objects, arrays and callbacks

`props` mirrors attributes, and attributes are strings. A binding whose value is
not a string is set as a **DOM property** on the child instead, which is how the
platform itself separates the two:

```js
define("x-row", (el) => {
  // el.item is the object the parent passed; el.onsave is the callback
  return () => html`<li>${el.item.label}</li>`;
});

define("x-list", () => () =>
  html`<ul>${rows.map((r) =>
    html`<x-row item=${r} save=${() => remove(r.id)}></x-row>`)}</ul>`);
```

The value is set before the child's `setup` runs, so it is available
immediately. Such bindings never appear in `props`.

An **object or array** binding is compared by identity: hand the child a new
object and it re-renders, hand it the same one and it does not. So replace the
object when its contents change, rather than mutating it in place.

A **callback** is read when it is called, not when the child renders, so a new
closure each render — the normal case — updates the property without
re-rendering the child. Calling it always runs the latest one.

> Attribute names starting with `on` are event bindings, not props. Name a
> callback prop something else (`save`, not `onsave`) if you want the child to
> call it rather than the DOM to fire it.

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

Two restrictions are worth knowing up front, because both fail in ways that do
not look like your mistake:

**An `on*` attribute must be an interpolated function, never a string of code.**
`onclick="doThing()"` throws with a message telling you so — including inside
`html.raw`, where an inline handler in markup is exactly the injection this
library is built to refuse.

```js
html`<button onclick=${() => doThing()}>ok</button>`   // a handler
html`<button onclick="doThing()">no</button>`          // throws
```

**A tag name cannot be interpolated.** Each template is parsed once and cached
on the literal, so a `${...}` where a tag name belongs is text, not a tag — it
renders as escaped characters rather than raising. Write the tag literally, or
build the element with `document.createElement`.

```js
html`<${tag}>hi</${tag}>`     // renders the literal text "<x-foo>hi</x-foo>"
```

### `html.raw`

Trusted HTML opt-in — bypasses escaping. Never pass user input.

```js
html.raw`<div>${trustedMarkup}</div>`
```

### `onReady(callback)`

Registers a callback to run once the component has rendered and is in the
document. Must be called synchronously inside `setup`. Returning a function
from it registers a cleanup, run when the element is genuinely removed — a
move or a re-parent does not count.

```js
define("x-clock", (el) => {
  let now = new Date();
  onReady(() => {
    const id = setInterval(() => { now = new Date(); update(el); }, 1000);
    return () => clearInterval(id);
  });
  return () => html`<time>${now.toLocaleTimeString()}</time>`;
});
```

Each callback is isolated: one that throws is reported through `onError` with
the `"ready"` phase and does not stop the others, or cost you their cleanups.

### `onError(handler)`

Registers an error handler for this component. Must be called synchronously
inside `setup`. Receives the element, the `Error`, and the phase it happened
in — `"setup"`, `"ready"`, `"render"` or `"reconcile"`.

```js
define("x-risky", (el) => {
  onError((target, err, phase) => report(`${phase}: ${err.message}`));
  return () => html`<p>${mightThrow()}</p>`;
});
```

Errors do not travel to a parent component — every component is its own
boundary. Throws from an event handler are not caught here; they reach
`window.onerror` like any other listener.

### `update(el)`

Triggers a re-render. Multiple calls are batched into a single update.

A component that has failed is retried: `update()` clears the error box and
renders again, on the assumption that whatever threw has been fixed. If it
throws again, the error box comes back. A failure in `setup` is the exception —
`setup` runs once per element and cannot be re-run, so the same error is
reported again rather than the component being blanked.

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

> **[Full CSS Documentation](./packages/micro-ui/docs/css-utils.md)**

---

## Development

This repo is a pnpm workspace driven by [`tsr`](https://tsr.opentechf.org). Every
task — build, test, lint, demo — is declared in [`tasks.toml`](https://github.com/Open-Tech-Foundation/Micro-UI/blob/main/tasks.toml) at the
root and can be run from **any** directory in the repo. Run things through `tsr`;
reaching past it to the underlying tool is the usual way to lose an afternoon (see
[Gotchas](#gotchas)).

### Prerequisites

| Tool | Needed for | Install |
|------|-----------|---------|
| Node 22+ | the toolchain | [nodejs.org](https://nodejs.org), or `nvm install 22` |
| pnpm | workspace dependencies | `corepack enable` |
| `tsr` | every task below | `curl -fsSL https://raw.githubusercontent.com/Open-Tech-Foundation/tsr/main/install.sh \| bash` |
| `esdev` | `build` and `demo` | `curl -fsSL https://raw.githubusercontent.com/Open-Tech-Foundation/ES-Runtime/main/install.sh \| bash` |
| `bun` | the test suite | `curl -fsSL https://bun.sh/install \| bash` |
| chromium *(optional)* | `tsr test:browser`, which skips without it | your package manager, or set `CHROME_BIN` |

`tsr` and `esdev` are standalone binaries, not npm dependencies — they land in
`~/.tsr/bin` and `~/.es-runtime/bin`, and both need to be on your `PATH`.
[`.github/workflows/ci.yml`](https://github.com/Open-Tech-Foundation/Micro-UI/blob/main/.github/workflows/ci.yml) does exactly this and is
the shortest complete description of a working environment.

### Setup

```sh
git clone https://github.com/Open-Tech-Foundation/Micro-UI.git
cd Micro-UI
pnpm install
tsr check     # typecheck + lint + format + the full test suite
```

### Tasks

`tsr --list` prints them all; `tsr <task> --dry-run` shows the command a task would
run without running it.

| Task | What it does |
|------|--------------|
| `tsr check` | The gate: `typecheck` + `lint` + `fmt:check` + `test` + `test:browser`. Run it before every commit. |
| `tsr test` | The jsdom suite — `bun test`, 572 tests across 24 files today. |
| `tsr test:browser` | `test.html` in a real browser, over the DevTools protocol. Skips if no browser is installed. |
| `tsr typecheck` | `tsc --noEmit` over `packages/*`. |
| `tsr lint` | Biome lint. |
| `tsr fmt` / `tsr fmt:check` | Biome format — `fmt` rewrites files, `fmt:check` only reports. |
| `tsr build` | Types, `dist/index.js`, `dist/index.min.js`, both CSS bundles, and the package README. |
| `tsr demo` | The demo workbench on <http://localhost:5173>. |
| `tsr ci` | `check` then `build` — what GitHub Actions runs on every PR. |

### Repo layout

```
packages/micro-ui/
  src/            the library — ~1,700 lines, zero dependencies
  test/jsdom/     the entire test suite
  docs/           CSS utility reference
  dist/           build output (git-ignored, not committed)
demo/src/         demo apps, one file per feature area
tasks.toml        task definitions for tsr
biome.json        lint + format rules
CHANGELOG.md      curated by hand; release notes are generated from it
```

### The source, module by module

| Module | Role |
|--------|------|
| `html.ts` | The `html` tag. Looks up the parsed template for this literal, builds a vnode tree from the current values. |
| `template.ts` | Parses each template **once** into a static description, with a `\ue000` marker wherever a `${...}` sits. Cached on the template literal itself. |
| `vdom.ts` | Clones that description into a vnode tree, substituting values and flattening nested fragments and arrays. |
| `reconcile.ts` | Diffs the previous vnode tree against the new one and patches the DOM: attributes, events, child components' props, and keyed/unkeyed child lists. |
| `dom.ts` | DOM primitives — element creation, `setProp`'s attribute-vs-property rules, namespace correction. |
| `define.ts` | Wraps a setup function in a Custom Element. One reconciliation root, and one error boundary, per element. |
| `update.ts` | `update()` and `flush()` — microtask batching, plus render-loop detection. |
| `lifecycle.ts` | `onReady` / `onError`, collected during setup. |
| `state.ts` | The WeakMaps: instance records, template cache, the pending-render set. |
| `store.ts` | The optional shared store — `get`/`set`/`subscribe`/`del`/`clear`, including path writes. |
| `ns.ts` | SVG namespace resolution and the camelCase SVG tag names `createElementNS` will not canonicalize for you. |
| `raw.ts` | `html.raw`, the explicit trusted-HTML escape hatch. |
| `error.ts` | The per-component error boundary and its on-page box. |
| `mount.ts` | `mount(el, tag, options)`. |

### Tests

```sh
tsr test                                       # everything
cd packages/micro-ui
bun test test/jsdom/keyed-lis.test.mjs         # one file
bun test test/jsdom -t "swapping two rows"     # one test, by name
```

Every test file imports `./setup.mjs` **first**: it builds a jsdom window and puts
`document`, `customElements`, `HTMLElement` and friends on `globalThis` before the
library is loaded, because the library reaches for them at module scope. Each file
then imports the library with a cache-busting query
(`../../src/index.ts?keyed-lis-${Date.now()}`) so it gets a fresh module instance,
and generates random tag names — a custom element name can only be defined once per
registry, and tests must not collide.

Write the test so it fails against the bug. Asserting the final DOM often passes
either way: `keyed-lis.test.mjs` counts `insertBefore` calls, and
`lifecycle.coverage.test.mjs` counts how many times setup ran, because that is where
the respective bugs actually lived.

### Gotchas

- **Don't reach for `npx`.** `npx esdev build src/index.ts --out=dist/index.min.js
  --minify` resolves a *different* esdev out of the npx cache and fails with
  `ENOENT: … /build/`, then with a bogus `SyntaxError: Export 'define' is not
  defined`. Nothing is wrong with the repo — `tsr build` works. The same applies to
  Biome and `tsc`: use `tsr lint`, `tsr fmt`, `tsr typecheck`.
- **`dist/` is not committed.** It is a build artifact, produced by the release
  workflow. Never include it in a PR; measure bundle size by building locally
  (`tsr build:js:min`, then `gzip -c packages/micro-ui/dist/index.min.js | wc -c`).
- **There are two READMEs.** `packages/micro-ui/README.md` is *generated* from this
  file by `tsr build:readme` and published to npm. Edit this one.

### Before you open a PR

- `tsr check` is green.
- The change has a test. Unit tests for logic, a jsdom test under
  `packages/micro-ui/test/jsdom/` for anything user-facing, plus the edge and error
  cases.
- `CHANGELOG.md` has an entry under `## [Unreleased]`, saying what broke and why —
  the release notes are generated from it verbatim.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org)
  (`fix(reconcile): …`). See [AGENTS.md](https://github.com/Open-Tech-Foundation/Micro-UI/blob/main/AGENTS.md) for the full contributor
  rules.

Releases are automated: a merge to `main` runs
[`release.yml`](https://github.com/Open-Tech-Foundation/Micro-UI/blob/main/.github/workflows/release.yml), which builds with `tsr build`,
publishes `@opentf/micro-ui` to npm with provenance, tags `v{version}`, and cuts a
GitHub Release from the curated changelog.

## What This Is Not

Micro-UI renders and updates the DOM. Everything else you use the platform for:

- **No router** — one reconciliation root per custom element, so islands drop into
  whatever page or framework already routes.
- **No data-fetching layer** — call `fetch` in `setup` and put the result in a
  `store`; there is no query cache, retry, or invalidation to learn.
- **No SSR or hydration** — client islands only.
- **No compiler, build step, or devtools** — templates are parsed at runtime.

For a large app with deep routing and server rendering, reach for React, Vue, or
Angular instead.

## License

MIT
