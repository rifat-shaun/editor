/**
 * "Show non-printing characters" (Word's formatting marks) — VIEW-ONLY.
 *
 * When enabled, renders normally-invisible characters as subtle gray glyphs:
 *   ¶ block ends · space  → tab  ↵ hard break  ° non-breaking space
 *
 * These are decorations + a CSS root class — never document content. They do
 * NOT appear in getJSON/getHTML, never export to DOCX, and are hidden in print
 * (see the `@media print` block in styles.css). They aren't selectable,
 * copyable, or deletable.
 *
 * One source of truth: the plugin state's `enabled` flag (mirrored to the
 * `.docs-show-formatting` class on the editor DOM for the pilcrow ::after and
 * driving the whitespace/break decorations). The View menu reads it via
 * `isNonPrintingEnabled`; `toggleNonPrinting` flips + persists it.
 */
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const KEY = new PluginKey<NPState>('nonPrinting');
const STORAGE_KEY = 'docs-editor:show-formatting';
const ROOT_CLASS = 'docs-show-formatting';

interface NPState {
  enabled: boolean;
  decorations: DecorationSet;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    nonPrinting: {
      toggleNonPrinting: () => ReturnType;
    };
  }
}

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
function writePref(v: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** Build whitespace + hard-break decorations for the whole doc. */
export function buildNonPrintingDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text ?? '';
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const from = pos + i;
        if (code === 0x20) decos.push(Decoration.inline(from, from + 1, { class: 'npc-sp' })); // space
        else if (code === 0xa0) decos.push(Decoration.inline(from, from + 1, { class: 'npc-nbsp' })); // nbsp
        else if (code === 0x09) decos.push(Decoration.inline(from, from + 1, { class: 'npc-tab' })); // tab
      }
    } else if (node.type.name === 'hardBreak') {
      decos.push(
        Decoration.widget(
          pos,
          () => {
            const s = document.createElement('span');
            s.className = 'npc-break';
            s.textContent = '↵';
            s.setAttribute('aria-hidden', 'true');
            return s;
          },
          { side: -1, key: 'npc-break' },
        ),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

/** Whether formatting marks are currently shown. */
export function isNonPrintingEnabled(editor: Editor): boolean {
  return KEY.getState(editor.state)?.enabled ?? false;
}

export const NonPrinting = Extension.create({
  name: 'nonPrinting',

  addCommands() {
    return {
      toggleNonPrinting:
        () =>
        ({ state, dispatch }) => {
          const cur = KEY.getState(state)?.enabled ?? false;
          const next = !cur;
          writePref(next);
          if (dispatch) dispatch(state.tr.setMeta(KEY, next).setMeta('addToHistory', false));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<NPState>({
        key: KEY,
        state: {
          init: (_config, state: EditorState) => {
            const enabled = readPref();
            return { enabled, decorations: enabled ? buildNonPrintingDecorations(state.doc) : DecorationSet.empty };
          },
          apply: (tr, prev) => {
            const meta = tr.getMeta(KEY);
            const enabled = typeof meta === 'boolean' ? meta : prev.enabled;
            if (!enabled) return { enabled, decorations: DecorationSet.empty };
            // Rebuild on enable or any doc change; else keep (remap is unnecessary
            // since a rebuild is cheap relative to correctness of per-char marks).
            if (typeof meta === 'boolean' || tr.docChanged) {
              return { enabled, decorations: buildNonPrintingDecorations(tr.doc) };
            }
            return { enabled, decorations: prev.decorations };
          },
        },
        props: {
          decorations: (state) => KEY.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (view) => {
          const sync = () => view.dom.classList.toggle(ROOT_CLASS, KEY.getState(view.state)?.enabled ?? false);
          sync();
          return { update: sync };
        },
      }),
    ];
  },
});
