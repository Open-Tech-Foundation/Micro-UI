# demo

TypeScript and the DOM, on the [ES Runtime](https://esrun.opentechf.org) — no
framework, and nothing it ships depends on.

```sh
npm install       # TypeScript and the runtime's types, both dev-only
npm run dev       # http://localhost:5173
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

| | |
| --- | --- |
| `npm run dev` | The dev server, rebuilding on save |
| `npm test` | `esdev test` — every `*.test.ts` |
| `npm run build` | → `dist/`, hashed and ready for any static host |
| `npm run typecheck` | `tsc --noEmit`. esdev erases types and never checks them |

## Docs

[esrun.opentechf.org/docs](https://esrun.opentechf.org/docs) ·
[API](https://esrun.opentechf.org/api) ·
[GitHub](https://github.com/Open-Tech-Foundation/ES-Runtime)

Part of the [Open Tech Foundation](https://github.com/Open-Tech-Foundation)
ecosystem.
