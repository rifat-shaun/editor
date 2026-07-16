# Tables

Tables in `@acme/docs-editor` are built on Tiptap v2's table nodes
(`@tiptap/extension-table` + `-table-row` / `-table-cell` / `-table-header`,
driven by `prosemirror-tables`). All operations go through ProseMirror
transactions, so undo/redo and (if you add) Yjs collaboration stay consistent.

## Insert a table

Toolbar → the **table** button (in the insert group). A **10×10 grid picker**
opens; hover to choose dimensions and click to insert. Tables always insert
**with a header row** — toggle it off afterward from the table menu.

## The contextual table menu

**Right-click inside a table** to open a **vertical dropdown menu** at the
pointer, grouped into **Row / Column / Cell** sections plus a **Delete table**
footer. It dismisses on outside-click, Escape, scroll, or when the selection
leaves the table. Right-clicking inside a multi-cell selection keeps that
selection (so Merge targets it); otherwise the caret moves to the clicked cell.

- Full **keyboard navigation**: arrows / Home / End move, Enter/Space activate,
  first-letter **typeahead**, focus-trapped (`role="menu"`).
- **Header row / column** are live toggle switches and **Fill** is an inline
  swatch row — both apply immediately and keep the menu open; every other item
  runs and closes it.
- **Merge cells** is enabled only with a multi-cell selection; **Split cell**
  only when a merged cell is active. Buttons otherwise gate via `editor.can()`.
- The same actions have **global shortcuts** when the cursor is in a table
  (shown in the menu): Insert above/below `⌥⇧↑`/`⌥⇧↓`, Duplicate row `⌘D`,
  Delete row `⌥⌫`, Insert left/right `⌥⇧←`/`⌥⇧→`, Duplicate column `⌘⇧D`,
  Delete column `⌥⇧⌫`, Merge `⌘M`, Split `⌘⇧M` (Ctrl/Alt on Windows).

| Group | Actions |
| --- | --- |
| Rows | Insert above · Insert below · Delete · **Duplicate** |
| Columns | Insert left · Insert right · Delete · **Duplicate** |
| Cells | **Merge / Split** (toggle) · Toggle header row · Toggle header column |
| Alignment | Align cell content left / center / right |
| Fill | 5 background swatches + clear |
| Table | Delete table |

Cell **background color** and **vertical alignment** are stored as real cell
attributes (`backgroundColor`, `verticalAlign`) and survive
serialization/copy-paste. Text alignment uses the shared TextAlign extension on
the cell's paragraph.

## Selection & keyboard (built-in via prosemirror-tables)

| Key / gesture | Behavior |
| --- | --- |
| Click-drag across cells | Cell selection (highlighted in primary tint) |
| **Tab** / **Shift-Tab** | Move to next / previous cell |
| **Arrow keys** | Move across cell boundaries into adjacent cells |
| **Enter** | New paragraph *inside* the current cell |
| Drag a column's right edge | Resize the column (resizable is on) |

Selected cells show a translucent highlight (`.selectedCell`). The column
**resize handle** appears as a thin primary-colored bar at a column boundary.

## Styling

Table CSS lives in `src/styles.css` (adapted from
`prosemirror-tables/style/tables.css`, themed to the editor tokens). It provides
borders, header emphasis, `table-layout: fixed` with per-column widths, a
`min-width` of 48px per cell (matching `cellMinWidth`, so resizing never
collapses a cell), the selected-cell highlight, and the resize handle. Wide
tables scroll horizontally inside `.tableWrapper`.

## Drag-to-reorder rows

Hover a table and a **grip handle** appears in the left margin next to each row.
Grab it and drag up/down; a horizontal **drop indicator** shows where the row
will land, a **ghost** of the row follows the pointer, and the source row dims.
Release to drop. Dragging near the top/bottom of the viewport **autoscrolls**.

- **The move is a single ProseMirror transaction** (delete the source row +
  re-insert at the target) — never a DOM move, so the row is *moved, not
  duplicated*. A runtime guard logs an error if the row count ever changes
  across a drop, and `buildReorder` is unit-tested for the invariant.
- **Header rows are pinned**: leading all-header rows get no handle, and nothing
  can be dropped above them.
- **Rows that hold only part of a vertical merge can't be moved.** A row whose
  cells straddle a `rowspan` boundary (a merge starting above it or extending
  below) is blocked *per row*: its handle shows a not-allowed cursor, and
  attempting to grab it (or dropping another row into the merge) shows
  *"There was a problem — Sorry, it is not possible to move a row that contains
  only part of a merged cell. Please unmerge and try again."* and moves nothing.
  Clean rows in the same table still drag normally; `colspan`-only rows are
  never blocked. (Detection is `isRowMovable`/`isGapClean` in `tableReorder.ts`.)
- Dropping a row onto itself is a clean **no-op**; **undo** reverts a reorder in
  one step. Handles/indicator read **live geometry**, so they stay aligned after
  pagination shifts rows.

Implementation: `src/editor/extensions/tableRowReorder.ts` (plain-DOM overlay +
pointer-event drag, all local view state — Yjs-safe) and the pure
`src/editor/extensions/tableReorder.ts` (`rowPositions`, `buildReorder`,
`isRowMovable`, `isGapClean`; unit-tested in `tests/tableReorder.test.ts`).

## Drag-to-reorder columns

Hover a table and a **grip** appears in a gutter **above** each column. Drag
left/right; a **vertical drop indicator** shows where the column will land, a
**ghost** of the column follows the pointer, source-column cells dim, and
dragging near the table's left/right edge **autoscrolls** horizontally. (Column
handles sit on the top axis, row handles on the left, so they never fight.)

- A column is not a node, so the move **rebuilds the table with columns permuted
  in one transaction** (`reorderColumnNode` / `buildColumnReorder`, driven by
  `TableMap`) — never a DOM move. A runtime guard logs an error if the column
  count changes across a drop; unit-tested for the count-unchanged invariant.
- **Column width follows the column**: `colwidth` is a per-cell attr and cells
  move whole, so a resized column keeps its width at the new position.
- **`rowspan` cells move once** (identified by `TableMap` cell identity) and stay
  consistent across the rows they cover.
- **`colspan` (horizontal merge) blocks** *per column*, symmetrically to rows: a
  column straddling a colspan (or a drop gap inside one) shows the not-allowed
  cursor and the same error toast (*"…move a column that contains only part of a
  merged cell…"*) and moves nothing. Standalone columns in the same table still
  drag. (Detection: `isColumnMovable`/`isColumnGapClean`.)
- **Header columns are pinned** (leading all-header columns: no handle, can't
  drop before). No-op on self-drop; single **undo** reverts.

Implementation: `src/editor/extensions/tableColumnReorder.ts` (mirrors the row
plugin) + the pure `reorderColumnNode` / `isColumnMovable` / `isColumnGapClean` /
`headerColumnCount` in `tableReorder.ts`. The error toast is shared
(`tableMoveErrorToast.ts`).

## Drag handles & keyboard

Both handles use a 6-dot "drag indicator" grip (`DragDotsVertical` for rows,
`DragDotsHorizontal` for columns — `src/components/dragDots.tsx`; the plugins
inject the same SVG into their plain-DOM handles). Handles are `text-muted`,
fade in/out over 100ms on hover, turn `text-ui` on a `#eef1f3` hover chip, and
go primary (`#0e7490` on `#e0f7fa`) while dragging. They're **hidden in viewing
mode**.

**Keyboard:** each handle is focusable (`aria-label="Drag to reorder row/column"`).
**Enter/Space** picks the row/column up (drop indicator appears), **arrows** move
the target (↑/↓ for rows, ←/→ for columns), **Enter** drops, **Escape** cancels.
A blocked (merged) handle announces the same error on Enter.

## Limitations (read these)

- **Pagination — tables do not split across pages.** A table is one top-level
  block. A table shorter than the page content area paginates normally between
  blocks; a table **taller than a page overflows its page** (the same Bar A
  overflow behavior as any oversized block) rather than splitting. Splitting a
  table across page boundaries needs a heavily modified table layout (this is
  why Tiptap Pro ships a separate pagination-safe TableKit) and is **out of
  scope** here. In print/export the table is cloned whole into its page, and a
  wide table is clipped to the sheet (print can't scroll).
- **Duplicate column is best-effort.** Columns that cross **merged (spanned)
  cells** may not duplicate perfectly, and a duplicated column has no explicit
  width until you resize it. Duplicate row is exact.
- **DOCX export is not implemented** in this project. When it is, tables must
  map to Word tables with explicit column widths (in twips — Word mishandles
  percentages) and preserved colspan/rowspan; the cell `backgroundColor` /
  `verticalAlign` attributes are already modeled for that path.
- **Pasting tables** from Word / Google Docs / the web works via the standard
  HTML table parser; colspan/rowspan are preserved.
- **Row reorder across a page boundary:** because handles/indicator use live row
  geometry (which already includes the pagination page-gap), a drag that crosses
  a boundary computes the correct target; the row lands on its new page after
  pagination recomputes (the reorder transaction triggers a recompute). A
  pagination recompute *mid-drag* re-flows rows under the pointer — the target
  re-reads live geometry on the next pointer move, so it self-corrects.
- **Row reorder is disabled for `rowspan` tables** (see above) — a documented
  safety policy, not a bug.

## Under the hood

- `src/editor/extensions/table.ts` — the four node extensions, the extra cell
  attributes, and the custom `duplicateRow` / `duplicateColumn` commands
  (prosemirror-tables has no built-ins for those).
- `src/components/TableGridPicker.tsx` — the grid-size insert control.
- `src/components/TableMenu.tsx` — the contextual menu (defined at **module
  scope** so the BubbleMenu never remounts it — an inline component type would
  cause a "Maximum update depth exceeded" crash).
