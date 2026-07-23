/**
 * `variable` — an atomic inline merge-field token.
 *
 * The document stores ONLY the technical `name`; the current value lives in the
 * consumer's data layer and is resolved live at render (see VariablesContext +
 * the NodeView). Set → shows the value; unset → shows the technical name as a
 * teal-dashed chip. The token is atomic: caret treats it as one unit, a single
 * step selects the whole thing, Backspace deletes it whole, and typing over a
 * selected token replaces it. It allows marks, so bold/italic/color/size apply
 * to the token as a unit while its content stays read-only.
 *
 * Reference vs. baked value:
 *  - in-editor JSON/HTML round-trip the REFERENCE (`data-var-name`);
 *  - plain-text clipboard + DOCX/markdown export BAKE the resolved value (or the
 *    technical name when unset) — see the clipboardTextSerializer below and the
 *    export/serialize modules.
 *
 * Variables are created ONLY via `insertVariable`/`insertVariableAt` (the `@`
 * picker, the Insert→Variable menu, or the consumer button). Typed braces are
 * never parsed into variables.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Mark } from '@tiptap/pm/model';
import { VariableNodeView } from '../../components/VariableNodeView';
import type { VariableValues } from '../../types';

export type { VariableDef, VariableValues } from '../../types';

/** DataTransfer MIME carrying a variable's technical name when dragged from UI. */
export const VARIABLE_DRAG_MIME = 'application/x-docs-variable';

export interface ResolvedVariable {
  /** The value when set, else null. */
  value: string | null;
  /** What to display: the value when set, else the technical name. */
  display: string;
  unset: boolean;
}

/** Resolve a variable against the current values. Empty string counts as unset. */
export function resolveVariable(values: VariableValues | undefined, name: string): ResolvedVariable {
  const raw = values?.[name];
  const unset = raw == null || raw === '';
  return { value: unset ? null : raw!, display: unset ? name : raw!, unset };
}

/**
 * The plain text a variable bakes to on export / plain-text copy.
 *  - set → the value;
 *  - unset & `includeUnset` (default) → the `{{technical_name}}` placeholder;
 *  - unset & `includeUnset: false` → '' (the variable is omitted).
 */
export function variableBakedText(
  values: VariableValues | undefined,
  name: string,
  opts?: { includeUnset?: boolean },
): string {
  const r = resolveVariable(values, name);
  if (!r.unset) return r.value!;
  return opts?.includeUnset === false ? '' : `{{${name}}}`;
}

interface VariableStorage {
  /** Mirror of the consumer's values for the non-React paths (clipboard/export). */
  values: VariableValues;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      /** Insert a token at the current selection (replacing it). */
      insertVariable: (name: string) => ReturnType;
      /** Insert a token over an explicit range (used by the `@` picker). */
      insertVariableAt: (range: { from: number; to: number }, name: string) => ReturnType;
      /** Mirror the consumer's values onto storage (for clipboard/export). */
      setVariableValues: (values: VariableValues) => ReturnType;
    };
  }
  interface Storage {
    variable: VariableStorage;
  }
}

export const Variable = Node.create({
  name: 'variable',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,
  // Allow every mark so bold/italic/color/font-size wrap the token as a unit.
  marks: '_',

  addStorage(): VariableStorage {
    return { values: {} };
  },

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-var-name') ?? '',
        renderHTML: (attrs) => (attrs.name ? { 'data-var-name': attrs.name } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-var-name]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Reference round-trip: the name lives in `data-var-name`; the text content
    // is the technical-name fallback (values aren't available at static render,
    // and 'clean' HTML/无-JS consumers still read something meaningful).
    return [
      'span',
      mergeAttributes({ 'data-variable': '', class: 'docs-var' }, HTMLAttributes),
      `{{${node.attrs.name}}}`,
    ];
  },

  // getText() fallback (word count etc.): the technical name. The value-baking
  // paths (clipboard/export) resolve live values instead.
  renderText({ node }) {
    return node.attrs.name;
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableNodeView);
  },

  addCommands() {
    const type = this.name;
    // Build the token JSON carrying the given marks so it inherits the caret's
    // active formatting (font size, bold, color…) instead of the schema default.
    const node = (name: string, marks: readonly Mark[]) => ({
      type,
      attrs: { name },
      marks: marks.map((m) => m.toJSON()),
    });
    return {
      insertVariable:
        (name) =>
        ({ state, chain }) => {
          const marks = state.storedMarks ?? state.selection.$from.marks();
          return chain().insertContent(node(name, marks)).run();
        },
      insertVariableAt:
        (range, name) =>
        ({ state, chain }) => {
          // Marks at the insertion point (e.g. the `@query` the picker replaces).
          const marks = state.storedMarks ?? state.doc.resolve(range.from).marks();
          return chain().focus().insertContentAt(range, node(name, marks)).run();
        },
      setVariableValues:
        (values) =>
        ({ editor }) => {
          (editor.storage.variable as VariableStorage).values = values;
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const type = this.name;
    const storage = this.storage as VariableStorage;
    return [
      new Plugin({
        key: new PluginKey('variableClipboardText'),
        props: {
          // Plain-text copy bakes the resolved value (or technical name if
          // unset); everything else serializes as usual.
          clipboardTextSerializer: (slice) =>
            slice.content.textBetween(0, slice.content.size, '\n\n', (leaf) =>
              leaf.type.name === type
                ? variableBakedText(storage.values, leaf.attrs.name as string)
                : (leaf.type.spec.leafText?.(leaf) ?? ''),
            ),
          // Drag a variable from the side panel → drop a token at the caret
          // position (carrying the marks there, so it inherits font size etc.).
          handleDrop: (view, event) => {
            const name = event.dataTransfer?.getData(VARIABLE_DRAG_MIME);
            if (!name) return false; // not a variable drag → default behavior
            if (!view.editable) return true; // read-only: consume, insert nothing
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (at) {
              try {
                const $pos = view.state.doc.resolve(at.pos);
                const node = view.state.schema.nodes[type]!.create({ name }, null, $pos.marks());
                view.dispatch(view.state.tr.insert(at.pos, node).scrollIntoView());
                view.focus();
              } catch {
                /* drop landed at a non-inline position — ignore */
              }
            }
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
