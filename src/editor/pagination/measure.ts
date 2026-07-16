/**
 * DOM measurement. Isolated + side-effectful: it reads rendered geometry and
 * nothing else. Never assumes a node's height — always measures the real DOM.
 */
import type { EditorView } from '@tiptap/pm/view';
import type { BlockMetric } from './computeBreaks';

/**
 * Height of a single top-level block, in CSS px, INCLUDING its vertical margins.
 *
 * We deliberately use `offsetHeight + marginTop + marginBottom` rather than
 * `offsetTop`-differences: our own pagination widgets (page gaps, header/footer
 * bands) sit between blocks and would corrupt any offset-difference math. This
 * approach is independent of injected decorations.
 *
 * Tradeoff: adjacent block margins that *collapse* in CSS are counted twice
 * here, so multi-page estimates can run marginally short. At Bar A this is an
 * accepted approximation (documented in the README).
 */
function blockHeight(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const mt = parseFloat(cs.marginTop) || 0;
  const mb = parseFloat(cs.marginBottom) || 0;
  return el.offsetHeight + mt + mb;
}

/**
 * Measure every top-level block. `pos` is the position immediately before each
 * block (a valid block boundary for placing a widget decoration).
 */
export function measureBlocks(view: EditorView): BlockMetric[] {
  const metrics: BlockMetric[] = [];
  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    // nodeDOM can return a text node, an element, or null for some node types.
    // Anything we can't measure contributes 0 and will be corrected on the next
    // pass once it has a real box (e.g. an image that finishes loading).
    const height = dom instanceof HTMLElement ? blockHeight(dom) : 0;
    metrics.push({ pos: offset, height });
  });
  return metrics;
}

/**
 * Find media elements (images/video/iframe) inside the editor that have not
 * yet settled to a stable size, so the caller can re-paginate when they load.
 * Encourage authors to set explicit width/height on media to avoid this reflow.
 */
export function findUnsettledMedia(view: EditorView): HTMLElement[] {
  const out: HTMLElement[] = [];
  const nodes = view.dom.querySelectorAll<HTMLElement>('img, video, iframe');
  nodes.forEach((el) => {
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement;
      if (!img.complete || img.naturalHeight === 0) out.push(el);
    } else {
      out.push(el);
    }
  });
  return out;
}
