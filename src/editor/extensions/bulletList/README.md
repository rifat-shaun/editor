# Bullet-list marker system

Custom per-level bullet markers (disc / circle / square / dash / arrow / custom
glyph / none, with optional color + size), mirroring the ordered-list numbering
system. Native `<ul>` only supports disc/circle/square via `list-style-type` and
CSS-only styling doesn't round-trip — so, like ordered lists, the marker
configuration lives in the document model and drives generated CSS.

## Not task lists

This is for **visual** bullet lists (`<ul>` / BulletList). Task/checkbox lists
are a separate Tiptap node (TaskList/TaskItem) with their own interactive
semantics and are **not** covered here. A `✓` is available only as a **Custom
glyph** (a visual marker), never an interactive checkbox.

## Data model

```ts
type MarkerStyle = 'disc' | 'circle' | 'square' | 'dash' | 'arrow' | 'custom' | 'none';
interface BulletLevelConfig { markerStyle; customMarker?; color?; size?; }
type BulletDefinition = BulletLevelConfig[];   // index = bullet-nesting depth, up to 9
```

No start-at, separator, parent-inclusion, or restart — those are ordered-only.

**Storage** (identical pattern to ordered): a `bulletDefs` registry on the
Document node (id → definition), each `<ul>` carrying a `bulletDefId`. A list's
LEVEL is its nesting depth among **bullet** lists (counted independently of
ordered lists, so mixed nesting is correct). Persists through `getJSON`;
`parseHTML`/`renderHTML` emit `data-bullet-def-id` so the id round-trips in HTML.

## Rendering (`bulletCss.ts`)

Scoped by `[data-bullet-def="id"][data-bullet-level="d"]`:
- `disc / circle / square` → native `list-style-type` (`::marker`), color/size via `::marker`.
- `dash / arrow / custom` → `list-style: none` + an absolutely-positioned `li::before` glyph.
- `none` → `list-style: none` (indent preserved).

Markers scale with the item's own font size via the shared `--pgn-marker-size`
var, and print (`print-color-adjust: exact`).

## Presets

`classic` (disc/circle/square) · `dash` · `arrow` (→ / – / disc) ·
`squareFirst` · `large` (bigger disc) · `none`. Selecting one applies it to the
list at the cursor. Deep levels beyond 3 cycle the last three.

### Adding a preset
Add to `BULLET_PRESETS` in `model.ts` (id + `levels`), then add a matching card
id to `BULLET_PRESETS`-driven grid in `components/BulletListStylePicker.tsx`
(cards render straight from the model, so usually nothing else is needed).

## Commands
`applyBulletPreset` · `applyBulletDefinition` · `setBulletLevelMarker` ·
`setBulletLevelCustomMarker` · `setBulletLevelColor` · `setBulletLevelSize` ·
`addBulletListLevel` · `resetBulletListLevel` — all guarded to a bullet list
(`editor.can()` false otherwise). `getActiveBulletInfo(editor)` feeds the UI.

## Shared with the ordered-list system (not forked)
- **The list plugin** (on the Document node) renders BOTH: one decoration walk
  tags ol *and* ul; one injected `<style>` concatenates ordered + bullet CSS.
- **Page splitting** — bullet lists already fill-and-continue across pages and
  print-trim via the same `LIST_TYPES` break logic (no numbering continuity to
  worry about; item integrity still applies).
- **Spacing** — the generic `li` / `li > p` rules apply to both.
- **Hashing** (`jsonHash`), the **popover shell** (`AnchoredPopover`), and the
  **marker-size-follows-content** var are shared.

Bullet-specific: the `BulletDefinition` model, `bulletCss.ts`, `CustomBulletList`
+ commands, presets, and the simplified customize panel.

## Persistence / export limitations
- **JSON**: full round-trip (registry on the doc attr) — verified by test.
- **HTML export**: carries `data-bullet-def-id`; the definition itself rides in
  JSON (same as ordered).
- **DOCX**: `docxNumbering.ts` maps bullets to Word `w:numFmt="bullet"` with the
  glyph as `w:lvlText` (disc/circle/square → conventional Word bullet chars).
  **Custom emoji glyphs map best-effort** — Word renders bullet glyphs with a
  run font, which is limited for pictographic characters. No full DOCX exporter
  exists yet; this is the mapping module, ready to plug in.
