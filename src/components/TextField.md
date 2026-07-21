# TextField

The one canonical text input for the editor app. It normalizes height and
appearance across every text field so they no longer drift. **Text inputs
only** — do not use it for textareas, selects, toggles, `range`/`color` inputs,
or the borderless inputs embedded inside composed widgets (`Select`, `Menu`).

## Why it exists

Text fields used to be scattered one-offs with different padding, font sizes,
borders and height sources (some sized by vertical padding, some by
`line-height` only, some by an explicit `height`), so the same visual "field"
rendered anywhere from ~22px to 34px tall. `TextField` gives one height per size
variant everywhere.

## Canonical spec

Styling lives in `styles.css` under `.ui-field`. A presentational wrapper owns
the border, background and a **fixed height**; the real `<input>` is transparent
and fills it. Because height + `box-sizing: border-box` live only on the
wrapper, **border, padding, a leading icon and a trailing suffix never change
the height.**

| Token | `sm` | `md` (default) | `lg` |
|-------|------|----------------|------|
| Height | 28px | **34px** | 40px |
| Padding-x | 8px | 10px | 12px |
| Font size | 12px | 13px | 14px |
| Radius | 6px | 7px | 8px |

Shared across sizes (all from existing design tokens):

- **Font**: system-ui stack. **Text**: `--color-ink`. **Placeholder**: `--ui-faint`.
- **Border**: 1px `--ui-border-strong`. **Background**: `--ui-surface`.
- **Focus**: border `--color-primary` + 1px primary ring (`:focus-within`).
- **Disabled**: `--ui-surface-2` bg, `--ui-disabled` text, `not-allowed`.
- **Error**: `--ui-danger-border` / `--ui-danger-field`, and `aria-invalid`.
- Dark mode and RTL come free (tokens + no physical-direction assumptions).

## When to use each size

- `md` — **default**. Dialog fields, side-panel fields, the title rename field.
  Every current instance uses this.
- `sm` — compact/dense spots where a 34px field is too tall.
- `lg` — prominent single fields (e.g. a large primary search).

## API

```tsx
<TextField
  size="sm" | "md" | "lg"        // default "md"
  type="text" | "search" | "url" | "email" | "tel" | "password"  // text-like only
  error={boolean}                 // danger styling + aria-invalid
  errorMessage="…"                // optional message under the field (aria-describedby)
  icon={<…/>}                     // leading adornment; never affects height
  suffix=".pdf"                   // trailing adornment; never affects height
  fullWidth={boolean}             // default true; false = size to content
  className="w-64"                // WRAPPER — width/layout only, never height/padding
  inputClassName="text-center"    // the <input> — e.g. alignment, font-weight
  ref={inputRef}                  // forwarded to the <input>
  {...nativeProps}                // value, onChange, onBlur, onKeyDown, onMouseDown,
                                  // name, inputMode, maxLength, aria-*, … all spread
/>
```

It is **presentational** — it bakes in no business logic. Callers keep their own
`value`/`onChange`/validation, and every native prop is spread straight onto the
`<input>`, so existing behavior (keyboard handling, focus, and toolbar
selection-preservation `onMouseDown` handlers) passes through unchanged.

## Rules

- No inline `height`/`padding` on individual inputs — the variant is the height.
- `className` targets the wrapper (use for width); `inputClassName` targets the
  input (alignment, weight). Neither should override height or padding.
- Keep it to text inputs; leave the composed-widget internals alone.
