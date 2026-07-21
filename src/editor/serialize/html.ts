/**
 * HTML serialization. Two modes:
 *  - 'roundtrip' (default): self-contained. `editor.getHTML()` already emits
 *    every per-node/mark datum (line-height, spacing, font-size, alignment,
 *    list/bullet def-ids, table widths/merges, redline marks, task state). The
 *    three items that live OUTSIDE the node tree — the list/bullet definition
 *    registries, `pageSetup`, and the editor font-family (whole-editor CSS) —
 *    are carried in a wrapper's data-attrs so nothing is silently lost.
 *  - 'clean': portable semantic HTML. Keeps inline style formatting but strips
 *    internal `data-*` attributes (and the wrapper). Not guaranteed to
 *    reconstruct custom list markers / page geometry.
 */
import type { Editor } from '@tiptap/core';

export type HtmlMode = 'roundtrip' | 'clean';

export interface HtmlOptions {
  mode?: HtmlMode;
}

function fontFamily(editor: Editor): string {
  try {
    return (editor.view?.dom as HTMLElement)?.style.fontFamily || '';
  } catch {
    return '';
  }
}

export function serializeHTML(editor: Editor, opts: HtmlOptions = {}): string {
  const mode: HtmlMode = opts.mode ?? 'roundtrip';
  const body = editor.getHTML();

  if (mode === 'clean') {
    if (typeof DOMParser === 'undefined') return body;
    const doc = new DOMParser().parseFromString(`<div id="__r">${body}</div>`, 'text/html');
    const root = doc.getElementById('__r')!;
    // Strip internal data-* attributes; keep semantic tags + inline styles.
    root.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('data-')) el.removeAttribute(attr.name);
      }
    });
    return root.innerHTML;
  }

  // Round-trip: wrap with the out-of-tree document metadata.
  const attrs = editor.state.doc.attrs;
  const meta = {
    listDefs: attrs.listDefs ?? {},
    bulletDefs: attrs.bulletDefs ?? {},
    pageSetup: attrs.pageSetup ?? null,
  };
  const font = fontFamily(editor);
  const metaAttr = escapeAttr(JSON.stringify(meta));
  return (
    `<div data-acme-doc="1"${font ? ` data-font-family="${escapeAttr(font)}"` : ''} data-doc-meta="${metaAttr}">` +
    body +
    `</div>`
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
