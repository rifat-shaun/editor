# Serialization (`src/editor/serialize`)

ProseMirror **JSON is the single source of truth** (lossless). **HTML** is the
interchange view (near-lossless). **Markdown** is the lightweight, **lossy**
view. Don't treat Markdown as lossless — the matrix below is the contract.

## API

```ts
import { serialize, deserialize, downloadAs } from './serialize';

serialize(editor, 'json' | 'html' | 'markdown', options?) → string
deserialize(editor, 'json', content)          // JSON only (export-only for html/md)
downloadAs(editor, format, title, options?)   // Blob + <a download>, title-based filename
```

- `serialize('json')` → a versioned envelope `{ type, version, doc }`.
- `serialize('html', { mode })` → `'roundtrip'` (default, self-contained) or `'clean'` (portable).
- `serialize('markdown', { htmlFallback })` → pure Markdown, or raw-HTML for unrepresentable blocks.
- Downloads: `application/json`/`.json`, `text/html`/`.html`, `text/markdown`/`.md`.

Wired to **File → Download**: Markdown (`htmlFallback: true`), HTML (`clean`). PDF
uses Print; DOCX uses the separate `export/docx` engine.

## JSON — canonical, lossless

`editor.getJSON()` is the schema verbatim, so **every** custom node/mark/attr
round-trips (list defs, table merges, line-height, spacing, page breaks,
page setup). `serialize('json')` wraps it with a `version` tag;
`deserialize('json')`:

1. reads the envelope (or a legacy bare doc → version 1),
2. runs `MIGRATIONS[v]` in sequence up to `SCHEMA_VERSION`,
3. **repairs** unknown content against the live schema (drops unknown marks,
   keeps only declared attrs, unwraps unknown node types) — never throws,
4. loads content **and** re-applies doc-level attrs (`listDefs`, `bulletDefs`,
   `pageSetup`), which `setContent` alone doesn't restore.

## HTML — interchange

`getHTML()` already emits every per-node/mark datum. Two modes:

- **roundtrip** (default): self-contained. Wrapped in `<div data-acme-doc …>`
  carrying the three out-of-tree items — the **list/bullet definition
  registries**, **pageSetup**, and the editor **font-family** — so nothing that
  is otherwise CSS-/doc-attr-only is silently lost.
- **clean**: portable semantic HTML. Keeps inline-style formatting; **strips
  internal `data-*`** attributes and the wrapper. Custom list markers / page
  geometry are not reconstructable from clean HTML.

Import is export-only here; HTML can still be **pasted** (parsed via each
node/mark's `parseHTML`).

## Markdown — lightweight, lossy (GFM)

Custom `MarkdownSerializer` (prosemirror-markdown, no new dependency). Default is
**pure Markdown** (flatten/drop per the matrix); `{ htmlFallback: true }` embeds
raw HTML for content Markdown can't express (merged tables, page breaks,
underline/color).

## Fidelity matrix

| Feature | JSON | HTML (roundtrip / clean) | Markdown (pure / htmlFallback) |
|---|---|---|---|
| Text, headings, bold/italic/strike/code | ✅ | ✅ / ✅ | ✅ |
| Links | ✅ | ✅ / ✅ | ✅ |
| Underline | ✅ | ✅ / ✅ | ❌ drop / ✅ `<u>` |
| Font size | ✅ | ✅ / ✅ (inline style) | ❌ drop / ✅ `<span>` |
| Font family (whole-doc) | ✅ | ✅ wrapper / ❌ | ❌ / ❌ |
| Text alignment | ✅ | ✅ / ✅ | ❌ / ❌ |
| Line-height, paragraph spacing | ✅ | ✅ / ✅ (inline style) | ❌ / ❌ |
| Ordered/bullet/task lists (basic) | ✅ | ✅ / ✅ | ✅ (task = GFM) |
| Composite `1.a.i`, per-level styles, custom bullets, start, restart | ✅ | ✅ id / ⚠️ id only, defs only in roundtrip wrapper | ❌ flattened to `1.`/`-` |
| Tables (simple) | ✅ | ✅ / ✅ | ✅ GFM |
| Tables (merged / widths / cell color) | ✅ | ✅ / ✅ | ❌ flattened / ✅ raw HTML |
| Page break | ✅ | ✅ / ✅ | ❌ drop / ✅ HTML div |
| Blockquote, code block, hr, image | ✅ | ✅ / ✅ | ✅ |
| List/bullet definition registries, pageSetup (doc attrs) | ✅ | ✅ roundtrip wrapper / ❌ | ❌ / ❌ |
| Comments, variables | n/a (not built) | n/a | n/a |

✅ preserved · ⚠️ partial · ❌ lost

## Adding serialization for a new node

1. **JSON**: automatic — it's the schema. Just make sure attrs have sane
   defaults (and add a `MIGRATIONS[n]` entry if you change existing shapes).
2. **HTML**: give the node/attr real `parseHTML`/`renderHTML` (emit to an
   attribute / inline style / `data-*`). If it's doc-level or CSS-only, add it
   to the roundtrip wrapper in `html.ts` — don't let it be CSS-only.
3. **Markdown**: add a rule to `nodes`/`marks` in `markdown.ts` — map it, or
   drop/flatten it (pure) with a raw-HTML fallback, and **add a matrix row**.
