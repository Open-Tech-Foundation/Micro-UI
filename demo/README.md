# demo

TypeScript and the DOM, on the [ES Runtime](https://esrun.opentechf.org) — no
framework, and nothing it ships depends on.

```sh
tsr demo         # the dev server, http://localhost:5173
tsr test:demo    # esdev test — every *.test.ts
tsr build        # the whole workspace build, demo included
```

Swap `npm` for `bun`, `pnpm` or `yarn`; nothing here depends on which you use.

## What is here

| | |
| --- | --- |
| `index.html` | The document. Its `<script>` and `<link>` are the build's inputs |
| `src/main.ts` | **Start here.** The entry, and the whole page |
| `src/page.ts` | The page's text, with a test beside it |
| `styles/app.css` | The baseline. `@import` works; esdev bundles it |

## Commands

Run everything through `tsr` from anywhere in the repo — see `tasks.toml` at
the root. There are no package.json scripts here except the site's own `build`.

| | |
| --- | --- |
| `tsr demo` | The dev server, rebuilding on save |
| `tsr test:demo` | `esdev test` — every `*.test.ts` |
| `tsr build:js` / `tsr build:js:min` | The workspace bundle, hashed and ready for any static host |
| `tsr typecheck` | `tsc --noEmit` over `packages/*`. esdev erases types and never checks them |

## Docs

[esrun.opentechf.org/docs](https://esrun.opentechf.org/docs) ·
[API](https://esrun.opentechf.org/api) ·
[GitHub](https://github.com/Open-Tech-Foundation/ES-Runtime)

Part of the [Open Tech Foundation](https://github.com/Open-Tech-Foundation)
ecosystem.
