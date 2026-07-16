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
  /** Measured layout height in CSS px, margins included (see measure.ts). */
  height: number;
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
  let used = 0; // content-area height consumed on the current page
  let page = 1;

  for (const block of blocks) {
    // Break BEFORE this block when it would overflow the current page — but
    // only if the page already has content (`used > 0`). Never break before the
    // very first block on a page, otherwise a block taller than the page would
    // loop forever producing empty pages.
    //
    // Off-by-one: use strict `>` so content that fits *exactly* (used + height
    // === contentHeight) stays on the page rather than spilling to a new one.
    if (used > 0 && used + block.height > contentHeight) {
      breaks.push({
        pos: block.pos,
        page,
        filler: Math.max(0, contentHeight - used),
      });
      page += 1;
      used = 0;
    }

    used += block.height;

    // Tall-block case (Bar A): if this single block alone exceeds the page, it
    // now sits on its own page with `used > contentHeight`. We do NOT split it;
    // the *next* iteration will break after it (its filler clamps to 0). The
    // page simply grows taller than a normal page — the documented overflow.
  }

  return {
    breaks,
    pageCount: page,
    lastPageFiller: Math.max(0, contentHeight - used),
  };
}
