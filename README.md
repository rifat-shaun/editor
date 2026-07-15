# @acme/docs-editor

A Google-Docs-style document editor for legal/business documents, with an
**AI edit** feature that proposes changes as **tracked redlines** you accept or
reject — individually or all at once. Nothing is applied to the document until
you accept.

Built with **Vite** (library mode) · **TypeScript** (strict) · **Tailwind CSS
v4** · **Tiptap 2 / ProseMirror** · **React 18**.

## Install

```bash
npm install @acme/docs-editor
```

```tsx
import { DocsEditor } from '@acme/docs-editor';
import '@acme/docs-editor/styles.css';

<DocsEditor
  initialContent={content}       // Tiptap JSONContent
  mode="editing"                 // 'editing' | 'suggesting' | 'viewing'
  title="Mutual NDA"
  onSave={(json) => save(json)}
  aiProvider={aiProvider}        // streams ProposedChange objects
/>;
```

### `aiProvider`

```ts
interface AiProvider {
  proposeEdits(input: {
    scope: 'selection' | 'section' | 'document';
    instruction: string;
    text: string;
  }): AsyncIterable<ProposedChange>;
}

interface ProposedChange {
  id: string;
  anchor: { from: number; to: number }; // ProseMirror positions
  deletion?: string;
  insertion?: string;
  rationale: string;
  sectionRef?: string; // e.g. "§3.3"
}
```

Changes stream in; each is rendered as a redline (strikethrough deletion /
underlined insertion) with a suggestion card anchored beside it.

### `useEditorState()`

Read editor + AI review state from inside `<DocsEditor>`:

```tsx
const { editor, mode, wordCount, outline, ai } = useEditorState();
ai.accept(id); ai.reject(id); ai.acceptAllRemaining(); ai.undoLast();
```

## AI edit flow

`idle → invoking → generating → reviewing → resolved`

- **Invoke** from the toolbar `✦ AI edit ▾` menu or the selection floating
  toolbar; pick a preset or write a custom instruction (⌘K).
- **Generating** streams redlines in with a cancellable progress toast.
- **Reviewing** shows per-change cards, a progress bar, and
  Accept-all / Reject-all. Every accept/reject is undoable (⌘Z).
- **Resolved** records the session as a named version.

## Keyboard

| Key | Action |
| --- | --- |
| ⌘K | Open AI prompt |
| ⌘Z | Undo (including accept/reject) |
| ↑ / ↓ | Navigate pending changes (while reviewing) |
| Enter / Backspace | Accept / reject the focused change |
| Esc | Dismiss any popover/menu |

## Development

```bash
npm run dev        # /demo app (sample NDA + mock AI provider)
npm test           # Vitest unit + integration tests
npm run lint       # ESLint (0 warnings)
npm run typecheck  # tsc --noEmit
npm run build      # library build -> dist/ (+ .d.ts)
```

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/editor/changeRegistry.ts` | Framework-agnostic change store: status, undo history, position remapping, navigation |
| `src/editor/extensions/redline.ts` | Tiptap `insertion` / `deletion` marks |
| `src/editor/extensions/spotlight.ts` | Decoration plugin for the active/spotlit change |
| `src/editor/redlineOps.ts` | Apply a change as marks; resolve (accept/reject) to clean text |
| `src/editor/useAiSession.ts` | The `idle→…→resolved` state machine + streaming orchestration |
| `src/lib/scope.ts` | Selection / section / document scope resolution |
| `src/components/*` | Top bar, toolbar, outline, suggestion column, tool rail, status bar, popovers, toasts |

The chrome is responsive: the outline panel collapses (and overlays, on narrow
viewports) via a toolbar toggle, and the formatting toolbar measures its groups
and collapses the lowest-priority ones into a portaled **"⋯ More"** menu when
space runs out — AI edit stays docked at all widths.

Redlines never mutate the "clean" document until accepted: applying a change
*marks* text (and inserts new text with a mark); accept/reject then resolves
those marks to final prose via an undoable transaction. Positions are remapped
through every ProseMirror transaction so cards and spotlights stay attached.
