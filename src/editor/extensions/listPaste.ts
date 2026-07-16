/**
 * List paste normalizer.
 *
 * ProseMirror only turns clipboard content into a list when it sees real
 * `<ol>/<ul><li>`. Two common sources don't provide that, so their lists were
 * lost on paste (arriving as plain paragraphs):
 *
 *  1. Microsoft Word / Outlook / Word-desktop: list items paste as
 *     `<p class=MsoListParagraph style='mso-list:…'>` with the marker as literal
 *     text in a leading `<span style='mso-list:Ignore'>`. We reconstruct real
 *     nested `<ol>/<ul>` from those (transformPastedHTML), so the schema then
 *     parses them as lists.
 *  2. Plain text with `1. ` / `a) ` / `- ` lines: converted to a list on paste
 *     when it clearly looks like one (handlePaste for text/plain only).
 *
 * Both are no-ops for content that doesn't match, so normal paste is unchanged.
 * The reconstructed list carries no numbering definition (no `listDefId`) — it
 * renders with default numbering until the user picks a preset; the point here
 * is only to recover the list STRUCTURE that was being dropped.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model';

/* ----------------------------- Word (MSO) ----------------------------- */

function isMsoListItem(el: Element): boolean {
  if (el.tagName !== 'P') return false;
  const style = el.getAttribute('style') ?? '';
  return /mso-list\s*:/i.test(style) || /MsoListParagraph/i.test(el.className);
}

function msoLevel(el: Element): number {
  const m = /mso-list\s*:[^;]*\blevel(\d+)/i.exec(el.getAttribute('style') ?? '');
  return m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
}

/** The literal marker text from the `mso-list:Ignore` span (e.g. "1.", "·", "o"). */
function msoMarker(el: Element): { text: string; span: Element | null } {
  const span =
    el.querySelector('span[style*="mso-list" i]') ??
    // fallback: Word sometimes nests the marker one level deep
    el.querySelector('span');
  return { text: (span?.textContent ?? '').trim(), span };
}

/** A marker is "ordered" only if it has a number/letter followed by . or ) */
function markerIsOrdered(marker: string): boolean {
  return /^[0-9a-z]+[.)]/i.test(marker);
}

/** Content HTML of an MSO list paragraph, minus its marker span + leading NBSPs. */
function msoContent(el: Element, span: Element | null): string {
  const clone = el.cloneNode(true) as Element;
  if (span) {
    // remove the matching span in the clone (first mso-list span, else first span)
    const s =
      clone.querySelector('span[style*="mso-list" i]') ?? clone.querySelector('span');
    s?.remove();
  }
  return clone.innerHTML.replace(/^(?:&nbsp;|\s)+/i, '').trim();
}

interface StackEntry {
  level: number;
  list: HTMLElement;
  ordered: boolean;
}

/** Build one nested list DOM tree from a run of MSO list paragraphs. */
function buildListTree(doc: Document, items: Element[]): HTMLElement | null {
  const stack: StackEntry[] = [];
  let root: HTMLElement | null = null;

  for (const p of items) {
    const level = msoLevel(p);
    const { text, span } = msoMarker(p);
    const ordered = markerIsOrdered(text);

    // Close deeper levels.
    while (stack.length && stack[stack.length - 1]!.level > level) stack.pop();

    let top = stack[stack.length - 1];
    if (!top || top.level < level || top.ordered !== ordered) {
      const list = doc.createElement(ordered ? 'ol' : 'ul');
      if (!stack.length) {
        // New top-level list (only the first becomes `root`; a type switch at the
        // top level appends as a sibling under the same returned fragment holder).
        if (!root) root = list;
        else root.appendChild(list); // keep everything under one returned node
      } else {
        const parentLi = top!.list.lastElementChild ?? top!.list;
        parentLi.appendChild(list);
      }
      if (top && top.level < level) {
        stack.push({ level, list, ordered });
      } else {
        // same level, type switch → replace the top entry
        if (top && top.level === level) stack.pop();
        stack.push({ level, list, ordered });
      }
      top = stack[stack.length - 1];
    }

    const li = doc.createElement('li');
    li.innerHTML = msoContent(p, span) || '&nbsp;';
    top!.list.appendChild(li);
  }
  return root;
}

/** Replace every contiguous run of MSO list paragraphs with a real list. */
export function transformMsoLists(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body.querySelector('[style*="mso-list" i], [class*="MsoListParagraph" i]')) {
    return html; // no Word list markup — leave untouched
  }

  const children = Array.from(body.children);
  let i = 0;
  while (i < children.length) {
    if (!isMsoListItem(children[i]!)) {
      i += 1;
      continue;
    }
    let j = i;
    const run: Element[] = [];
    while (j < children.length && isMsoListItem(children[j]!)) {
      run.push(children[j]!);
      j += 1;
    }
    const tree = buildListTree(doc, run);
    if (tree) {
      run[0]!.parentNode!.insertBefore(tree, run[0]!);
      for (const el of run) el.remove();
    }
    i = j;
  }
  return body.innerHTML;
}

/* ----------------------------- plain text ----------------------------- */

const ORDERED_LINE = /^(\s*)([0-9]{1,3}|[a-z]|[ivxlcdm]+)[.)]\s+(.+)$/i;
const BULLET_LINE = /^(\s*)[-*•·▪◦]\s+(.+)$/;

/**
 * Convert a plain-text block to a flat list node when it clearly looks like one
 * (≥2 lines, and EVERY non-empty line matches the same family). Returns null
 * otherwise, so ordinary text pastes normally.
 */
export function buildListFromText(schema: Schema, text: string): PMNode | null {
  const orderedType = schema.nodes.orderedList;
  const bulletType = schema.nodes.bulletList;
  const itemType = schema.nodes.listItem;
  const paraType = schema.nodes.paragraph;
  if (!orderedType || !bulletType || !itemType || !paraType) return null;

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return null;

  const parsed = nonEmpty.map((l) => {
    const o = ORDERED_LINE.exec(l);
    if (o) return { ordered: true, content: o[3]!.trim() };
    const b = BULLET_LINE.exec(l);
    if (b) return { ordered: false, content: b[2]!.trim() };
    return null;
  });
  if (parsed.some((p) => p === null)) return null; // mixed/plain lines → not a list
  const allOrdered = parsed.every((p) => p!.ordered);
  const allBullet = parsed.every((p) => !p!.ordered);
  if (!allOrdered && !allBullet) return null; // don't guess mixed families

  const items = parsed.map((p) =>
    itemType.create(null, paraType.create(null, p!.content ? schema.text(p!.content) : undefined)),
  );
  return (allOrdered ? orderedType : bulletType).create(null, Fragment.fromArray(items));
}

/* ------------------------------ extension ------------------------------ */

export const ListPaste = Extension.create({
  name: 'listPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listPaste'),
        props: {
          // Word/Outlook/Word-desktop: rebuild real lists from MSO paragraphs.
          transformPastedHTML(html) {
            try {
              return transformMsoLists(html);
            } catch {
              return html; // never let a paste fail because of normalization
            }
          },
          // Plain-text-only paste that looks like a list → a real list.
          handlePaste(view, event) {
            const cd = event.clipboardData;
            if (!cd) return false;
            const html = cd.getData('text/html');
            if (html && html.trim()) return false; // richer content → HTML path handles it
            const text = cd.getData('text/plain');
            if (!text) return false;
            const node = buildListFromText(view.state.schema, text);
            if (!node) return false;
            const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
