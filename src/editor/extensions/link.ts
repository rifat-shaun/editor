/**
 * Link kit: Tiptap's Link mark reconfigured for the custom link UI (no native
 * prompt, no click-to-navigate), plus an interactions plugin that
 *
 *  - paints a teal tint over the range the link popover is editing (so the
 *    target stays visible while focus is in the popover input), and
 *  - opens a link in a new tab on ⌘/Ctrl-click (plain clicks never navigate —
 *    they place the caret and let the hover card appear).
 *
 * The ⌘K shortcut and every entry point dispatch a `docs:open-link` DOM event;
 * the React <LinkPopover> owns the actual UI and decides insert vs. edit.
 */
import Link from '@tiptap/extension-link';
import { getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface LinkRange {
  from: number;
  to: number;
}

/** Plugin state: the range currently highlighted for the open popover (or null). */
export const linkTargetKey = new PluginKey<LinkRange | null>('linkTarget');

/** The full link mark range + href covering `pos`, if any. */
export function linkAt(state: EditorState, pos: number): { href: string; from: number; to: number } | null {
  const type = state.schema.marks.link;
  if (!type) return null;
  const $pos = state.doc.resolve(pos);
  const range = getMarkRange($pos, type);
  if (!range) return null;
  const mark =
    $pos.marks().find((m) => m.type === type) ??
    type.isInSet(state.doc.resolve(range.from + 1).marks() ?? []);
  const href = (mark?.attrs.href as string | undefined) ?? '';
  return { href, from: range.from, to: range.to };
}

/** The href of the link mark covering `pos`, if any. */
export function hrefAt(state: EditorState, pos: number): string | null {
  return linkAt(state, pos)?.href ?? null;
}

/**
 * Normalize a user-entered link: trim, accept `mailto:`/`tel:`/`#anchor`,
 * upgrade a bare email to `mailto:`, and prepend `https://` when a scheme is
 * missing but the input looks like a domain. Returns null when the input can't
 * be a link (so the popover keeps Apply/Update disabled).
 */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  if (s.startsWith('#')) return s; // in-document anchor
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`; // bare email
  if (/^[^\s]+\.[^\s]{2,}/.test(s)) return `https://${s}`; // looks like a domain/path
  return null;
}

function linkInteractionPlugin(): Plugin<LinkRange | null> {
  return new Plugin<LinkRange | null>({
    key: linkTargetKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(linkTargetKey) as LinkRange | null | undefined;
        if (meta !== undefined) return meta; // explicit set / clear
        if (value && tr.docChanged) {
          return { from: tr.mapping.map(value.from), to: tr.mapping.map(value.to) };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const r = linkTargetKey.getState(state);
        if (!r || r.from === r.to) return null;
        return DecorationSet.create(state.doc, [
          Decoration.inline(r.from, r.to, { class: 'link-target-highlight' }),
        ]);
      },
      // ⌘/Ctrl-click opens; plain click does nothing here (caret + hover card).
      handleClick(view, pos, event) {
        if (event.metaKey || event.ctrlKey) {
          const href = hrefAt(view.state, pos);
          if (href) {
            window.open(href, '_blank', 'noopener,noreferrer');
            return true;
          }
        }
        return false;
      },
    },
  });
}

export const LinkKit = Link.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        if (!this.editor.isEditable) return false; // no link editing in view mode
        this.editor.view.dom.dispatchEvent(new CustomEvent('docs:open-link', { bubbles: true }));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), linkInteractionPlugin()];
  },
});

/** Set (or clear) the teal target-highlight range on the editor view. */
export function setLinkTarget(view: import('@tiptap/pm/view').EditorView, range: LinkRange | null): void {
  view.dispatch(view.state.tr.setMeta(linkTargetKey, range).setMeta('addToHistory', false));
}
