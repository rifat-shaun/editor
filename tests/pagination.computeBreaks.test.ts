import { describe, expect, it } from 'vitest';
import { computeBreaks, type BlockMetric } from '../src/editor/pagination/computeBreaks';

const PAGE = 1000; // content height for these tests

/** Helper: blocks of equal height at sequential positions. */
function blocks(heights: number[]): BlockMetric[] {
  let pos = 0;
  return heights.map((h) => {
    const b = { pos, height: h };
    pos += h + 1; // arbitrary spacing; only relative order matters
    return b;
  });
}

describe('computeBreaks — edge cases', () => {
  it('empty document → one page, no breaks', () => {
    const r = computeBreaks([], PAGE);
    expect(r.breaks).toEqual([]);
    expect(r.pageCount).toBe(1);
  });

  it('single short paragraph → one page, no breaks', () => {
    const r = computeBreaks(blocks([120]), PAGE);
    expect(r.breaks).toHaveLength(0);
    expect(r.pageCount).toBe(1);
    expect(r.lastPageFiller).toBe(PAGE - 120);
  });

  it('content exactly one page tall does NOT break (off-by-one boundary)', () => {
    const r = computeBreaks(blocks([400, 600]), PAGE); // sums to exactly 1000
    expect(r.breaks).toHaveLength(0);
    expect(r.pageCount).toBe(1);
    expect(r.lastPageFiller).toBe(0);
  });

  it('one px over a page boundary → exactly one break', () => {
    const r = computeBreaks(blocks([400, 601]), PAGE); // 1001 total
    expect(r.breaks).toHaveLength(1);
    expect(r.pageCount).toBe(2);
    // Break falls before the 2nd block; ending page had 400 used.
    expect(r.breaks[0]!.page).toBe(1);
    expect(r.breaks[0]!.filler).toBe(PAGE - 400);
    expect(r.breaks[0]!.pos).toBe(blocks([400, 601])[1]!.pos);
  });

  it('a block taller than a full page overflows on its own page (no split)', () => {
    // 1500px block cannot fit. It gets its own page and overflows.
    const r = computeBreaks(blocks([200, 1500, 200]), PAGE);
    // page1: [200] then 1500 would overflow -> break before it.
    // page2: [1500] overflow; next 200 overflows -> break before it.
    // page3: [200].
    expect(r.pageCount).toBe(3);
    expect(r.breaks).toHaveLength(2);
    // The overflowing page yields zero filler (used already exceeds page).
    expect(r.breaks[1]!.filler).toBe(0);
  });

  it('never loops on a document that is entirely one giant block', () => {
    const r = computeBreaks(blocks([9999]), PAGE);
    expect(r.pageCount).toBe(1);
    expect(r.breaks).toHaveLength(0);
  });

  it('fills multiple pages with uniform blocks', () => {
    // 10 blocks of 300 → 3 per page (900 ≤ 1000, 1200 > 1000).
    const r = computeBreaks(blocks(Array(10).fill(300)), PAGE);
    expect(r.pageCount).toBe(4); // 3,3,3,1
    expect(r.breaks.map((b) => b.page)).toEqual([1, 2, 3]);
    expect(r.breaks.every((b) => b.filler === PAGE - 900)).toBe(true);
  });

  it('degenerate contentHeight (≤ 0) → single page, no breaks', () => {
    const r = computeBreaks(blocks([100, 200]), 0);
    expect(r.breaks).toEqual([]);
    expect(r.pageCount).toBe(1);
  });

  it('is a pure function (no mutation of input)', () => {
    const input = blocks([400, 700, 100]);
    const snapshot = JSON.parse(JSON.stringify(input));
    computeBreaks(input, PAGE);
    expect(input).toEqual(snapshot);
  });

  it('break positions correspond to real block boundaries', () => {
    const bs = blocks([500, 500, 500]);
    const r = computeBreaks(bs, PAGE);
    for (const b of r.breaks) {
      expect(bs.some((blk) => blk.pos === b.pos)).toBe(true);
    }
  });
});
