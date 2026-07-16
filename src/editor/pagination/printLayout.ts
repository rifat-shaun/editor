/**
 * Shared export/print renderer. Instead of letting the browser re-flow the
 * document (which diverges from the on-screen breaks), we build a dedicated
 * print DOM: one real page element per page the ENGINE computed, each with a
 * header band, the page's block clones, and a footer band. Printed pages then
 * match the editor's breaks and carry the running header/footer.
 *
 * The page-grouping step (breaks → block ranges) is a pure function so it can
 * be unit-tested without a DOM.
 */
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { collectBreakUnits } from './measure';
import { computeBreaks } from './computeBreaks';
import {
  formatTemplate,
  normalizeHeaderFooter,
  toDimensions,
  type Dimensions,
  type HeaderFooterConfig,
  type PaginationOptions,
} from './config';
import type { ListDefinition, ListDefRegistry } from '../extensions/listNumbering/model';

const LIST_TYPES = new Set(['orderedList', 'bulletList', 'taskList']);

/**
 * Split top-level block indices into pages. `breakPositions` are the positions
 * (each equal to some block position) where a NEW page begins. Pure + testable.
 */
export function groupBlocksIntoPages(
  blockPositions: number[],
  breakPositions: number[],
): number[][] {
  const breakSet = new Set(breakPositions);
  const pages: number[][] = [];
  let current: number[] = [];
  blockPositions.forEach((pos, idx) => {
    if (breakSet.has(pos) && current.length) {
      pages.push(current);
      current = [];
    }
    current.push(idx);
  });
  if (current.length) pages.push(current);
  return pages;
}

/** `@page` box sized to the exact page format so one `.print-page` = one sheet. */
export function pageSizeStyleElement(dims: Dimensions): HTMLStyleElement {
  const el = document.createElement('style');
  el.id = 'pgn-print-page-size';
  // px in `size` is valid (816px = 8.5in). margin:0 — our page element owns the
  // margins, so the sheet matches the editor's geometry exactly.
  el.textContent = `@page { size: ${dims.pageWidth}px ${dims.pageHeight}px; margin: 0; }`;
  return el;
}

function bandElement(
  kind: 'header' | 'footer',
  heightPx: number,
  cfg: HeaderFooterConfig | null,
  page: number,
  total: number,
  opts: PaginationOptions,
  dims: Dimensions,
): HTMLElement {
  const el = document.createElement('div');
  const align = cfg?.align ?? 'center';
  Object.assign(el.style, {
    height: `${heightPx}px`,
    flex: '0 0 auto',
    display: 'flex',
    alignItems: kind === 'header' ? 'flex-end' : 'flex-start',
    justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
    padding:
      kind === 'header'
        ? `0 ${dims.mr}px 10px ${dims.ml}px`
        : `10px ${dims.mr}px 0 ${dims.ml}px`,
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '11px',
    color: '#8a939b',
    whiteSpace: 'pre',
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);

  // Auto page-numbers append to the FOOTER only (headers keep the title).
  const autoNumbers = kind === 'footer' && opts.showPageNumbers;
  if (cfg) el.textContent = formatTemplate(cfg.text, page, total, autoNumbers);
  else if (autoNumbers) el.textContent = formatTemplate('', page, total, true);
  return el;
}

/* ------------------------- list-splitting helpers ------------------------- *
 * A list may now cross a page boundary. For each printed page we clone the list
 * element and TRIM it to the items within that page's doc range, recursing into
 * nested lists, and set a `counter-reset` offset on any continued fragment so
 * numbering keeps counting (…4 | 5, 6…) instead of restarting. Because the
 * offset is derived from the SAME definition the on-screen counters use,
 * composite/parent-inclusive markers stay correct across the break.
 * ------------------------------------------------------------------------- */

/** Remove our on-screen page-break widgets from a clone (screen-only chrome). */
function stripBreakWidgets(el: HTMLElement): void {
  el.querySelectorAll('.pgn-break').forEach((n) => n.remove());
}

/** Direct child elements of `el` that are <li>, in order. */
function childLis(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter((c): c is HTMLElement => c.tagName === 'LI');
}
/** Direct child elements of `el` (widgets already stripped), in order. */
function childEls(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
}

function startAtFor(reg: ListDefRegistry, listNode: PMNode, level: number): number {
  const id = listNode.attrs.listDefId as string | null;
  const def = id ? (reg[id] as ListDefinition | undefined) : undefined;
  return def?.[level - 1]?.startAt ?? 1;
}

/** Trim a cloned list to items within [from,to); returns false if nothing remains. */
function trimListInPlace(
  cloneEl: HTMLElement,
  listNode: PMNode,
  listStart: number,
  from: number,
  to: number,
  level: number,
  reg: ListDefRegistry,
): boolean {
  const lis = childLis(cloneEl);
  let removedBefore = 0;
  let kept = 0;
  let childPos = listStart + 1;
  let idx = 0;
  listNode.forEach((li) => {
    const liFrom = childPos;
    const liTo = childPos + li.nodeSize;
    const cloneLi = lis[idx++];
    if (cloneLi) {
      if (liTo <= from) {
        removedBefore += 1; // consumed on an earlier page — counts toward numbering
        cloneLi.remove();
      } else if (liFrom >= to) {
        cloneLi.remove();
      } else if (liFrom >= from && liTo <= to) {
        kept += 1; // fully on this page
      } else if (trimListItemInPlace(cloneLi, li, liFrom, from, to, level, reg)) {
        kept += 1; // straddles the boundary (nested split) — trimmed in place
      } else {
        cloneLi.remove();
      }
    }
    childPos += li.nodeSize;
  });
  if (kept === 0) return false;
  // Continued fragment: offset the level's counter so it resumes, not restarts.
  if (removedBefore > 0) {
    cloneEl.style.counterReset = `pgnol${level} ${startAtFor(reg, listNode, level) - 1 + removedBefore}`;
  }
  return true;
}

function trimListItemInPlace(
  cloneLi: HTMLElement,
  liNode: PMNode,
  liFrom: number,
  from: number,
  to: number,
  level: number,
  reg: ListDefRegistry,
): boolean {
  const kids = childEls(cloneLi);
  let childPos = liFrom + 1;
  let idx = 0;
  let kept = 0;
  liNode.forEach((child) => {
    const cFrom = childPos;
    const cTo = childPos + child.nodeSize;
    const cloneKid = kids[idx++];
    if (cloneKid) {
      if (LIST_TYPES.has(child.type.name)) {
        if (trimListInPlace(cloneKid, child, cFrom, from, to, level + 1, reg)) kept += 1;
        else cloneKid.remove();
      } else if (cTo <= from || cFrom >= to) {
        cloneKid.remove(); // this block sits on another page
      } else {
        kept += 1;
      }
    }
    childPos += child.nodeSize;
  });
  return kept > 0;
}

/**
 * Build the full print DOM for the current document. Clones each block's
 * rendered DOM (preserving formatting), so what prints is what you see. Lists
 * that cross a page boundary are split between items with numbering continued.
 */
export function buildPrintRoot(view: EditorView, opts: PaginationOptions): HTMLElement {
  const dims = toDimensions(opts);
  const header = normalizeHeaderFooter(opts.header);
  const footer = normalizeHeaderFooter(opts.footer);
  const doc = view.state.doc;
  const reg = (doc.attrs.listDefs ?? {}) as ListDefRegistry;

  const units = collectBreakUnits(view);
  const { breaks, pageCount } = computeBreaks(units, dims.contentHeight);
  // Page k spans the doc range [boundaries[k], boundaries[k+1]).
  const boundaries = [0, ...breaks.map((b) => b.pos), doc.content.size];
  const total = Math.max(1, pageCount);

  // Reuse the live editor's typography (drop the on-screen page-frame class)
  // so clones render identically without hardcoding the host's content class.
  const contentClass = view.dom.className.replace('pgn-paginated', '').trim();
  const liveStyle = (view.dom as HTMLElement).style;

  const root = document.createElement('div');
  root.className = 'pgn-print-root';

  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i]!;
    const to = boundaries[i + 1]!;

    const pageEl = document.createElement('div');
    pageEl.className = 'print-page';
    // Fixed to the exact sheet height so one page == one physical sheet (a
    // natural height risks a sub-pixel overhang that spills onto an extra
    // sheet). `overflow: hidden` clips a block taller than a page (Bar A caveat).
    Object.assign(pageEl.style, {
      width: `${dims.pageWidth}px`,
      height: `${dims.pageHeight}px`,
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      boxSizing: 'border-box',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);

    pageEl.appendChild(bandElement('header', dims.mt, header, i + 1, total, opts, dims));

    const content = document.createElement('div');
    content.className = contentClass;
    Object.assign(content.style, {
      flex: '1 1 auto',
      minHeight: '0',
      padding: `0 ${dims.mr}px 0 ${dims.ml}px`,
      boxSizing: 'border-box',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    if (liveStyle.fontSize) content.style.fontSize = liveStyle.fontSize;
    if (liveStyle.fontFamily) content.style.fontFamily = liveStyle.fontFamily;

    // Append every top-level block that has content on this page. Non-list
    // blocks are atomic (appear on the page their start falls on); lists are
    // cloned and trimmed to this page's items with numbering continued.
    let pos = 0;
    doc.forEach((node) => {
      const blockFrom = pos;
      const blockTo = pos + node.nodeSize;
      pos += node.nodeSize;
      const dom = view.nodeDOM(blockFrom);
      if (!(dom instanceof HTMLElement)) return;

      if (LIST_TYPES.has(node.type.name)) {
        if (!(blockFrom < to && blockTo > from)) return; // no overlap
        const clone = dom.cloneNode(true) as HTMLElement;
        stripBreakWidgets(clone);
        if (trimListInPlace(clone, node, blockFrom, from, to, 1, reg)) content.appendChild(clone);
      } else if (blockFrom >= from && blockFrom < to) {
        const clone = dom.cloneNode(true) as HTMLElement;
        stripBreakWidgets(clone);
        content.appendChild(clone);
      }
    });
    pageEl.appendChild(content);

    pageEl.appendChild(bandElement('footer', dims.mb, footer, i + 1, total, opts, dims));
    root.appendChild(pageEl);
  }

  return root;
}
