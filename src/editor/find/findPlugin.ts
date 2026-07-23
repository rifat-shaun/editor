/**
 * Find & Replace ProseMirror integration (view-only highlights + commands).
 *
 * Plugin state holds the query, options, current index, and the live match set;
 * it recomputes matches whenever the query/options change or the document
 * changes (so positions are never stale), clamping the index. Matches render as
 * inline decorations — `.find-match` for all, `.find-match-current` for the
 * active one — which are view-only and never enter the document/export/print.
 *
 * The React panel drives it via `setFind` and reads state via `getFindState`.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findMatches, type FindMatch } from './findMatches';
import type { VariableValues } from '../../types';

export interface FindState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  index: number;
  matches: FindMatch[];
}

const EMPTY: FindState = { query: '', matchCase: false, wholeWord: false, index: 0, matches: [] };

export const findKey = new PluginKey<FindState>('findReplace');

/** Read the current find state (matches, index, options) for the panel. */
export function getFindState(editor: { state: EditorState }): FindState {
  return findKey.getState(editor.state) ?? EMPTY;
}

type FindMeta = Partial<Pick<FindState, 'query' | 'matchCase' | 'wholeWord' | 'index'>>;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      /** Update query/options/index (recomputes matches as needed). */
      setFind: (patch: FindMeta) => ReturnType;
      /** Clear the query, matches, and highlights. */
      clearFind: () => ReturnType;
      /** Replace the current match; no-op if it's unset or inside a token. */
      replaceFindCurrent: (replacement: string) => ReturnType;
      /** Replace every replaceable match in one undo step (re-match guarded). */
      replaceFindAll: (replacement: string) => ReturnType;
    };
  }
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

/** Replace [from,to] with text, preserving the leading run's marks (or delete). */
function replaceRange(tr: import('@tiptap/pm/state').Transaction, from: number, to: number, text: string) {
  if (text === '') tr.delete(from, to);
  else tr.insertText(text, from, to); // insertText inherits the marks at `from`
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addCommands() {
    return {
      setFind:
        (patch) =>
        ({ state, dispatch }) => {
          if (dispatch) dispatch(state.tr.setMeta(findKey, patch).setMeta('addToHistory', false));
          return true;
        },
      clearFind:
        () =>
        ({ state, dispatch }) => {
          if (dispatch)
            dispatch(state.tr.setMeta(findKey, { query: '', index: 0 }).setMeta('addToHistory', false));
          return true;
        },
      replaceFindCurrent:
        (replacement) =>
        ({ state, dispatch }) => {
          const fs = findKey.getState(state);
          const m = fs?.matches[fs.index];
          if (!m || !m.replaceable) return false;
          if (dispatch) {
            const tr = state.tr;
            replaceRange(tr, m.from, m.to, replacement);
            dispatch(tr);
          }
          return true;
        },
      replaceFindAll:
        (replacement) =>
        ({ state, dispatch }) => {
          const fs = findKey.getState(state);
          if (!fs || fs.matches.length === 0) return false;
          if (dispatch) {
            const tr = state.tr;
            // Reverse order so earlier positions stay valid, and only over the
            // ORIGINAL match set — the inserted text is never re-matched (E3).
            for (let i = fs.matches.length - 1; i >= 0; i--) {
              const m = fs.matches[i]!;
              if (m.replaceable) replaceRange(tr, m.from, m.to, replacement);
            }
            if (tr.docChanged) dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const values = (): VariableValues =>
      (editor.storage.variable as { values?: VariableValues } | undefined)?.values ?? {};

    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply: (tr, prev, _old, newState) => {
            const meta = tr.getMeta(findKey) as FindMeta | undefined;
            const query = meta?.query ?? prev.query;
            const matchCase = meta?.matchCase ?? prev.matchCase;
            const wholeWord = meta?.wholeWord ?? prev.wholeWord;
            let index = meta?.index ?? prev.index;

            const optsChanged =
              !!meta && (meta.query !== undefined || meta.matchCase !== undefined || meta.wholeWord !== undefined);
            let matches = prev.matches;
            if (optsChanged || tr.docChanged) {
              matches = query ? findMatches(newState.doc, query, { matchCase, wholeWord }, values()) : [];
            }
            index = clampIndex(index, matches.length);
            return { query, matchCase, wholeWord, index, matches };
          },
        },
        props: {
          decorations: (state) => {
            const fs = findKey.getState(state);
            if (!fs || fs.matches.length === 0) return DecorationSet.empty;
            const decos = fs.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === fs.index ? 'find-match find-match-current' : 'find-match',
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
