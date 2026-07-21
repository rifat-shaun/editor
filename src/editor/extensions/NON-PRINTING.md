# Non-printing characters (`nonPrinting.ts`)

Word's "show formatting marks". When on, normally-invisible characters render as
subtle gray glyphs. **View-only** — never document content.

## Marks shown

| Glyph | Where | How |
|---|---|---|
| `¶` | end of every paragraph / heading | CSS `::after` via the `.docs-show-formatting` root class |
| `·` | each space | inline decoration `.npc-sp` |
| `°` | each non-breaking space | inline decoration `.npc-nbsp` |
| `→` | each tab (`\t`) | inline decoration `.npc-tab` |
| `↵` | hard/line breaks | widget decoration `.npc-break` |

Page/section breaks are intentionally **not** marked — the pagination UI already
shows them.

## Toggle binding (single source of truth)

The View → Show non-printing characters menu item (`view.showNonPrinting`,
`menuitemcheckbox`) is the only control:

- `run` → `editor.commands.toggleNonPrinting()`.
- `isChecked` → `isNonPrintingEnabled(editor)` (reads the plugin state).

The plugin state's `enabled` flag is the source of truth. On toggle it: persists
to `localStorage` (`docs-editor:show-formatting`), flips the flag via a
history-less meta transaction, rebuilds the decorations, and syncs the
`.docs-show-formatting` class onto the editor DOM. Initialized from the
persisted value on load.

## View-only / non-exporting (verified)

- Decorations and CSS generated content are **not** in `getJSON()` / `getHTML()`
  → never reach DOCX/Markdown export.
- Glyphs are `user-select: none` / `pointer-events: none` — not selectable,
  copyable, or deletable; the caret behaves as if they're absent.
- **Print**: the print layout clones the live DOM, so an `@media print` rule in
  `styles.css` hides every glyph (`::after` pilcrow + `.npc-*`).

## Performance

Decorations rebuild in a single pass over the doc on enable and on each doc
change (only while enabled). Efficient for typical documents; disabled → no
decorations at all.
