/**
 * `@` picker trigger (27e). A view-only plugin that detects when the caret sits
 * right after an `@query` in a text block and exposes `{ from, to, query }` so
 * the React picker (VariablePicker) can render, filter, and insert. It also
 * supports being force-opened by the Insert→Variable menu (empty query at the
 * caret) via a meta.
 *
 * This plugin does NOT insert anything and holds no catalog — the React picker
 * owns the list, keyboard, and insertion (through `insertVariableAt`). `@` is
 * the ONLY typed trigger, and it merely opens a picker (no auto-convert); typed
 * braces are never parsed.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';

export interface VariableSuggestState {
  /** Position of the `@` (menu-open: the caret). */
  from: number;
  /** Caret position (end of the query). */
  to: number;
  /** Text typed after `@` (empty for a menu-open). */
  query: string;
  /** True when opened from the menu rather than by typing `@`. */
  menu: boolean;
}

export const variableSuggestKey = new PluginKey<VariableSuggestState | null>('variableSuggest');

/** Meta to force the picker open at the caret (Insert→Variable menu). */
export const OPEN_VARIABLE_PICKER = 'openVariablePicker';

/** `@` immediately at line start or after whitespace, with a word-char query. */
const TRIGGER = /(?:^|\s)@(\w*)$/;

/**
 * Given the text before the caret in its block, return the `@`-query if the
 * caret sits in an active trigger (`@`, `@cli`, …), else null. Exported for
 * tests; the trigger requires the `@` to start a word (line start or after
 * whitespace) so mid-word `a@b` never triggers.
 */
export function matchVariableTrigger(textBefore: string): string | null {
  const m = TRIGGER.exec(textBefore);
  return m ? (m[1] ?? '') : null;
}

function detect(state: EditorState): VariableSuggestState | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if (!$from.parent.isTextblock) return null;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const query = matchVariableTrigger(textBefore);
  if (query == null) return null;
  const to = selection.from;
  const from = to - query.length - 1; // include the '@'
  return { from, to, query, menu: false };
}

export const VariableSuggest = Extension.create({
  name: 'variableSuggest',

  addProseMirrorPlugins() {
    return [
      new Plugin<VariableSuggestState | null>({
        key: variableSuggestKey,
        state: {
          init: () => null,
          apply: (tr, prev, _oldState, newState) => {
            const open = tr.getMeta(OPEN_VARIABLE_PICKER);
            if (open === true) {
              const to = newState.selection.from;
              return { from: to, to, query: '', menu: true };
            }
            if (open === false) return null;
            // A menu-open picker stays open (empty query) until the selection
            // moves; a typed picker always re-derives from the caret.
            if (prev?.menu && !tr.docChanged && !tr.selectionSet) return prev;
            return detect(newState);
          },
        },
      }),
    ];
  },
});
