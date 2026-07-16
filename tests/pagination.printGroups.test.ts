import { describe, expect, it } from 'vitest';
import { groupBlocksIntoPages } from '../src/editor/pagination/printLayout';

describe('groupBlocksIntoPages (pure)', () => {
  it('single page when there are no breaks', () => {
    expect(groupBlocksIntoPages([0, 5, 12, 20], [])).toEqual([[0, 1, 2, 3]]);
  });

  it('splits at each break position into block-index groups', () => {
    // Blocks at positions 0,5,12,20,28; new pages begin at 12 and 28.
    expect(groupBlocksIntoPages([0, 5, 12, 20, 28], [12, 28])).toEqual([
      [0, 1], // page 1: positions 0,5
      [2, 3], // page 2: positions 12,20
      [4], // page 3: position 28
    ]);
  });

  it('empty document → no pages', () => {
    expect(groupBlocksIntoPages([], [])).toEqual([]);
  });

  it('a break on the first block does not create a leading empty page', () => {
    // Defensive: even if a break coincides with the first block, page 1 is not
    // empty (mirrors computeBreaks, which never breaks before the first block).
    // Here only pos 8 splits (pos 0 is ignored, pos 16 is not a break).
    expect(groupBlocksIntoPages([0, 8, 16], [0, 8])).toEqual([[0], [1, 2]]);
  });

  it('page count equals breaks + 1', () => {
    const blocks = [0, 4, 8, 12, 16, 20];
    const breaks = [8, 16];
    const pages = groupBlocksIntoPages(blocks, breaks);
    expect(pages.length).toBe(breaks.length + 1);
    // Every block index appears exactly once, in order.
    expect(pages.flat()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
