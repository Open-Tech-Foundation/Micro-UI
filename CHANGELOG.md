# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-27

### Added
- `store` as a namespace export from `@opentf/micro-ui` with methods:
  - `store.get(key)` / `store.get(key, { path })` — read a value or nested value by dot-separated path
  - `store.set(key, value)` / `store.set(key, value, { path })` — write a value or nested value immutably
  - `store.del(key)` / `store.del(key, { path })` — delete a key or remove a nested key
  - `store.subscribe(key, fn)` — listen for changes; returns an unsubscribe function
  - Listener errors are caught per-listener so one failing callback cannot break others
  - Empty-string paths are handled correctly (`opts?.path != null` guard)

## [0.1.0] - 2026-08-27

### Added
- Unit and end-to-end test suite for `@opentf/micro-ui` with FakeDOM helper (`packages/micro-ui/test/`)
- `Gravity` demo page — N-body Newtonian simulator with canvas, presets (solar/orbits/binary/cluster), gravity/damping/speed controls, trails, and click-to-add bodies (`demo/src/gravity.ts`)
- Parallel real-DOM test layer using `jsdom` + Node's built-in test runner at `packages/micro-ui/test/jsdom/`, wired via `[tasks.test:jsdom]` in `tasks.toml`. Covers init render, event → update reconcile, keyed list reorder identity, controlled input, and `onReady` cleanup. Runs alongside the in-house FakeDOM tests without replacing them.
- **Biome** for linting and formatting (`biome.json`). CI tasks: `lint`, `fmt`, `fmt:check`.

### Security
- **Text interpolations are now HTML-escaped by default** (`& < > " '` → entities). User-supplied content passed to `${value}` is rendered as literal text — script tags and injected markup can no longer execute or render. Opt back into trusted HTML with `html.raw\`...\``. The `raw` template still escapes its own interpolated primitives; only the *static structure* of the raw template is treated as markup.

### Added
- **`onError(handler)` lifecycle hook** matching the `onReady` shape — register synchronously inside `define(..., setup)`. Handler is called with `(target, error, phase)` where `phase` is `"setup" | "render" | "reconcile"`. A throwing component is now **isolated**: the host page keeps running, the failed element is replaced with a small inline error box (`<div data-micro-ui-error>`), and the instance is marked `errored` so further `update()` calls are skipped. Handler throws are caught and logged so a buggy handler cannot break the host.
- `Errors` demo page (`demo/src/errors.ts`) — showcases the `onError` hook and error isolation with: a healthy ticking sibling, a counter that can be armed to throw on the next update, a counter that breaks after 3 renders with a "recover" rebuild, a one-shot throw button, and a live log of every error captured by the handlers. Wired into the nav in `x-app`.

### Changed
- Split monolithic `src/index.ts` into focused modules: `types.ts`, `escape.ts`, `template.ts`, `vdom.ts`, `raw.ts`, `dom.ts`, `reconcile.ts`, `update.ts`, `define.ts`, `mount.ts`, `html.ts`, `lifecycle.ts`, `error.ts`, `state.ts`, with `index.ts` as barrel re-exports.
- `form` demo: wrap the JSON preview in `html.raw` so the serialized output renders as literal text (quotes, braces, colons) instead of being HTML-escaped to entities. The source is the app's own form state, and `innerHTML`-inserted content does not execute `<script>` tags.
- README: add a short tagline — *"A tiny runtime for AI-generated micro-apps"* — under the org banner.
- **Deferred DOM creation** — `cloneNode()` now returns a descriptor-only (no `.dom`) during updates. Real DOM is materialised on-demand via `materializeNode()` only when reconcile decides to insert or replace. Eliminates O(N) superfluous `createElement` + `addEventListener` + `setProp` calls on keyed list reorders and repeated updates. Events are attached only to the retained node, not to throwaway descriptors.
- Replace `Object.entries()` with `for...in` in `cloneNode`, `materializeNode`, and initial render path — avoids `[k,v][]` array allocation per element per render.
- **Convert library to TypeScript** — `src/index.js` → `src/index.ts` with full type annotations. `html` restructured as typed `HtmlTag` interface for proper `.d.ts` generation.
- Package exports now point to `dist/` with `.d.ts` declarations via `esdev build --dts-bundle`.
- jsdom tests run under **bun**; FakeDOM/E2E tests continue under **esdev**.

### Removed
- Hand-synced dev copy at `src/micro-ui.js` and the now-empty `src/` directory. `test.html` now imports directly from `packages/micro-ui/src/index.js`. The package is the single source of truth.
- Incorrect `~400 lines` claim from demo tagline.

### Documentation
- Added dedicated **Security** section to README covering HTML escaping, `html.raw` opt-in, and error isolation.
- Documented all public APIs in README: `define`, `html`, `html.raw`, `update`, `flush`, `mount`, `onReady`, `onError`.

