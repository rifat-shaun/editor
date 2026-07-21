# Word-style ruler

A horizontal measurement bar above the page. It's a custom UI layer (not a PM
node): a live visualization of the page geometry + the caret paragraph's
indents.

## Visibility — bound to View → Show ruler

Single source of truth: `showRuler` in the editor context (`context.tsx`),
persisted to `localStorage` (`docs-editor:ruler-visible`) and initialized from
it on load.

- The menu item `view.showRuler` (`menuitemcheckbox`) reads it: `isChecked =
  ui.showRuler`, `run = ui.toggleRuler()`.
- The `Ruler` component mounts/renders from the same `ui.showRuler`.

So the checkmark always matches actual visibility, and toggling shows/hides
immediately with no drift. `Ruler` returns `null` when off (no layout shift).

## Alignment & units

Reads the pagination engine's live CSS vars on `.docs-page-content`:
`--pgn-page-width` (unzoomed px), `--pgn-ml`, `--pgn-mr`. The **zoom scale** is
derived by measuring the page's actual width ÷ the unzoomed `--pgn-page-width`,
so the ruler stays aligned at any zoom without reading the zoom value directly.
Re-measures on scroll, resize, `ResizeObserver`, and selection/transaction.

**Conversion** (`rulerUnits.ts`, the single source): base unit is CSS px @96dpi
— the same unit as page geometry and indent attributes.

```
1 inch = 96px = 1440 twips   (→ ×15 for DOCX)
1 cm   = 96/2.54 px
screen px = unzoomed px × scale(zoom)
```

Unit is toggleable (in ↔ cm), persisted (`docs-editor:ruler-unit`). Switching
re-labels ticks/readouts only — it never moves the actual indents.

## Indent attributes (added)

`Indent` extension (`extensions/indent.ts`) adds three global attrs to
`paragraph` + `heading`, in px, with `parseHTML`/`renderHTML`:

| attr | CSS | ruler marker |
|---|---|---|
| `indentLeft` | `margin-left` | left rectangle + hanging triangle |
| `indentRight` | `margin-right` | right triangle |
| `indentFirstLine` | `text-indent` (signed) | first-line triangle (+); hanging (−) |

Markers **read** reactively at the caret (`indentSelection.ts`; mixed selection
→ first block's values as a representative) and **write** on drag via
`setParagraphIndent(...)` — the **same** command the Align & indent menu uses
(`align.indent`/`align.outdent` = `indentMore`/`indentLess`, 0.5in step). Drag
converts screen delta ÷ scale → px; keyboard ←/→ nudges by 1/16".

## DOCX export

`export/docx/convert.ts` maps the attrs to Word paragraph `indent` twips
(1px = 15tw): `indentLeft→left`, `indentRight→right`, `indentFirstLine` > 0 →
`firstLine`, < 0 → `hanging`. So 1 inch on the ruler = 1440 twips.

## Deferred

- **Draggable margins** — margin regions are shown as non-interactive shading;
  edit margins via **Page Setup**. (Wiring drag → `updateMargins` + repaginate is
  a later phase.)
- **Tab stops** — no native PM support; a separate sub-project.

## Accessibility

Markers are `role="slider"` with labels + `aria-valuetext` and ←/→ nudge.
Indents are fully achievable without the ruler via Format → Align & indent.
