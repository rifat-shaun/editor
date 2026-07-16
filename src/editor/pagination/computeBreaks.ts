/**
 * Pure break-computation. Given the measured heights of the top-level blocks
 * and the usable content height of a page, decide where page boundaries fall.
 *
 * This module has ZERO DOM dependency so it can be unit-tested in isolation and
 * (later) reused by an export/print renderer for editor↔print parity.
 *
 * Bar A contract: breaks fall only *between* top-level blocks. A single block
 * taller than a page is never split — it overflows its page (documented
 * caveat). The algorithm guarantees forward progress, so a tall block can never
 * cause an infinite loop.
 */

export interface BlockMetric {
  /** ProseMirror position immediately before the block (a block boundary). */
  pos: number;
  /** Border-box layout height in CSS px (offsetHeight — NO margins). */
  height: number;
  /** Top margin (px). Optional; defaults to 0. */
  marginTop?: number;
  /** Bottom margin (px). Optional; defaults to 0. */
  marginBottom?: number;
}

export interface PageBreak {
  /** Position of the block that starts the *next* page. */
  pos: number;
  /** 1-based index of the page that ENDS at this break. */
  page: number;
  /**
   * Empty content-area height left on the ending page — the decoration builder
   * renders this as filler so the next page starts exactly on a page boundary.
   * Clamped to 0 (a tall overflowing block yields no filler).
   */
  filler: number;
}

export interface ComputeBreaksResult {
  breaks: PageBreak[];
  pageCount: number;
  /** Filler for the final page (used by the trailing footer/bottom-margin widget). */
  lastPageFiller: number;
}

export function computeBreaks(
  blocks: BlockMetric[],
  contentHeight: number,
): ComputeBreaksResult {
  // Degenerate configs: cannot paginate meaningfully. One page, no breaks.
  if (contentHeight <= 0 || blocks.length === 0) {
    return {
      breaks: [],
      pageCount: 1,
      lastPageFiller: Math.max(0, contentHeight),
    };
  }

  const breaks: PageBreak[] = [];
  let used = 0; // content-area height consumed on the current page (incl. margins)
  let page = 1;
  let prevMarginBottom = 0; // bottom margin of the previous block ON THIS PAGE
  let hasBlock = false; // is there already a block on the current page?

  for (const block of blocks) {
    const h = block.height;
    const mt = block.marginTop ?? 0;
    const mb = block.marginBottom ?? 0;

    // Vertical space this block ADDS to the current page. Adjacent vertical
    // margins collapse to their max — since `used` already contains the previous
    // block's bottom margin, the extra top space is only `max(0, mt - prevMB)`.
    // The first block on a page contributes its full top margin (it sits below
    // the header band, which has no margin). `used` always includes the last
    // block's bottom margin, so the fill lands in exactly the on-screen spot.
    const add = (hasBlock ? Math.max(0, mt - prevMarginBottom) : mt) + h + mb;

    // Break BEFORE this block when it would overflow — but never before the
    // first block on a page (else a too-tall block loops forever). Strict `>`
    // keeps content that fits *exactly* on the page (no off-by-one break).
    if (hasBlock && used + add > contentHeight) {
      breaks.push({ pos: block.pos, page, filler: Math.max(0, contentHeight - used) });
      page += 1;
      // This block now starts the new page (first-on-page → full top margin).
      used = mt + h + mb;
      prevMarginBottom = mb;
      continue;
    }

    used += add;
    prevMarginBottom = mb;
    hasBlock = true;

    // Tall-block case (Bar A): a single block taller than the page sits on its
    // own page (used > contentHeight); the next iteration breaks after it (its
    // filler clamps to 0). We never split it — the documented overflow.
  }

  return {
    breaks,
    pageCount: page,
    lastPageFiller: Math.max(0, contentHeight - used),
  };
}
