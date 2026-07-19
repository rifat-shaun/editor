# DOCX export

Exports the editor's content to a Word `.docx` using **docx-js** (`docx`). Driven
entirely by `editor.getJSON()` (ProseMirror JSON) — never the rendered DOM — so
custom-node attributes (list definitions, table spans, redlines) survive.

## Pipeline

`editor.getJSON()` → `convertBody` (traversal + converters) → `buildDocument`
(styles, section, header/footer, numbering config) → `Packer.toBlob` →
`<a download>`. Entry points in `index.ts`:

- `downloadDocx(editor, filename, opts)` — build + trigger a browser download.
- `exportDocxBlob(json, opts)` / `exportDocxBuffer(json, opts)` — Blob / Buffer.

The TopBar "Word" button calls `downloadDocx` with a loading state.

## What's supported

- **Blocks**: paragraph, heading 1–4, blockquote (Quote style + left border),
  horizontal rule, code block (monospace + shading), hard break.
- **Marks → run props**: bold, italic, strike, underline, `code` (Courier),
  link (`ExternalHyperlink`), `textStyle.fontSize` (→ half-points).
- **Redlines → native tracked changes**: `insertion` → `InsertedTextRun`
  (`w:ins`), `deletion` → `DeletedTextRun` (`w:del`/`w:delText`), author
  "AI review"; the document opens with track-changes on so they can be
  accepted/rejected.
- **Lists** (`numbering.ts`, the crux): each editor list definition → a docx
  numbering config. Number style → `LevelFormat` (DECIMAL / DECIMAL_ZERO /
  LOWER|UPPER_LETTER / LOWER|UPPER_ROMAN), separator → the `%1.`/`%1)` template,
  `startAt` → level start, and **parent-inclusive composites → multilevel
  templates** (`%1.%2.%3.`). Bullets → `LevelFormat.BULLET` + glyph (+ color).
  Nesting depth → `level`. One `reference` per top-level list occurrence, so
  lists restart independently (matching the editor).
- **Tables** (`convert.ts`): column widths (px → DXA), `colspan` → `gridSpan`,
  `rowspan` → `VerticalMergeType.RESTART`/`CONTINUE` (grid reconstructed from
  JSON so merges are exact), header rows → `tableHeader`, cell background →
  shading, vertical align.
- **Task lists**: exported as indented paragraphs prefixed with ☐/☑ (visual, not
  interactive — Word checkboxes are content controls, out of scope).
- **Page break**: the `pageBreak` node → `new Paragraph({ children: [new PageBreak()] })`.
- **Fonts** (`fontTheme.ts`, single source of truth): see below.
- **Styles / section**: default run + heading styles from the font theme; the
  page size + margins come from the **live pagination settings** (A4 exports as
  A4), with a Letter/1″ fallback; running header (title) + footer page-number
  field (`opts.includeHeaderFooter`).

## Fonts (the reported-mismatch fix)

The editor's fonts live in **CSS**, not in `getJSON()`, so the exporter can't
read them and previously fell back to Calibri 11pt. `fontTheme.ts` is the single
source of truth (mirror it if `styles.css` changes):

- **Size convention (points, end-to-end)**: the editor is **points-native** like
  Word — the toolbar shows pt, `fontSize` marks are stored as `"<n>pt"`, and the
  CSS renders in pt (`12pt = 16px @96dpi`). **Every** exported size — body,
  headings, inline marks — goes through the single `fontSizeToHalfPoints` helper
  (`units.ts`), which passes points **1:1** to half-points (× 2). So the editor
  number = Word number = same physical size. The only px that appears is in
  **imported** content (pasted Word/web); those `"…px"` marks are treated as
  visual-parity (px × 0.75 → pt). One helper, one code path — no drift.
- **Body**: Georgia @ 12pt (16px). **Headings**: Georgia bold — h1 21pt, h2 18pt,
  h3 15pt, h4 12pt. **Code**: Courier New. These set the docx default run + the
  `Heading1..6` styles, so unstyled text matches the editor.
- **Font choice**: the toolbar Font `<select>` sets a whole-editor DOM style
  (not in JSON); `downloadDocx` reads `view.dom.style.fontFamily` and resolves it
  to the body font, so the user's choice exports.
- **Per-run size**: `textStyle.fontSize` marks map to half-points.
- **Substitution**: `resolveWordFont` maps any CSS font/stack to ONE Word name
  (Georgia/Times New Roman/Arial pass through; `system-ui`→Calibri, and web
  fonts like Roboto/Inter→Arial/Calibri). This editor ships **no** web fonts, so
  no font **embedding** is needed. If a future theme uses a web font and
  pixel-identical rendering is required, embedding is possible only via
  post-Packer OOXML surgery (unzip → add font parts + rels → re-zip) **and** only
  if the font license permits — not implemented.
- **Weight**: DOCX runs are bold or not; CSS weight ≥600 collapses to **bold**
  (semibold/medium are lost). Italic/bold/bold+italic use the base family + flags.

## Known lossy points / caveats

- **Pagination**: on-screen pagination is decoration-based, NOT in `getJSON()`, so
  it can't export — Word re-flows. Only the explicit `pageBreak` node produces a
  hard break (and it currently marks the spot on screen without forcing the
  on-screen auto-paginator to break there — a separate engine change).
- **Images**: **deferred** — no image node in the schema. When one is added,
  register an `ImageRun` converter (base64 → `Uint8Array`; remote → `fetch` to
  binary first; all async must resolve before `Packer`).
- **Interactive Word checkboxes**: **deferred** — task lists render ☐/☑ glyphs.
- **Block-level tracked changes**: out of scope — the redline marks are inline
  only, so the editor can't produce a whole inserted/deleted block.
- **Mixed ordered/bullet nesting**: a nested list of the *other* type gets its
  own numbering reference (correct format + indent); numbering restarts in that
  sub-branch. Homogeneous trees (incl. composite `1.a.i`) are exact.
- **Absent editor features** (not gaps — the schema has no such marks): text
  highlight, super/subscript, and text color aren't in the editor, so they aren't
  exported. Paragraph spacing/indent aren't per-node attributes; spacing is set
  at the style level to match the editor (line-height 1.85, 16px after).

## Numbering restart / continue

Each top-level list gets its own numbering reference, so separate lists restart
independently (matching the editor). An explicit `start` on an ordered list (set
by the Restart-numbering command) overrides level-0's start. Continue-numbering
across separate lists is a **deferred editor feature**, so there's nothing to
carry.

## Mandatory manual gate (not automatable here)

Opening the file in Microsoft Word, Google Docs, and LibreOffice is the real
sign-off and **could not be run in this environment**. As the strongest
automated proxies the tests assert: XML well-formedness of **every** OOXML part,
and that **every numbering reference resolves** (no dangling refs — the usual
cause of a "repair" prompt). A ready-to-open sample exercising composite
`1.a.i`, a merged-cell table, all heading levels, mixed fonts, and a page break
is generated at `scratchpad/sample-corpus.docx` — please open it in the three
apps to complete the gate.

## Extending

- **New node type**: add an entry to `NODE_CONVERTERS` in `convert.ts` returning
  `(Paragraph | Table)[]` (or `[]` to skip).
- **New list style**: it flows automatically from the list definition via
  `ooxmlNumFmt` / `ooxmlLevelText` (ordered) or `ooxmlBulletText` (bullet) in
  `listNumbering/docxNumbering.ts`; add the `NumberStyle`/`MarkerStyle` there and
  in `levelFormatFor` if it's a genuinely new format.

Tests: `tests/docxExport.test.ts` (numbering mapping incl. composite, colspan/
rowspan, tracked changes, bullet glyph, and XML well-formedness of every part).
