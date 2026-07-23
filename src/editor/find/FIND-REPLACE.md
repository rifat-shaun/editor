# Find & Replace

A sidebar Find & Replace (mockup 29): type a query → all matches highlight with a
live "X of N" count → navigate → replace one or all. Highlights are view-only
decorations; they never enter the document, export, or print.

## Files

| File | Role |
| --- | --- |
| `findMatches.ts` | Pure search: walk text blocks → match ranges + preview parts + `replaceable` flag. |
| `findPlugin.ts` | `FindReplace` Tiptap extension: plugin state (query/options/index/matches), decorations, and the `setFind` / `replaceFindCurrent` / `replaceFindAll` / `clearFind` commands. `getFindState(editor)` reads state for the panel. |
| `../../components/FindPanel.tsx` | The sidebar UI (in the ToolRail's "Find & replace" panel). |

## Options

- **Match case (`Aa`)** — off by default; case-insensitive matching.
- **Whole word (`ab`)** — off by default; a match is rejected if a letter/number/`_`
  sits immediately before or after it (so `Party` doesn't match `Parties` or
  `counterparty`).
- Queries are matched **literally** — special characters are escaped (no regex),
  so `(a)` finds `(a)`. Multi-word phrases (`Disclosing Party`) match as a unit.

## Scope

- Searches all editable text: paragraphs, headings, **table cells**, **list
  items**, nested content. Matches never cross a block boundary.
- **Headers/footers:** NOT searched — they're pagination decorations derived from
  the title / page number, not editable document content.
- **Variables:** the token's **resolved value** is searchable (you find what you
  see). A match that overlaps a token is flagged **not replaceable** — it still
  highlights, counts, and navigates, but Replace / Replace-all skip it (you can't
  edit inside an atomic token).

## Replace

- **Replace** (current): replaces the current match, then the re-search advances
  to the next match. One undo step. Disabled when the current match is inside a
  token, or in view mode.
- **Replace all**: replaces every replaceable match in **one undo step**,
  right-to-left over the **original** match set — so a replacement that contains
  the query (find `cat` → replace `ccat`) is **not** recursively re-replaced.
- **Empty replacement** deletes the matches.
- **Formatting policy:** replacement text inherits the marks at the match start
  (the leading run) via `insertText`; deletion uses `delete`. A match spanning a
  formatting boundary (part bold) becomes a single run with the leading run's
  marks — never broken formatting.

## Live re-search & position integrity

Matches recompute (debounced ~180ms) on query/option changes **and** on every
document change (user edits or the replace itself) — positions are never reused
stale. The current index is clamped to the live match set.

## Modes

The editor has **editing** / **viewing** (no suggesting mode). Search works in
both. In viewing, Replace / Replace-all are disabled in the UI, and
`ReadOnlyGuard` blocks the mutation as a backstop.

## Keyboard & open/close

- **⌘F / Ctrl+F** (or **Edit → Find & replace**) opens the panel, focuses the
  find field, and pre-fills the current selection.
- **Enter** = next match, **Shift+Enter** = previous (both wrap around).
- **Esc** closes the panel; closing clears all highlights.
- The current match scrolls into view (onto the correct page when pagination has
  split content) and the results list syncs to it.

## Results list

Each row is a **preview snippet** (block text around the match, ellipsized, with
the matched term emphasized); the current row is highlighted and clicking a row
jumps to that match. (No section reference — preview only.)

## Diacritics / case folding

Matching is by code point: `é` ≠ `e`. Case-insensitive matching uses the
JavaScript `i` flag (ASCII + Unicode simple case folding); locale-specific
folding (e.g. Turkish `i`) is not special-cased.
