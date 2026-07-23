# Variables (merge fields)

Atomic inline tokens that store a technical `name` and render the **current
value** when set, or the **technical name** (as a teal-dashed chip) when unset.
They read like normal text, behave as a single unit, and are inserted via the
`@` picker, the Insert → Variable menu, or a consumer button. Values and the
insertable catalog come from the consuming app.

## Files

| File | Role |
| --- | --- |
| `variable.ts` | The `variable` node (atom, inline), `insertVariable`/`insertVariableAt`/`setVariableValues` commands, `resolveVariable`/`variableBakedText`, and the plain-text clipboard serializer. |
| `../../components/VariableNodeView.tsx` | React NodeView — renders value/chip, reactive to values. |
| `variableSuggest.ts` | `@` trigger detection (exposes `{ from, to, query }`); force-open meta for the menu. |
| `../../components/VariablePicker.tsx` | The `@` picker UI (27e). |
| `variableHighlight.ts` | The View → Highlight variables toggle (view-only). |
| `../variablesContext.tsx` | React context feeding the catalog + values to the NodeView and picker. |

## Consumer API

`<DocsEditor>` props + a `ref` handle:

```tsx
import { useRef } from 'react';
import { DocsEditor, type DocsEditorHandle, type VariableDef, type VariableValues } from '@acme/docs-editor';

const CATALOG: VariableDef[] = [
  { name: 'client_name', label: 'Client name' },
  { name: 'closing_date', label: 'Closing date' },
];

function Host() {
  const ref = useRef<DocsEditorHandle>(null);
  const [values, setValues] = useState<VariableValues>({ client_name: 'Meridian Health Partners', closing_date: null });

  return (
    <>
      <DocsEditor
        ref={ref}
        initialContent={doc}
        mode="editing"
        onSave={save}
        variableList={CATALOG}
        variableValues={values}   // reactive: change it → every token re-renders
      />
      {/* consumer button → same insert command as the @ picker / menu */}
      <button onClick={() => ref.current?.insertVariable('client_name')}>Insert client name</button>
    </>
  );
}
```

- **`variableList`** — the insertable variables for the `@` picker / menu. Each needs `name` + `label` (`group?` optional).
- **`variableValues`** — values keyed by technical name, passed **reactively**. A `null`/absent entry renders as an unset chip. Changing the object re-renders every token.
- **`ref.insertVariable(name)`** — inserts a token at the current (persisted) selection and refocuses. Because clicking a consumer button blurs the editor, the token lands at the last caret position. Same command the picker and menu use — there is one insertion path.

## Resolution & fallback

`resolveVariable(values, name)` →

- value present → display the **value**;
- `null` / absent / empty string → **unset**: display the technical name as a teal-dashed monospace chip (`{{ name }}`).

The braces are display formatting only — never stored, never a typed syntax.

## Highlight toggle (View → Highlight variables)

- **On** (default): resolved tokens get a light-teal tint + a **dotted** underline (distinct from the link mark's **solid** underline).
- **Off**: resolved tokens render as plain, print-faithful text; hover or caret-select briefly reveals the tint.
- Unset tokens **always** show the chip, regardless of the toggle.

It is a **per-user view preference** persisted to `localStorage` — **not** saved into the document (same pattern as Show ruler / Show non-printing characters). No keyboard accelerator is bound (⇧⌘V is taken by Paste-without-formatting).

## No literal-brace parsing

Typed braces (`{`, `{{ }}`) are **never** converted to variables — they stay literal text forever. `@` is the **only** typed trigger, and it opens a *picker* (no auto-convert). The `{ }` menu glyph and the `{{ name }}` chips are display only.

## Serialization & export

| Path | Behavior |
| --- | --- |
| In-editor JSON (`getJSON`) | **Reference** — `{ type: 'variable', attrs: { name } }`. Value is not baked. |
| HTML round-trip (`getHTML`) | **Reference** — `data-var-name`. Re-parses back to a token. |
| DOCX / PDF export | **Baked** — the resolved value (or technical name if unset). |
| Plain-text copy (to another app) | **Baked** — resolved value/name. In-editor copy/paste keeps the reference. |
| Markdown export | **Baked** — resolved value/name. |

Export/clipboard read values from `editor.storage.variable.values`, mirrored from
the `variableValues` prop (`setVariableValues`) — values are never in the doc.
Highlight state is not serialized.

## Atomic behavior

Caret treats a token as one unit (←/→ land before/after, never inside); a single
step selects the whole token; Backspace/Delete removes it whole; typing over a
selected token replaces it; copy/paste carries the reference in-editor. The node
allows marks, so bold/italic/color/size apply to the token as a unit while its
value/name content stays read-only.
