/**
 * Turns break positions into widget decorations. These are LOCAL view state:
 * they never enter the document, undo history, or a Yjs doc. The set is rebuilt
 * from scratch on every recompute (positions are only valid for the doc they
 * were computed against).
 */
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { PageBreak } from './computeBreaks';
import { formatTemplate, type Dimensions, type HeaderFooterConfig } from './config';

export interface DecorationContext {
  dims: Dimensions;
  header: HeaderFooterConfig | null;
  footer: HeaderFooterConfig | null;
  showPageNumbers: boolean;
  pageCount: number;
  lastPageFiller: number;
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

/** A header/footer band (also serves as the structural top/bottom margin). */
function makeHF(
  kind: 'header' | 'footer',
  heightPx: number,
  cfg: HeaderFooterConfig | null,
  page: number,
  ctx: DecorationContext,
): HTMLDivElement {
  const el = div(`pgn-band pgn-hf pgn-${kind}`);
  el.style.height = `${heightPx}px`;
  if (cfg) {
    el.dataset.align = cfg.align ?? 'center';
    // Auto page-numbers (the `showPageNumbers` append) belong to the FOOTER
    // only. Explicit {page}/{total} tokens are still honoured in either band.
    const autoNumbers = kind === 'footer' && ctx.showPageNumbers;
    el.textContent = formatTemplate(cfg.text, page, ctx.pageCount, autoNumbers);
  } else if (kind === 'footer' && ctx.showPageNumbers) {
    // Page numbers requested with no footer template → render just the number.
    el.dataset.align = 'center';
    el.textContent = formatTemplate('', page, ctx.pageCount, true);
  }
  return el;
}

function makeGap(): HTMLDivElement {
  return div('pgn-band pgn-gap'); // height comes from the --pgn-gap CSS var
}

function makeFill(px: number): HTMLDivElement {
  const el = div('pgn-fill');
  el.style.height = `${Math.max(0, px)}px`;
  return el;
}

/** Wrap a set of band children into one non-editable widget container. */
function container(children: HTMLElement[]): HTMLDivElement {
  const wrap = div('pgn-break');
  wrap.contentEditable = 'false';
  wrap.setAttribute('aria-hidden', 'true');
  for (const c of children) wrap.appendChild(c);
  return wrap;
}

function widget(pos: number, dom: HTMLElement, side: number, key: string): Decoration {
  // `key` lets ProseMirror reuse the DOM across recomputes when unchanged,
  // which prevents flicker during rapid typing near a boundary.
  // `ignoreSelection` keeps caret math from treating the widget as content.
  return Decoration.widget(pos, dom, { side, key, ignoreSelection: true });
}

/**
 * Build the full DecorationSet for the current doc + breaks.
 *
 * Per page transition we emit: [fill → footer(prev) → gap → header(next)].
 * The very first page gets a leading header band (its top margin); the very
 * last page gets a trailing fill + footer band (its bottom margin).
 */
export function buildDecorations(
  doc: PMNode,
  breaks: PageBreak[],
  ctx: DecorationContext,
): DecorationSet {
  // Guard: only meaningful in the browser (called from the plugin view).
  if (typeof document === 'undefined') return DecorationSet.empty;

  const { dims } = ctx;
  const decos: Decoration[] = [];

  // Leading band = page 1's top margin (+ optional header).
  decos.push(
    widget(0, container([makeHF('header', dims.mt, ctx.header, 1, ctx)]), -1, 'pgn-lead'),
  );

  // Between-page transitions.
  for (const br of breaks) {
    const bands = [
      makeHF('footer', dims.mb, ctx.footer, br.page, ctx),
      makeGap(),
      makeHF('header', dims.mt, ctx.header, br.page + 1, ctx),
    ];
    // A mid-list break widget lands INSIDE the <ol> (before an <li>), so the
    // full-bleed bands must also cancel the list's left padding (one --docs-list-pad
    // per nesting level). The fill stays within the list content box — its width
    // is irrelevant, it only reserves vertical space.
    if (br.depth > 0) {
      for (const band of bands) {
        band.style.marginLeft = `calc(-1 * var(--pgn-ml) - ${br.depth} * var(--docs-list-pad, 26px))`;
      }
    }
    const dom = container([makeFill(br.filler), ...bands]);
    // `side: -1` places the break immediately before the block that starts the
    // next page. Keyed by page + filler (+ depth) so unchanged breaks reuse DOM.
    decos.push(widget(br.pos, dom, -1, `pgn-brk-${br.page}-${br.depth}-${Math.round(br.filler)}`));
  }

  // Trailing band = last page's remaining fill + bottom margin (+ optional footer).
  const end = doc.content.size;
  decos.push(
    widget(
      end,
      container([
        makeFill(ctx.lastPageFiller),
        makeHF('footer', dims.mb, ctx.footer, ctx.pageCount, ctx),
      ]),
      1,
      `pgn-tail-${ctx.pageCount}-${Math.round(ctx.lastPageFiller)}`,
    ),
  );

  return DecorationSet.create(doc, decos);
}
