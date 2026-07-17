# List breaking across pages

Ordered/bullet lists may now split across a page boundary instead of jumping
whole to the next page.

## How

`collectBreakUnits` (measure.ts) descends into lists and emits **one break unit
per list item**, recursively (nested items too). `computeBreaks` treats that
finer-grained sequence exactly as it treated top-level blocks, so a list fills
the current page and continues on the next. On screen the break is a **widget
decoration** placed before an `<li>` inside the same `<ol>`; the band is
full-bleed via a depth-aware negative margin (one `--docs-list-pad` per level).

## Split policy

- **Break only between items.** The first block inside an item is glued to the
  item boundary, so a break never separates a marker from its first line.
- **Over-tall items split internally between their child blocks.** An item with
  several paragraphs (or a nested list) can break between them. A *single*
  paragraph taller than a whole page cannot be line-split by a block-decoration
  engine — it overflows its page (the pre-existing "Bar A" caveat, now per-item).
- Non-list, top-level content paginates exactly as before (no regression).

## Numbering-continuity guarantee

- **Screen:** automatic. Breaks are decorations and the `<ol>` stays a single
  node, so the CSS counters keep incrementing across the inserted widget — the
  widget `<div>` neither increments nor resets `pgnol*`. Composite
  (`1.a.i`) and nested numbering are correct across the break for free.
- **Print/PDF:** each printed page is a separate DOM subtree, so `buildPrintRoot`
  clones the list per page, trims it to that page's items (recursing into nested
  lists), and sets an inline `counter-reset: pgnol<level> <offset>` on any
  continued fragment. The offset is derived from the SAME definition the screen
  counters use (`startAt - 1 + itemsOnEarlierPages`), so numbering resumes
  (…4 | 5, 6…) and composite markers stay correct. Verified: a 44-item list
  prints as pages of 1–15, 16–40 (`counter-reset pgnol1 15`), 41–44
  (`counter-reset pgnol1 40`).

## Known limitation

When a break falls *inside a nested list whose parent item's head is on the
previous page*, the continued print fragment keeps the parent `<li>` (so its
counter stays correct) but its head text is trimmed — the parent's marker can
appear once more, empty, atop the continued nested items. Rare; screen is
unaffected. Continue-across-separate-lists is still governed by the numbering
system's deferred flag, unrelated to this within-list splitting.
