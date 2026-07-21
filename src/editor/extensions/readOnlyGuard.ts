/**
 * Read-only guard for view mode.
 *
 * ProseMirror's `editable: false` only blocks TYPED input — programmatic
 * commands (toolbar buttons, ⌘B/⌘I keyboard shortcuts, menu items) still build
 * and dispatch transactions, which would otherwise mutate the document in view
 * mode. This plugin closes that gap for every vector at once by rejecting any
 * document-changing transaction while the editor is not editable.
 *
 * Pass-throughs:
 *  - selection changes and meta-only transactions (pagination recompute, the
 *    inactive-selection highlight, etc.) have `docChanged === false`; and
 *  - genuinely programmatic/system writes that must run in view mode (e.g.
 *    loading content, collab remote steps) can opt out with
 *    `tr.setMeta('readOnlyBypass', true)`.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const readOnlyGuardKey = new PluginKey('readOnlyGuard');

/** Meta flag a caller sets to allow a doc change through while in view mode. */
export const READ_ONLY_BYPASS = 'readOnlyBypass';

export const ReadOnlyGuard = Extension.create({
  name: 'readOnlyGuard',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: readOnlyGuardKey,
        filterTransaction(tr) {
          if (!tr.docChanged) return true; // selection / meta — always allowed
          if (editor.isEditable) return true; // edit mode — allowed
          if (tr.getMeta(READ_ONLY_BYPASS)) return true; // explicit programmatic write
          return false; // view mode + document mutation → block
        },
      }),
    ];
  },
});
