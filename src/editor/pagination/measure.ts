/**
 * DOM measurement. Isolated + side-effectful: it reads rendered geometry and
 * nothing else. Never assumes a node's height — always measures the real DOM.
 */
import type { EditorView } from '@tiptap/pm/view';
import type { BlockMetric } from './computeBreaks';

/**
 * Measure a block's border-box height and its vertical margins SEPARATELY.
 *
 * We report margins separately (rather than folding them into the height) so
 * `computeBreaks` can apply CSS margin-collapsing correctly: adjacent block
 * margins collapse to their max, so summing `offsetHeight + mt + mb` per block
 * would double-count the collapsed gap and make pages run short. Measuring the
 * box + margins here, and collapsing in the pure module, keeps the editor and
 * the print renderer pixel-consistent.
 *
 * We deliberately avoid `offsetTop`-differences: our own pagination widgets
 * (gaps, header/footer bands) sit between blocks and would corrupt that math.
 */
function measureBlock(el: HTMLElement): { height: number; marginTop: number; marginBottom: number } {
  const cs = getComputedStyle(el);
  return {
    height: el.offsetHeight,
    marginTop: parseFloat(cs.marginTop) || 0,
    marginBottom: parseFloat(cs.marginBottom) || 0,
  };
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
    if (dom instanceof HTMLElement) {
      metrics.push({ pos: offset, ...measureBlock(dom) });
    } else {
      metrics.push({ pos: offset, height: 0, marginTop: 0, marginBottom: 0 });
    }
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
