# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- A component that threw once is no longer dead for the life of the page. `flush()` skipped any instance with `errored: true` and nothing ever cleared it, so fixing the cause and calling `update()` did nothing — the only way back was to remove the element and re-add it. `update()` now retries: it clears the error box, resets the stale tree, and renders. Two things had to change for that to work at all — the mount-time render failure threw the real render function away and stored an empty-fragment stub in its place, so there was nothing to recover *to*, and `inst.tree` still described the DOM from before the failure while the error box had replaced the host's children, so a retry would have patched nodes that were no longer in the document. A `setup` failure still reports the same error, since `setup` runs once per element and cannot be re-run.
- Colour contrast now meets WCAG AA. `--ui-text-muted` was **2.56:1** on white (light) and 3.67:1 (dark) while being used for `.ui-muted` body text, input placeholders, inactive `.ui-tab` labels and `.ui-breadcrumbs`; it is now 4.76:1 and 5.25:1. `.ui-btn-primary` missed AA by 0.03 at 4.47:1 — `--ui-primary` moves one step down the ramp to `#4f46e5` (6.29:1), with `-hover`/`-active` following. `--ui-success` (3.30:1) and `--ui-warning` (3.19:1) and `--ui-info` (4.10:1) are darkened to 5.02, 5.02 and 5.93:1.
- Four rules hardcoded `color: white` on a themed fill, which inverts in dark mode where the fills get *lighter*: `.ui-btn-success` fell to **2.28:1**, `.ui-btn-warning` to 2.15:1 and `.ui-btn-info` to 2.14:1 in dark. They now use a new `--ui-text-on-accent` token that flips with the theme, like `--ui-primary-foreground` already did.
- The tooltip was unreadable in dark mode. `.ui-tooltip-content` painted `color: white` on `background: var(--ui-text)` — and `--ui-text` is `#fafafa` in dark, so white on near-white, **1.05:1**. Its foreground is `--ui-surface`, which is correct by construction in both themes.
- Keyboard focus is visible again. `--ui-focus-ring` was a single `0 0 0 3px rgb(99 102 241 / 0.18)` — blended against white that is **1.26:1**, where WCAG 2.2 SC 2.4.11 asks for 3:1 — and `.ui-btn:focus-visible` set `outline: none` before applying it, so there was no fallback either. The ring is now two layers, a surface-coloured gap and a solid `--ui-focus-ring-color` (6.29:1 light, 8.89:1 dark), and every focus rule keeps a transparent outline so Windows High Contrast, which drops box-shadows, still has something to repaint.
- Focus styles now exist on everything that has a hover style. `.ui-tab`, `.ui-menu-item`, `.ui-page`, `.ui-breadcrumb`, `.ui-list-item-hover`, `.ui-card-hover` and `.ui-link` all reacted to a mouse and gave a keyboard nothing at all. `.ui-checkbox`/`.ui-radio` inputs get the ring too, and `.ui-switch` draws it on `.ui-switch-track` — its own input is `opacity: 0`, so focusing it was literally invisible.
- Added a `@media (forced-colors: active)` block. Every focus ring in the library was a box-shadow, which that mode discards entirely; focus is now an OS `Highlight` outline, and the active tab/page/menu item — previously distinguished by colour alone — gets a border the mode preserves.
- The split CSS imports the README documents now exist. `@opentf/micro-ui/styles/tokens.css`, `.../base.css` and `.../components.css` were documented for a release without ever being exported or built: `package.json` had no `./styles/*` entry and `dist/` held only the bundle, so every consumer following the README got `ERR_PACKAGE_PATH_NOT_EXPORTED`. A `build:css:parts` task now emits each partial (and a `.min.css` beside it) into `dist/styles/`, and the exports map carries `"./styles/*"`.

### Changed
- Event handlers no longer churn the listener list. `patchEvents` removed and re-added a listener whenever handler identity changed — and the idiomatic `onclick=${() => remove(item.id)}`, the only way to close over the row it belongs to, is a fresh closure every render. Re-rendering a 1,000-row list therefore ran **2,000 listener operations** while nothing about the page had changed. A listener is now bound once per element and event type and reads the current handler from a slot, so an update is a property write: **1.78 → 1.12 ms per render (-37%)**, and zero listener operations. Handlers keep their existing semantics — the event is passed through, `this` is the element, and a nullish binding is inert.
- Keyed list patching takes a same-order fast path when nothing moved. `patchKeyed` allocates two `Map`s and four arrays to work out what to move; the ordinary re-render — same rows, same order, only their content changed — needs none of it. A single allocation-free walk now checks that the rows have the same keys pairwise and are still this parent's children in that order, and if so reconciles them straight through. Measured over 300 renders of a 1,000-row list: content-only re-render 1.27 → 1.03 ms (-18%), a re-render that changes nothing 0.79 → 0.56 ms (-29%). Lists that do move rows are unaffected — the walk fails the length check or bails at the first displaced row.
- Keyed list patching now computes the minimum set of DOM moves instead of re-anchoring every node it walks past. `patchKeyed` iterated the new children right to left and called `insertBefore` on any node whose `nextSibling` was not the previously placed one — so moving a single row displaced every row after it, cascading: swapping two rows of 1,001 cost **997** `insertBefore` calls where 2 suffice, and removing one row from the middle of a list moved the rows below it. Matching, content patching, removal and placement are now four separate passes, and placement keeps the rows on a longest increasing subsequence of their live DOM positions (patience sorting, O(n log n)) fixed while moving only the rest. Sorting, filtering and drag-reorder in long lists are the visible wins; a list whose order did not change now performs no `insertBefore` at all.

### Fixed
- Five node-identity assertions in `keyed-lis.test.mjs` asserted nothing. `assert.deepEqual` compares two *distinct* DOM nodes as equal — a jsdom element has no own enumerable properties — so `deepEqual([...ul.children], before)` passed however many rows had been rebuilt. They now compare element by element with strict equality, via a `sameNodes` helper.
- A duplicate key in a keyed list no longer leaks a row. The old-node lookup was keyed by a `Map` whose later entry overwrote the earlier one, so the shadowed node was neither matched nor removed and stayed in the DOM forever. Unmatched old nodes are now tracked per index, so every one of them is removed.
- A keyed row detached from outside is re-inserted even when it belongs last. The re-insert was guarded by `nextSibling !== nextSib`, both of which are `null` for a detached final row, so it was silently dropped from the render.

### Added
- `test/jsdom/error-recovery.test.mjs` — 7 tests: recovery after a render throw, that the recovered component keeps updating, that no error box or pre-failure subtree is left behind, that `onError` reports every failure rather than only the first, that a reconcile failure recovers, that a `setup` failure keeps reporting instead of blanking, and that cleanups registered before the failure still run on removal. Four fail against the old behaviour.
- `test/jsdom/events.test.mjs` — 10 tests on handler dispatch, eight of which pass against the old remove-and-re-add implementation too, since the change has to be invisible: the newest closure runs, a row's handler follows it through a reorder, dropping and restoring a binding works, `this` and the event argument are unchanged, siblings and event types do not share slots. The other two count `addEventListener`/`removeEventListener` calls and fail against the old code.
- `test/jsdom/a11y.styles.test.mjs` — computes contrast from the tokens (both themes) for body/secondary/muted text, every accent fill against its label, each fill's hover state, and the focus ring; and asserts no rule hardcodes a foreground colour on a themed fill, that nothing with a `:hover` rule is left without a `:focus-visible` one, that no focus rule uses `outline: none`, and that the forced-colors block covers focus. Seven of its eight assertions fail against the previous stylesheet.
- `test/jsdom/dom-identity.test.mjs` — 12 tests behind the README's "form-friendly" claim, which had none: focus survives a re-render, rows appearing around it, and a reorder that does not move the focused row; caret position, unbound input values and unbound `checked` survive; `scrollTop` survives on both a pane and a keyed list; `<video>`, `<canvas>` and `<iframe>` are patched rather than rebuilt, including a `<video>` inside a keyed row that moves. jsdom models `activeElement`, selection ranges, `scrollTop` and media properties, and drops focus on `insertBefore` exactly as a browser does; it cannot model paint, real scrolling or real playback, which still want `test.html` in a browser.
- `test/jsdom/package-exports.test.mjs` — resolves every `@opentf/micro-ui/...` specifier appearing in the README through the exports map, wildcards included, and checks each target is something a task in `tasks.toml` actually builds. Documenting an import the package does not ship is now a test failure.
- Four more tests in `test/jsdom/keyed-lis.test.mjs` covering the same-order fast path, which is otherwise unobservable: unkeyed rows in a keyed list keep their nodes, a row whose tag changed is replaced in place without disturbing its neighbours, a stray node inserted mid-list by outside code does not corrupt the render, and duplicate keys in an otherwise stable list keep both rows.
- `test/jsdom/keyed-lis.test.mjs` — 18 tests that assert the *number* of `insertBefore` calls, not only the final order: the 1,001-row swap, unchanged re-render, content-only change, move-to-front, reversal, append, prepend, middle removal, and 25 seeded shuffles of 40 rows checked against an independent LIS reference for both optimal move count and node identity. Plus the mixed keyed/unkeyed, duplicate-key, detached-row, tag-change and external-reorder cases.

### Documentation
- README gains a **Development** section: prerequisites with the exact install commands for the standalone `tsr` and `esdev` binaries, every `tsr` task and what it does, repo layout, a module-by-module map of `src/`, how to run one test file or one test, and the PR checklist. The repo is driven by `tsr` from `tasks.toml`; reaching past it — `npx esdev build ...` — silently resolves a different esdev from the npx cache and fails with an `ENOENT` on `build/` and then a bogus `SyntaxError`, which reads as a broken repo and is not one. That trap is now written down.

### Removed
- The README's **Design** section. Its four bullets restated Features, How it works and the API sections above it, and its reconciliation bullet had gone stale — placement is no longer "matched by index or key" alone.

## [0.9.0] - 2026-08-29

### Added
- `ErrorPhase` gains `"ready"`, distinguishing a failure in an `onReady` callback from one in `setup`.
- `mount(el, tag, { dev })` — opt in to developer diagnostics. With `dev` off (the default) a failing component renders `Something went wrong.` instead of the thrown error's message, which may carry a URL, a token or an internal path. The full error always reaches `console.error` and any `onError` handler regardless, so nothing is lost for debugging. Exports a `MountOptions` type.

### Fixed
- A throwing `onReady` callback no longer corrupts the component. The drain loop was unguarded and `errorHandlers.set()` was the line after it, so one throw escaped `connectedCallback` uncaught, skipped every remaining callback, left the component permanently without its own `onError` handlers, and lost the cleanups those callbacks would have registered — silently, with the component still mounted. Each callback is now isolated and reported through `onError` with the new `"ready"` phase; the rendered UI is left alone, since the component itself rendered fine.
- The on-page error box no longer prints a thrown error's message by default. Because every component is its own boundary, that box renders wherever the failing component sits — potentially somewhere an end user is looking — with no development/production distinction to gate it.
- Re-parenting an element no longer destroys its component. `disconnectedCallback` tore the instance down synchronously, but a move fires disconnect immediately followed by connect — so drag-and-drop, tab reparenting and list virtualisation silently reset state and ran cleanups. Teardown is now deferred by a microtask and cancelled if the element is back in the document, while a genuine removal still tears down as before.
- A cleanup callback that throws is now isolated and logged instead of blocking the cleanups after it. Required by the deferred teardown above — a throw from a microtask would otherwise be an unhandled error with no caller to catch it.
- `update()` called from inside a component's own render is deferred to the next flush instead of being silently dropped. A store listener firing synchronously during render was the usual way to lose a write. An unbroken chain of self-updates is capped at 25 and reported through `onError` and the error UI as a render loop, rather than dropped or left to hang the tab.
- `update(el)` now re-reads the host's attributes into `props` before rendering. `props` was snapshotted in `connectedCallback` and only ever refreshed by a parent's reconcile pass, so an attribute changed from outside the library stayed invisible even to an explicit `update()` — the one escape hatch the library documents for everything else. The props object is mutated in place, since the render closure captured it.
- `store.set(key, value, { path })` no longer turns arrays into objects. Every container was spread into an object literal, so `{ items: [1,2,3] }` became `{ items: { "0":1, "1":2, "2":3 } }` and the next `.map()` in a render threw. Arrays are now cloned as arrays at every level, including the top-level value.
- `store.del(key, { path })` on an array index now splices the element out instead of leaving a sparse hole with the length unchanged.
- `store.clear()` no longer silently orphans subscribers. `subscribe()` closes over the store entry, so clearing the map left every listener attached to an entry that no later `set()` would ever notify. `clear()` now resets values, notifies subscribers, and drops only entries nobody is subscribed to.
- Keyed list patching no longer builds a DOM subtree per matched row and immediately discards it. `patchKeyed` called `materializeNode()` before `reconcile()`, which then reused the existing node — so updating one row of a 50-row list allocated 150 elements and threw all of them away. It now allocates none.
- A keyed row whose tag changes is no longer resurrected. `patchKeyed` re-inserted the old node after `reconcile()` had already replaced it, leaving both in the tree.
- Nested components no longer re-render on every parent update. The props-sync loop compared against `String(value)` while storing `undefined` for nullish attributes, so any child with a nullish bound attribute reported a prop change on every pass.
- Clearing a bound attribute no longer re-adds it as the literal string `"undefined"`. `setProp` followed `removeAttribute()` with a property write of `undefined`, which any reflected non-nullable `DOMString` stringifies — so `html\`<img src=${url}>\`` with a null `url` produced `src="undefined"` and a spurious request. Affected `title`, `id`, `lang`, `src`, `alt`, `href`, `placeholder`, `name` and the `aria-*`/`role` path.
- Text interpolations are no longer double-encoded. `${value}` was passed through an entity escaper *and* then inserted with `createTextNode`, so `${"Tom & Jerry"}` rendered the literal text `Tom &amp; Jerry` on screen. Text nodes are never parsed as markup, so the escaper added no safety — only corruption. Injected markup remains inert.

### Documentation
- README documents the error model explicitly: every component is its own boundary, errors do not travel up to a parent, and event-handler throws reach `window.onerror` rather than `onError`.
- README documents the attribute/props model under `define`: `props` refreshes on every render, changing an attribute does not re-render on its own, and attributes bound from a parent template are updated by the parent's own re-render. External mutation is explicitly not observed — there is no `observedAttributes`/`attributeChangedCallback`, by design.

### Removed
- Duplicate `test:jsdom` task. It ran the same command as `test`, and `check` depended on both, so CI ran the whole suite twice. There is one suite now that the FakeDOM harness is gone.
- Stale `dist/escape.js` cleanup from `build:types`, left behind when `src/escape.ts` was removed.
- `src/escape.ts` — unused once `resolveBinding` stopped double-encoding. It was not part of the public API.
- FakeDOM test harness — removed `test/helpers/dom.mjs` and all `test/micro-ui.*.test.mjs` (FakeDOM) suites. All coverage is now provided by the jsdom suite under `test/jsdom/` (`bun test`). `tasks.toml` updated: `[tasks.test]` now runs `bun test test/jsdom/*.test.mjs` and `[tasks.test:e2e]` (esdev FakeDOM) is removed.

### Changed
- Corrected the "no virtual DOM" claim in the README and the package description. Micro-UI builds a virtual tree in `vdom.ts` and diffs it against the previous tree in `reconcile.ts`; it never reads the live DOM to decide what changed. The README now describes what is actually distinctive — templates parsed once and cached, no compiler, no signals, no scheduler — and adds a "How it works" section.
- Replaced 6× `as unknown as Record<string, unknown>` double-casts in `dom.ts` with `setElProp()` helper.
- Replaced 5× `as EventListener` casts across `dom.ts`, `vdom.ts`, and `reconcile.ts` with `addListener()`/`removeListener()` helpers.
- Extracted shared `splitPath()` helper in `store.ts` (was duplicated 3×).
- Hoisted `getParentNS()` call out of the `patchKeyed` loop body (one call per patch instead of one per iteration).

### Added
- Tests for four branches that mutation testing showed no test could detect the removal of: `mountErrorUI` clearing the host before mounting the error box (previously only ever exercised on an already-empty host), the `domNS === SVG_NS` and `tag === "foreignobject"` branches of `resolveNS` (both masked in integration by the `parentNS === SVG_NS` branch below them), and `resolveBinding` accepting a bare element vnode as a value (`html` always returns a fragment, so the text/element branches were never reached by a whole template).
- Unit tests for `setProp` (value, boolean, ARIA, generic, event listeners) in `test/micro-ui.setprop.test.mjs`.
- jsdom tests for `addListener`/`removeListener`, `setElProp`, and `setProp` real DOM behavior in `test/jsdom/dom-helpers.test.mjs`.
- Migrated all FakeDOM tests to jsdom: ported `micro-ui.test.mjs` (136 tests), `micro-ui.coverage.test.mjs` (21 tests), `micro-ui.setprop.test.mjs` (24 tests), `micro-ui.svg.test.mjs` (13 tests), and `micro-ui.e2e.test.mjs` (5 tests) into `test/jsdom/` (`micro-ui.jsdom.test.mjs`, `coverage.jsdom.test.mjs`, `dom-helpers.test.mjs`, `svg.test.mjs`, `e2e.test.mjs`). FakeDOM suite now has full jsdom parity (344 jsdom tests). Real DOM provides accurate attribute/property reflection and namespace coverage that FakeDOM cannot observe.
- Full lifecycle, catch-block, and adversarial template coverage: `test/jsdom/lifecycle.coverage.test.mjs` (28 tests — `onReady`/`onError` sync/after-clear/async/queueMicrotask/nested, non-function cleanup ignored, `destroyCallbacks`/`errorHandlers` WeakMaps, save/restore across nested `define`), `test/jsdom/catch.coverage.test.mjs` (30 tests — every `try/catch` in `dom.ts` `setElProp`/`setAttributeNS`/`removeAttributeNS`, `store.ts` `notify`, `error.ts` `mountErrorUI`/`safeCall`, `update.ts`/`define.ts` non-Error wrapping), `test/jsdom/template.adversarial.test.mjs` (15 tests — malformed HTML, comments/script inertness, static `on*` throw, `MARKER` static vs interpolated & attribute-breakout, empty/whitespace/many-bindings, script-literal text, nested `html`/`raw` MARKER, unicode/null-byte/case, NS `foreignObject`/`mathml`/`xlink:href`). Total jsdom suite now 417 tests, 0 fail.

## [0.8.0] - 2026-08-29

### Changed
- README restructured: Installation, Import (jsDelivr/unpkg/esm.sh/npm), Quick Start sections.

### Fixed
- `styles.css` now properly bundled with `lightningcss --bundle` instead of broken `@import` statements pointing to non-existent `styles/` files.

## [0.7.0] - 2026-08-29

### Changed
- Package exports updated: `"."` and `"./index.min.js"` with `types`/`import`/`default` conditions; `"./styles.css"` and `"./styles.min.css"` for CSS.
- CDN URLs now use `./index.min.js` subpath instead of `./min`.
- Removed `"./styles/*"` subpath export (no longer needed with flat dist).
- Build tasks use `lightningcss` directly without `npx` wrapper.

## [0.6.0] - 2026-08-29

### Added
- **Minified output** — `build:js:min` and `build:css:min` tasks produce single-file minified JS (`dist/index.min.js`) and bundled minified CSS (`dist/styles.min.css`). Uses `lightningcss-cli` (Rust-based, devDependency only). CDN URLs now point to minified versions.
- **Single-file bundles** — dist is now flat: `index.js` (single bundle, 26 KB / 6.8 KB gzip), `index.min.js` (single bundle minified, 15 KB / 5 KB gzip), `index.d.ts`, `styles.css`, `styles.min.css`. No more `dist/min/` or `dist/styles/` subdirectories.
- **Test coverage** — 34 new tests closing prior gaps:
  - Unit tests for `escapeText` (`escape.ts`), `resolveNS`/`svgTagName` (`ns.ts`), and `buildTemplate`/`buildDesc` static paths (`template.ts`).
  - Store: listener that throws still notifies other subscribers and does not break `set`/`del`; `subscribe`/`del`/`clear` subscription semantics including double-unsubscribe `false`; array-index path `"items.0.name"` and primitive-to-object path init.
  - Lifecycle: `define` duplicate tag throws; post-mount `setAttribute` does not auto-update `inst.props` until `update()`; `onReady` cleanup that throws is contained and does not block other cleanups.
  - Reconciler: `update()` re-entrancy guard (self-update in render queues exactly one flush), `flush` idempotence, and `update` on unknown/disconnected elements is a no-op.
  - `html.raw` with empty string and trusted-HTML contract.
  - jsdom real-DOM: SVG `foreignObject` HTML→SVG→HTML NS switching via `correctVNodeNS` recreation, and computed-style smoke for `.ui-btn` injection.

### Changed
- Deduplicated `createEl` (was identically defined in `dom.ts` and `vdom.ts`) — now exported once from `dom.ts` and imported in `vdom.ts`.
- Extracted `resolveNS(tag, parentNS, domNS?)` helper into `ns.ts` to unify SVG/HTML namespace resolution logic previously repeated in `template.ts`, `dom.ts` (`correctVNodeNS`, `materializeNode`).
- Extracted `XML_NS_MAP` constant in `dom.ts` to replace two identical inline `nsMap` definitions in `setProp`.
- Removed all `as any` casts in `dom.ts` and `reconcile.ts` — replaced with proper type narrowing via VNode union type guards.
- Removed dead `else if ((node as any).type === "raw")` branch in `materializeNode` (`VNode` does not include `RawVNode`).
- `update.ts` now wraps non-`Error` thrown values in `new Error(String(err))` instead of blindly casting `err as Error`.
- Split monolithic build task into focused sub-tasks (`build:lib`, `build:css`, `build:readme`) with `deps` in `tasks.toml`.

## [0.5.0] - 2026-08-29

### Fixed
- **dom.ts / vdom.ts / reconcile.ts** — SVG elements created via dynamic `html` fragments (e.g. `html`<g>`, `html`<circle>` or `items.map(html`<circle>`)) inside `<svg>` now correctly get `SVG` namespace. Previously they were parsed as HTML (`http://www.w3.org/1999/xhtml`) and remained HTML when inserted, so nested circles/lines/g's from `showGrid` toggle and keyed lists in `x-svg-demo` were invisible. Static `svg` content was unaffected. Now fragments are NS-corrected on creation and on every `reconcile` insertion, with `foreignObject` children correctly reverting to HTML — including dynamic children re-inserted into a live `<foreignObject>` after being removed (the reconcile insertion path now applies the same `foreignObject` → HTML exception as template parsing). SVG element names are case-sensitive and several are camelCase (`foreignObject`, `clipPath`, `linearGradient`, `fe*`, …). Previously `createElementNS(svgNS, "foreignobject")` was called with the lowercased tag, which Chromium treats as an *unknown* SVG element with no layout — so a static `<foreignObject>` rendered as a 0×0 box with invisible HTML content. `svgTagName()` in **ns.ts** now maps lowercase tags back to the canonical spelling for every SVG element created via `createEl` (**dom.ts** / **vdom.ts**), so `foreignObject`, `clipPath`, `linearGradient`, `fe*` and friends render and behave correctly.
- **dom.ts** — `aria-*` and `role` attributes now correctly stringify boolean values as `"true"`/`"false"` instead of empty string/removed. `html`<div aria-hidden=${true}>` now renders `aria-hidden="true"` and `aria-hidden=${false}` renders `aria-hidden="false"` (previously `aria-hidden=""` / removed), matching React and the ARIA spec. Dynamic toggling and numeric `aria-*` (e.g. `aria-valuenow`) also stringify correctly.
- Single-child fast path in `patchLists` now checks key/tag/namespace before reusing DOM — single-item keyed lists where the key changes (e.g. `key=1` → `key=2`) are now correctly replaced instead of incorrectly reused. Also handles externally detached single children.
- Whitespace-only text nodes (e.g. `html`<span> </span>``) are now preserved instead of being dropped entirely during template parsing, so intentional spacing inside inline elements and whitespace-only elements survives.
- Re-entrant `update()` calls are now re-entrancy-safe: an element that calls `update()` on itself from within its own render no longer re-queues flushes, which previously caused cascading re-renders (and could spin forever). One `update()` now produces exactly one settled render.
- A static `on*` string attribute (e.g. `onclick="handler()"`) now throws an actionable error instead of silently no-oping in jsdom or crashing `addEventListener` in real browsers. Event handlers must be interpolated functions, e.g. `onclick="${() => {}}"`.
- `patchKeyed` no longer treats a keyed node whose `dom` lives in a *different* parent as re-usable. Previously it would attempt to re-insert such a node, throwing `"The child can not be found in the parent"` and crashing the render. Such a node is now left alone and a fresh node is created instead (externally detached nodes — `parentNode === null` — are still re-attached).
- `store.get()` is now side-effect free: reading a key that was never set no longer allocates a ghost entry in the internal store map (previously `getEntry` was called from `get`, leaking memory on every read of a missing key and letting reads repopulate a cleared store).


### Changed
- **vdom.ts** — removed the unused sequential binding-index counter (`state.vi`). Every binding carries an explicit value-slot `idx`, so the position-tracking fallback was dead, fragile code. If a future binding ever omits `idx`, it now fails loudly (empty value) instead of silently misaligning subsequent bindings.
- **types.ts / template.ts** — dropped the unused `count` and `name` fields from binding descriptors.

## [0.4.0] - 2026-08-28

### Added
- **CSS split bundle** — `src/styles.css` is now an aggregator that re-exports the split partials (`tokens.css`, `base.css`, `components.css`) in declaration order, so the full bundle and the split imports share a single source of truth and the same `@layer` structure.
- **Kanban demo** — `demo/src/kanban.ts` (`x-kanban`): three-column board with native drag & drop (move + reorder via insertion index, `.is-dragging`/`.is-drop-target` classes), store-backed state with `store.subscribe` re-renders, add-card composer, per-column counts, and reset. Drag events touch DOM classes directly so `dragover` never re-renders the board.
- **Explicit theme pins** — new `[data-theme="light"]` (and the existing `[data-theme="dark"]`) token blocks moved into `tokens.css`; an explicit attribute always overrides `prefers-color-scheme` and supports per-container theming.
- **SVG support** — inline SVG via `html\`<svg>...</svg>\`` now creates real `SVGElement`s (`namespaceURI === "http://www.w3.org/2000/svg"`). Covers: `src/ns.ts` (`SVG_NS`), `types.ts` (`ns` on `ElementDesc`/`ElementVNode`), `template.ts` (hybrid `namespaceURI` + inherited `parentNS`, `foreignObject` reset), `dom.ts`/`vdom.ts` (`createElementNS` via `createEl`, NS-aware `setProp` with `xlink:href` support), `reconcile.ts` (`tag+ns` identity), `raw.ts` (fixed `buildDesc` arity). Supports dynamic SVG attrs (`cx`, `viewBox`, `stroke-width`, `transform`, `class`), events on SVG, keyed lists inside `<svg>`, mixed HTML+SVG, `foreignObject`.
- **SVG tests** — 8 new FakeDOM tests (`test/micro-ui.svg.test.mjs`) and 6 jsdom tests (`test/jsdom/svg.test.mjs`) for namespace, dynamic attrs, DOM identity, `foreignObject`, keyed reorder, events, `viewBox`/`class`.
- **SVG demo** — `demo/src/svg.ts` (`x-svg-demo`/`x-svg-page`) with interactive circle (sliders + `viewBox`), keyed `circle` list, `path` sparkline, `foreignObject`, mixed HTML+SVG; wired into `demo/src/main.ts` and `x-app` nav.
- **Test helper** — `test/helpers/dom.mjs` upgraded to NS-aware: `createElementNS`, `namespaceURI`, `setAttributeNS`/`removeAttributeNS`, NS stack in `innerHTML` parser (SVG + `foreignObject` reset).
- **Tests** — expanded `test/micro-ui.test.mjs` (binding-order interleaving, boolean-prop coercion, keyed detached-node reclaim / no orphaned nodes, `html.raw` DOM reuse on same-structure updates, keyed fragment inside raw) and `test/jsdom/svg.test.mjs` (HTML `<a>`/`<title>` stay HTML, SVG `<a>` stays SVG, mixed HTML/SVG siblings).

### Fixed
- **packaged README** — the build-copied `packages/micro-ui/README.md` now rewrites the docs link to `./docs/css-utils.md` and drops the unpublished screenshot line, so links/images resolve from the published package.
- **styles** — automatic dark mode (`prefers-color-scheme: dark`) now re-scales the full token set (brand/status soft colors, `--ui-text-disabled`, shadows, focus ring) instead of only the neutral surfaces, matching the manual `data-theme="dark"` theme so components (alerts, badges, buttons) look correct in auto dark.
- **demo** — the theme toggle now sets `data-theme="light"` explicitly when switching back, instead of removing the attribute, so "Light" works even on a system that prefers dark.
- **docs** — README and `docs/css-utils.md` aligned on theming (automatic dark + explicit `data-theme` pins), spacing class ranges corrected, and `is-dragging` alias documented.
- **template.ts / vdom.ts** — template bindings now record their value-slot index, so `cloneNode` consumes interpolated values in template order instead of the fixed key→attrs→events→children order. Interleaved bindings (e.g. an event attr before a `data-*`, or a `key` as the first expression) no longer misbind values.
- **dom.ts** — boolean-typed properties (`disabled`, `selected`, `checked`, `readonly`, `multiple`, …) now coerce attribute-string values (`"false"`, `"0"`, `"off"`, `"no"`) to their real boolean via `isTruthyAttrVal`, matching browser attribute semantics.
- **raw.ts / vdom.ts** — `materializeRaw` now honors `deferDOM`: during batched, deferred renders raw content is built as a virtual tree and unchanged raw subtrees are reused instead of re-materialized.
- **template.ts / ns** — namespace detection no longer relies on an ad-hoc SVG tag list; it trusts DOM `namespaceURI` plus `svg`/`foreignObject` roots and `parentNS` inheritance, so HTML `<a>`/`<title>` are no longer misclassified as SVG (covered by new real-DOM jsdom tests).
- **define.ts** — initial render of text-type VNode now correctly appends the text node instead of skipping it.
- **reconcile.ts** — `patchByIndex` no longer eagerly materializes new nodes before `reconcile()` checks for DOM reuse, eliminating wasted DOM creation on indexed reconciliation.
- **reconcile.ts** — `patchKeyed` now removes orphaned un-keyed old nodes that aren't matched as fallbacks, preventing DOM leaks when mixing keyed and un-keyed children.
- **vdom.ts** — `resolveBinding` type check for VNode is more robust; requires `dom`, `children`, `value`, or `html` property in addition to `type`, preventing plain objects from being misidentified as VNodes.
- **store.ts** — `set()` with path now guards against primitive entry values (previously could silently corrupt data when the stored value was a non-object primitive).
- **vdom.ts** — stricter `resolveBinding` validates exact `type` and required properties (`value`, `children`, `tag`, `html`) to prevent arbitrary objects from being misidentified as VNodes.
- **reconcile.ts** — `patchByIndex` now guards `.remove()` with `parentNode` check to prevent `NotFoundError` when a node was already detached.
- **README.md** — fixed typo: "Immuntably" → "Immutably".

### Added
- **store** — new `store.clear()` method removes all entries and resets the store Map, preventing memory leaks in long-running SPAs with dynamic keys.
- **package.json** — added `"main": "./dist/index.js"` fallback for older bundlers/tools that don't support the `exports` field.
- 6 new tests covering text VNode rendering, `store.clear()`, `store.set()` with path on primitives, mixed keyed/unkeyed reconciliation, and text binding rendering.
- 19 new tests covering `html.raw` template (trusted markup, interpolation, null values, nested structure), `onError` lifecycle (setup/render/reconcile errors, handler args, handler throwing, multiple handlers, outside-define guard), `mount()` return value, and `update()` on disconnected elements.

### Changed
- **dom.ts** — moved `VNode` type import from bottom to top of file for conventional import ordering.
- **test/helpers/dom.mjs** — removed double `connectedCallback()` call (sync + async) that could run setup twice; now defers to next tick only.

### Changed
- **CSS split imports** — `src/styles.css` now re-exports split partials: `import "@opentf/micro-ui/styles/tokens.css"` (tokens only), `import "@opentf/micro-ui/styles/base.css"` (reset+layout), `import "@opentf/micro-ui/styles/components.css"` (components). Full bundle still `import "@opentf/micro-ui/styles.css"`. `package.json` now `exports["./styles/*"]` → `dist/styles/*`.
- **CSS layers** — all rules wrapped in `@layer micro-ui.tokens, micro-ui.base, micro-ui.components, micro-ui.utilities` so app CSS overrides without `!important` (just declare your own `@layer` after).
- **Dark mode** — tokens now include `@media (prefers-color-scheme: dark)` overrides for `--ui-background/surface/text/border`.
- **sideEffects** — `package.json` now `"sideEffects": ["*.css"]` so bundlers can tree-shake unused JS while keeping CSS opt-in.
- **Demo refactored** — all demo components now use micro-ui's own utility/component classes (`ui-btn`, `ui-card`, `ui-input`, etc.) instead of manual CSS. Removed ~110 lines of redundant custom styles from `demo/styles/app.css`.

### Added
- **E2E CSS tests** — 69 tests validating token values, base resets, component styles, utilities, layers, responsive helpers, and dark mode in `test/jsdom/styles.e2e.test.mjs`.

## [0.3.0] - 2026-08-28

### Added
- **CSS Utils** — semantic, framework-free CSS utility layer (`packages/micro-ui/src/styles.css`):
  - Layout: `ui-container`, `ui-stack`, `ui-row`, `ui-grid`, `ui-wrap`, `ui-center`, `ui-between`
  - Spacing: `ui-gap-*`, `ui-p-*`, `ui-px-*`, `ui-py-*`, `ui-mt-*`, `ui-mb-*`
  - Typography: `ui-title`, `ui-heading`, `ui-text`, `ui-muted`, `ui-label`, `ui-caption`
  - Buttons: `ui-btn`, `ui-btn-primary/secondary/ghost/danger/success`, `ui-btn-sm/lg`, `ui-btn-icon`, `ui-btn-group`
  - Forms: `ui-field`, `ui-input`, `ui-textarea`, `ui-select`, `ui-checkbox`, `ui-radio`, `ui-switch`
  - Surfaces: `ui-card`, `ui-card-flat`, `ui-card-hover`, `ui-panel`, `ui-section`
  - Feedback: `ui-badge`, `ui-alert`, `ui-progress`, `ui-spinner`, `ui-status`
  - Navigation: `ui-tabs`, `ui-tab`, `ui-breadcrumbs`, `ui-pagination`, `ui-menu`
  - Overlay: `ui-modal`, `ui-dialog`, `ui-drawer`, `ui-tooltip`, `ui-popover`
  - Components: `ui-avatar`, `ui-list`, `ui-table`, `ui-empty`, `ui-skeleton`
  - Utilities: `ui-hidden`, `ui-visible`, `ui-rounded-*`, `ui-shadow-*`, `ui-overflow-*`, `ui-relative/absolute/fixed/sticky`
  - States: `is-active`, `is-disabled`, `is-loading`, `is-invalid`, `is-dragover`
  - Dark mode via `data-theme="dark"` attribute
  - CSS custom properties for full theming support
  - Reduced-motion and print media queries
- CSS Utils demo page (`demo/src/css-utils.ts`) showcasing layout, buttons, forms, feedback, and components
- Dark mode toggle in demo app with `localStorage` persistence
- Full CSS documentation (`packages/micro-ui/docs/css-utils.md`)

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

