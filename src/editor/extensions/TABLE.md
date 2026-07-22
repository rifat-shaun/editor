# Tables

Full table support for the editor, built on Tiptap v2's table extensions
(`prosemirror-tables` under the hood) plus bespoke additions for cell styling,
drag-to-reorder, a right-click context menu, and DOCX export.

## Files

| File | Responsibility |
|------|----------------|
| `table.ts` | Node set (`CustomTable` / `TableRow` / `CustomTableHeader` / `CustomTableCell`), extra cell attributes, `duplicateRow` / `duplicateColumn` commands, table keyboard shortcuts, and `buildTableExtensions()` |
| `tableReorder.ts` | Pure shared helpers (`headerRowCount`, `headerColumnCount`, `rowPositions`, column geometry) used by the reorder plugins + the context menu |
| `tableRowReorder.ts` | `TableRowReorder` plugin — the drag-to-reorder **row** handles (mouse + keyboard) |
| `tableColumnReorder.ts` | `TableColumnReorder` plugin — the drag-to-reorder **column** handles (mouse + keyboard) |
| `tableMoveErrorToast.ts` | The "can't move a merged cell" toast shown when a blocked reorder is attempted |
| `../../components/TableGridPicker.tsx` | Toolbar insert control (hover a 10×10 grid to choose size) |
| `../../components/TableMenu.tsx` | Right-click context menu (all actions, header toggles, cell fill) |
| `../export/docx/convert.ts` | DOCX export mapping (`convertTable`) |
| `styles.css` (`.tableWrapper`, `table`, `.selectedCell`, `.column-resize-handle`, `.pgn-rowdrag-*`, `.pgn-coldrag-*`, `.pgn-tm-*`, `.pgn-move-error-toast`) | Table + handle + menu + toast styling |

`buildTableExtensions()` (in `table.ts`) is the single entry point, added to the
editor in `extensionsList.ts`. It configures the table as `resizable`, with
`cellMinWidth: 48` (matching the CSS min-width), `lastColumnResizable`, and
`allowTableNodeSelection`.

## Inserting a table

- **Toolbar** — the table button opens `TableGridPicker`: hover the 10×10 grid to
  choose dimensions, click to insert. Always inserts with a header row (toggle it
  off afterward via the context menu).
- **Insert menu** → **Table** — inserts a default **3×3 table with a header row**
  (`insert.table`).
- **Format → Table → Insert table** — same 3×3 with header (`table.insert`).

## Editing operations

All of these are available from the right-click **context menu** (`TableMenu`)
and most from the **Format → Table** menu and **keyboard shortcuts**:

**Rows**
- Insert above / below
- Duplicate row (custom command — clones the whole row node, colspan-safe)
- Delete row

**Columns**
- Insert left / right
- Duplicate column (custom command — best-effort across merged cells)
- Delete column

**Cells**
- Merge cells (enabled only when a multi-cell selection allows it)
- Split cell (enabled only on a merged cell)
- **Fill color** — a swatch palette (`#fbe4e4`, `#ddf2e6`, `#d8eef5`, `#fdf3d0`,
  a neutral) plus a "no fill" option; sets the cell's `backgroundColor` attribute
- Text alignment inside a cell — handled by the shared `TextAlign` extension via
  the toolbar's align buttons on the cell's paragraph (not duplicated here)

**Header**
- Toggle header row
- Toggle header column

**Table**
- Delete table

**Column width**
- Drag the column borders to resize (prosemirror-tables resize handles;
  `resizable: true`). Widths persist per column in the `colwidth` attribute.

## Keyboard shortcuts

Active only while the caret is inside a table (each command returns `false`
outside one, so the binding falls through). Defined in `table.ts`:

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+↑` / `Alt+Shift+↓` | Insert row above / below |
| `Alt+Shift+←` / `Alt+Shift+→` | Insert column left / right |
| `Mod+D` | Duplicate row |
| `Mod+Shift+D` | Duplicate column |
| `Alt+Backspace` | Delete row |
| `Alt+Shift+Backspace` | Delete column |
| `Mod+M` | Merge cells |
| `Mod+Shift+M` | Split cell |

(`Mod` = ⌘ on macOS, Ctrl elsewhere.) The context menu shows these same
shortcuts next to each item.

## Drag-to-reorder rows & columns

Hovering a table reveals grip handles (`⋮⋮`): **row handles** in the left gutter,
**column handles** above each column.

- **Mouse:** drag a handle to reorder; a live insertion indicator shows where the
  row/column will land; a ghost follows the pointer.
- **Keyboard:** focus a handle, **Enter** to pick up, **arrow keys** to move,
  **Enter** to drop, **Esc** to cancel.
- **Auto-scroll:** dragging near the top/bottom edge of the scroller auto-scrolls.
- **Merged-cell guard:** a row/column that straddles a `rowspan`/`colspan` merge
  can't be moved — its handle shows a blocked state and attempting the move shows
  a dismissible error toast ("…contains only part of a merged cell. Please
  unmerge and try again."). Unmerged / colspan-only rows drag normally.
- Handles are hidden in **view (read-only) mode** and never print.

Alignment note: handles align to the table's rows/columns and track it through
scrolling and layout changes (the plugins resolve the scroll container lazily
and keep their overlay layer parented to it).

## Data model & persistence

Cells carry these attributes (beyond the prosemirror defaults):

- `colspan` / `rowspan` — merges
- `colwidth` — per-column widths (from resizing)
- `backgroundColor` — cell fill (rendered as inline `background-color` +
  `data-background-color`)
- `verticalAlign` — `middle` / `bottom` (rendered as inline `vertical-align`).
  Supported in the model, persistence, and DOCX export, but has **no dedicated
  UI control** yet — set it via `setCellAttribute('verticalAlign', …)` or preserve
  it from imported content.

All of these round-trip through the document JSON and HTML serialization, so
tables — including fills, alignments, merges, and column widths — survive
save → reload and are available to export.

## Pagination & print

- A table is a single top-level block for the pagination engine. Page breaks fall
  **between** top-level blocks, so a table shorter than a page moves wholesale to
  the next page when it doesn't fit. A table **taller than one page overflows**
  its page rather than splitting mid-table (the documented "Bar A" behavior — only
  lists have item-level breaking).
- Tables render at **100% of the content width**. A table too wide for the page
  scrolls horizontally on screen (`.tableWrapper { overflow-x: auto }`).
- Printing uses the engine's print clone, so printed tables match the on-screen
  layout, borders, fills, and header rows.

## DOCX export

`convertTable` (`export/docx/convert.ts`) maps a table to a Word table:

- **Column widths** → twips (from `colwidth`; even distribution as a fallback).
- **Merges** → `columnSpan` (colspan) and `verticalMerge: RESTART` + continuation
  cells (rowspan).
- **Cell fill** → `shading` (`ShadingType.CLEAR`, `fill` = the hex color).
- **Vertical align** → `VerticalAlign.CENTER` / `BOTTOM`.
- Table width `100%`; header rows preserved.

## Notes / caveats

- `duplicateColumn` is best-effort where a column crosses merged cells (it clones
  the cell found at the target column in each row).
- Cell text alignment reuses `TextAlign`; there's no separate per-cell text-align
  attribute.
