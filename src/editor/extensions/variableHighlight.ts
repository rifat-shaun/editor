/**
 * "Highlight variables" — a VIEW-ONLY preference (27a on / 27b off · 27c menu),
 * modeled exactly on NonPrinting.
 *
 * ON  (27a): resolved tokens get a light-teal tint + dotted underline.
 * OFF (27b): tokens render as plain text (print-faithful); hover / caret-select
 *            temporarily reveals the tint. Unset tokens ALWAYS keep the chip.
 *
 * One source of truth: the plugin state's `enabled` flag, persisted to
 * localStorage and mirrored to the `.docs-highlight-variables` class on the
 * editor DOM (all the on/off styling is CSS keyed off that class). It is a
 * per-user preference — NOT serialized into the document. The View menu reads
 * it via `isVariableHighlightEnabled`; `toggleVariableHighlight` flips it.
 */
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';

const KEY = new PluginKey<{ enabled: boolean }>('variableHighlight');
const STORAGE_KEY = 'docs-editor:highlight-variables';
const ROOT_CLASS = 'docs-highlight-variables';

function readPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw == null ? true : raw === 'true'; // default ON (27a)
  } catch {
    return true;
  }
}
function writePref(v: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* ignore (private mode / SSR) */
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variableHighlight: {
      toggleVariableHighlight: () => ReturnType;
    };
  }
}

/** Whether variable highlighting is currently shown. */
export function isVariableHighlightEnabled(editor: Editor): boolean {
  return KEY.getState(editor.state)?.enabled ?? true;
}

export const VariableHighlight = Extension.create({
  name: 'variableHighlight',

  addCommands() {
    return {
      toggleVariableHighlight:
        () =>
        ({ state, dispatch }) => {
          const next = !(KEY.getState(state)?.enabled ?? true);
          writePref(next);
          if (dispatch) dispatch(state.tr.setMeta(KEY, next).setMeta('addToHistory', false));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<{ enabled: boolean }>({
        key: KEY,
        state: {
          init: (_config, _state: EditorState) => ({ enabled: readPref() }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(KEY);
            return typeof meta === 'boolean' ? { enabled: meta } : prev;
          },
        },
        view: (view) => {
          const sync = () => view.dom.classList.toggle(ROOT_CLASS, KEY.getState(view.state)?.enabled ?? true);
          sync();
          return { update: sync };
        },
      }),
    ];
  },
});
