import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Two marks power the tracked-change layer. They are visual only: applying a
 * proposed edit *marks* text (and inserts the new text) but never resolves it
 * to clean prose until the user accepts or rejects.
 *
 *  - `deletion`  — existing text the AI wants removed (strikethrough).
 *  - `insertion` — new text the AI wants added (underlined).
 *
 * Both carry the owning change id so the registry, cards and spotlight can
 * cross-reference a specific redline.
 */

export interface RedlineAttrs {
  changeId: string | null;
}

const deletionAttrs = {
  changeId: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-change-id'),
    renderHTML: (attrs: RedlineAttrs) =>
      attrs.changeId ? { 'data-change-id': attrs.changeId } : {},
  },
};

export const DeletionMark = Mark.create({
  name: 'deletion',
  inclusive: false,
  excludes: 'insertion',
  addAttributes() {
    return deletionAttrs;
  },
  parseHTML() {
    return [{ tag: 'span[data-redline="del"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-redline': 'del',
        class: 'redline-del',
      }),
      0,
    ];
  },
});

export const InsertionMark = Mark.create({
  name: 'insertion',
  inclusive: true,
  excludes: 'deletion',
  addAttributes() {
    return deletionAttrs;
  },
  parseHTML() {
    return [{ tag: 'span[data-redline="ins"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-redline': 'ins',
        class: 'redline-ins',
      }),
      0,
    ];
  },
});
