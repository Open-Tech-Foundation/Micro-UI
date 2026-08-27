# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Unit and end-to-end test suite for `@opentf/micro-ui` with FakeDOM helper (`packages/micro-ui/test/`)
- `Gravity` demo page — N-body Newtonian simulator with canvas, presets (solar/orbits/binary/cluster), gravity/damping/speed controls, trails, and click-to-add bodies (`demo/src/gravity.ts`)
- Parallel real-DOM test layer using `jsdom` + Node's built-in test runner at `packages/micro-ui/test/jsdom/`, wired via `[tasks.test:jsdom]` in `tasks.toml`. Covers init render, event → update reconcile, keyed list reorder identity, controlled input, and `onReady` cleanup. Runs alongside the in-house FakeDOM tests without replacing them.

### Security
- **Text interpolations are now HTML-escaped by default** (`& < > " '` → entities). User-supplied content passed to `${value}` is rendered as literal text — script tags and injected markup can no longer execute or render. Opt back into trusted HTML with `html.raw\`...\``. The `raw` template still escapes its own interpolated primitives; only the *static structure* of the raw template is treated as markup.

### Added
- **`onError(handler)` lifecycle hook** matching the `onReady` shape — register synchronously inside `define(..., setup)`. Handler is called with `(target, error, phase)` where `phase` is `"setup" | "render" | "reconcile"`. A throwing component is now **isolated**: the host page keeps running, the failed element is replaced with a small inline error box (`<div data-micro-ui-error>`), and the instance is marked `errored` so further `update()` calls are skipped. Handler throws are caught and logged so a buggy handler cannot break the host.
- `Errors` demo page (`demo/src/errors.ts`) — showcases the `onError` hook and error isolation with: a healthy ticking sibling, a counter that can be armed to throw on the next update, a counter that breaks after 3 renders with a "recover" rebuild, a one-shot throw button, and a live log of every error captured by the handlers. Wired into the nav in `x-app`.

### Changed
- `form` demo: wrap the JSON preview in `html.raw` so the serialized output renders as literal text (quotes, braces, colons) instead of being HTML-escaped to entities. The source is the app's own form state, and `innerHTML`-inserted content does not execute `<script>` tags.
- README: add a short tagline — *"A tiny runtime for AI-generated micro-apps"* — under the org banner.

### Removed
- Hand-synced dev copy at `src/micro-ui.js` and the now-empty `src/` directory. `test.html` now imports directly from `packages/micro-ui/src/index.js`. The package is the single source of truth.

