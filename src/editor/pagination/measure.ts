/**
 * DOM measurement. Isolated + side-effectful: it reads rendered geometry and
 * nothing else. Never assumes a node's height — always measures the real DOM.
 */
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { BlockMetric } from './computeBreaks';

const LIST_TYPES = new Set(['orderedList', 'bulletList', 'taskList']);

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

/* ------------------------------------------------------------------ *
 * Fine-grained break units (li-level breaking).
 *
 * Unlike `measureBlocks` (top-level blocks only), this descends into lists and
 * emits one unit per list item — recursively, so nested items are break
 * candidates too. Each unit's `pos` is a legal break boundary; `computeBreaks`
 * treats the sequence exactly as before, so a list can now fill a page and
 * continue on the next. Two invariants keep it correct:
 *
 *  - Marker glue: the FIRST block inside a list item anchors its break at the
 *    item boundary (so a break never separates a marker from its first line);
 *    only the item's SECOND+ blocks (and nested lists) are interior candidates
 *    — this is what lets an over-tall multi-block item split internally.
 *  - No double counting: a unit's height is its OWN box (a leaf block), never a
 *    container's offsetHeight, so summing units equals the real content height.
 *
 * Numbering continuity is automatic: breaks are decorations and the <ol> stays
 * one node, so CSS counters keep incrementing across the inserted widget.
 * ------------------------------------------------------------------ */

function measureBox(view: EditorView, pos: number) {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) return measureBlock(dom);
  return { height: 0, marginTop: 0, marginBottom: 0 };
}

/** Push a unit, or FOLD it into the previous one when glued (collapsing margins). */
function add(out: BlockMetric[], unit: BlockMetric, glue: boolean): void {
  if (glue && out.length) {
    const last = out[out.length - 1]!;
    last.height += Math.max(0, (unit.marginTop ?? 0) - (last.marginBottom ?? 0)) + unit.height;
    last.marginBottom = unit.marginBottom;
  } else {
    out.push(unit);
  }
}

function emitNode(
  view: EditorView,
  node: PMNode,
  pos: number,
  out: BlockMetric[],
  depth: number,
  glue: boolean,
): void {
  if (LIST_TYPES.has(node.type.name)) {
    const listBox = measureBox(view, pos); // the list's own outer margins
    let cpos = pos + 1;
    const n = node.childCount;
    node.forEach((li, _off, i) => {
      emitListItem(
        view,
        li,
        cpos,
        out,
        depth + 1,
        glue && i === 0,
        i === 0 ? listBox.marginTop : 0,
        i === n - 1 ? listBox.marginBottom : 0,
      );
      cpos += li.nodeSize;
    });
    return;
  }
  add(out, { pos, depth, ...measureBox(view, pos) }, glue);
}

function emitListItem(
  view: EditorView,
  li: PMNode,
  liPos: number,
  out: BlockMetric[],
  depth: number,
  glue: boolean,
  extraTop: number,
  extraBottom: number,
): void {
  const liBox = measureBox(view, liPos); // used for its margins only (NOT height)
  const startLen = out.length;
  let cpos = liPos + 1;
  let first = true;
  li.forEach((child) => {
    if (LIST_TYPES.has(child.type.name)) {
      // Nested list: recurse. If it is the item's first child (no head text),
      // its first item glues to the item boundary.
      emitNode(view, child, cpos, out, depth, first ? glue : false);
    } else {
      const box = measureBox(view, cpos);
      // First block = the item "head": anchor the break at the ITEM boundary so
      // the marker travels with it. Later blocks are interior break candidates.
      add(
        out,
        {
          pos: first ? liPos : cpos,
          depth,
          height: box.height,
          marginTop: first ? liBox.marginTop : box.marginTop,
          marginBottom: box.marginBottom,
        },
        first ? glue : false,
      );
    }
    first = false;
    cpos += child.nodeSize;
  });
  // Fold the list wrapper's edge margins + the item's own bottom margin into the
  // first/last units this item produced.
  if (out.length > startLen) {
    out[startLen]!.marginTop = (out[startLen]!.marginTop ?? 0) + extraTop;
    const last = out[out.length - 1]!;
    last.marginBottom = (last.marginBottom ?? 0) + extraBottom + (liBox.marginBottom ?? 0);
  }
}

/**
 * Measure every break unit (top-level blocks + individual list items, nested).
 * Same shape as `measureBlocks` so `computeBreaks` is unchanged; `depth` lets
 * the decoration builder full-bleed bands past list padding.
 */
export function collectBreakUnits(view: EditorView): BlockMetric[] {
  const out: BlockMetric[] = [];
  let pos = 0;
  let forceNext = false; // an authored page-break node was just seen
  view.state.doc.forEach((node) => {
    if (node.type.name === 'pageBreak') {
      // The break itself contributes no unit/height; it forces the FOLLOWING
      // content onto a new page. Consecutive breaks collapse (one boundary, no
      // empty page); a trailing break has no following unit, so no empty page.
      forceNext = true;
      pos += node.nodeSize;
      return;
    }
    const before = out.length;
    emitNode(view, node, pos, out, 0, false);
    if (forceNext && out.length > before) {
      out[before]!.forced = true; // first unit this node produced starts the page
      forceNext = false;
    }
    pos += node.nodeSize;
  });
  return out;
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
