/**
 * Page-setup bridge. Page geometry is stored on the Document node attribute
 * `pageSetup` (so a change is one undoable ProseMirror step AND persists in the
 * document JSON — the same pattern as the list registries). This extension:
 *
 *  - adds the `setPageSetup` command (writes the doc attr → undoable), and
 *  - syncs that attr to the pagination engine (page format + margins) whenever
 *    it changes, including on undo/redo. Applying to the engine is NOT a doc
 *    change, so it never loops back into `onUpdate`.
 */
import { Extension, type Editor } from '@tiptap/core';
import type { PageSetup } from '../../menus/pageSetup';
import { resolveGeometry, DEFAULT_PAGE_SETUP } from '../../menus/pageSetup';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageSetupBridge: {
      /** Commit page setup to the doc (undoable). null → revert to defaults. */
      setPageSetup: (setup: PageSetup | null) => ReturnType;
    };
  }
}

function syncToEngine(editor: Editor, storage: { appliedKey: string }) {
  const setup = (editor.state.doc.attrs.pageSetup as PageSetup | null) ?? null;
  const key = JSON.stringify(setup);
  if (key === storage.appliedKey) return;
  storage.appliedKey = key;
  // Pagination is configured on the live editor; guard so the bridge is inert
  // when it's absent (e.g. headless test editors).
  if (typeof editor.commands.setPageFormat !== 'function') return;
  // null (unset / undone) → the app's configured default, which matches
  // DEFAULT_PAGE_SETUP (A4 · 1" margins). This makes undo/redo restore the
  // visible geometry, not just the doc attr.
  const geo = resolveGeometry(setup ?? DEFAULT_PAGE_SETUP);
  editor.commands.setPageFormat(geo.pageFormat);
  editor.commands.updateMargins(geo.margins);
}

export const PageSetupBridge = Extension.create({
  name: 'pageSetupBridge',

  addStorage() {
    return { appliedKey: '__init__' };
  },

  addCommands() {
    return {
      setPageSetup:
        (setup: PageSetup | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setDocAttribute('pageSetup', setup);
          return true;
        },
    };
  },

  onCreate() {
    syncToEngine(this.editor, this.storage);
  },

  onUpdate() {
    syncToEngine(this.editor, this.storage);
  },
});
