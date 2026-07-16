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
import { measureBlocks } from './measure';
import { computeBreaks } from './computeBreaks';
import {
  formatTemplate,
  normalizeHeaderFooter,
  toDimensions,
  type Dimensions,
  type HeaderFooterConfig,
  type PaginationOptions,
} from './config';

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

/**
 * Build the full print DOM for the current document. Clones each top-level
 * block's rendered DOM (preserving formatting), so what prints is what you see.
 */
export function buildPrintRoot(view: EditorView, opts: PaginationOptions): HTMLElement {
  const dims = toDimensions(opts);
  const header = normalizeHeaderFooter(opts.header);
  const footer = normalizeHeaderFooter(opts.footer);

  const blocks = measureBlocks(view);
  const { breaks, pageCount } = computeBreaks(blocks, dims.contentHeight);
  const groups = groupBlocksIntoPages(
    blocks.map((b) => b.pos),
    breaks.map((b) => b.pos),
  );
  const pages = groups.length ? groups : [[]]; // always at least one (blank) page
  const total = Math.max(pageCount, pages.length);

  // Reuse the live editor's typography (drop the on-screen page-frame class)
  // so clones render identically without hardcoding the host's content class.
  const contentClass = view.dom.className.replace('pgn-paginated', '').trim();
  const liveStyle = (view.dom as HTMLElement).style;

  const root = document.createElement('div');
  root.className = 'pgn-print-root';

  pages.forEach((indices, i) => {
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

    // The content area fills the space between the margin bands (= contentHeight).
    // With margin-accurate measurement, the natural block flow ends where the
    // engine's break falls, so the leftover whitespace above the footer matches
    // the editor's on-screen fill exactly — and the footer sits on the bottom
    // margin.
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

    for (const idx of indices) {
      const block = blocks[idx];
      const dom = block ? view.nodeDOM(block.pos) : null;
      if (dom instanceof HTMLElement) content.appendChild(dom.cloneNode(true) as HTMLElement);
    }
    pageEl.appendChild(content);

    pageEl.appendChild(bandElement('footer', dims.mb, footer, i + 1, total, opts, dims));
    root.appendChild(pageEl);
  });

  return root;
}
