import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { collectBreakUnits } from '../src/editor/pagination/measure';
import { computeBreaks, type BlockMetric } from '../src/editor/pagination/computeBreaks';

/**
 * These exercise the li-level break-unit collection (traversal, marker-glue,
 * nesting depth) and the depth passthrough in computeBreaks. Heights are 0
 * under jsdom (no layout), so we assert structure — unit count, positions, and
 * depth — which is layout-independent.
 */

function makeEditor(content: object) {
  return new Editor({ extensions: buildExtensions(), content });
}

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const li = (...blocks: object[]) => ({ type: 'listItem', content: blocks });

describe('collectBreakUnits — li-level break candidates', () => {
  it('emits one unit per list item, plus top-level blocks, with correct depth', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        p('intro'),
        {
          type: 'orderedList',
          content: [
            li(p('A')),
            li(p('B1'), p('B2')), // multi-block item → head + interior candidate
            li(
              p('C'),
              { type: 'orderedList', content: [li(p('C-a')), li(p('C-b'))] }, // nested → depth 2
            ),
          ],
        },
      ],
    });

    const units = collectBreakUnits(editor.view);
    // intro, A, B(head), B2, C(head), C-a, C-b
    expect(units.map((u) => u.depth ?? 0)).toEqual([0, 1, 1, 1, 1, 2, 2]);
    expect(units).toHaveLength(7);

    // Break positions are ascending and unique (valid boundaries).
    const pos = units.map((u) => u.pos);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(new Set(pos).size).toBe(pos.length);
    editor.destroy();
  });

  it('a plain document produces exactly the top-level blocks (no regression)', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [p('one'), p('two'), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] }],
    });
    const units = collectBreakUnits(editor.view);
    expect(units).toHaveLength(3);
    expect(units.every((u) => (u.depth ?? 0) === 0)).toBe(true);
    editor.destroy();
  });

  it('does not add a break candidate before an item\'s first block (marker stays glued)', () => {
    // A single item with two paragraphs → exactly 2 units (item head + 2nd para),
    // NOT 3 (no candidate before the first paragraph, which would orphan the marker).
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'orderedList', content: [li(p('first'), p('second'))] }],
    });
    const units = collectBreakUnits(editor.view);
    expect(units).toHaveLength(2);
    editor.destroy();
  });
});

describe('computeBreaks — depth passthrough for mid-list bands', () => {
  it('carries the starting unit\'s depth onto the break', () => {
    // Two units; the second (a list item, depth 1) overflows onto page 2.
    const units: BlockMetric[] = [
      { pos: 0, height: 600, marginTop: 0, marginBottom: 0, depth: 0 },
      { pos: 10, height: 600, marginTop: 0, marginBottom: 0, depth: 1 },
    ];
    const { breaks } = computeBreaks(units, 800);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ pos: 10, page: 1, depth: 1 });
  });

  it('still breaks cleanly between top-level blocks (depth 0)', () => {
    const units: BlockMetric[] = [
      { pos: 0, height: 500, depth: 0 },
      { pos: 5, height: 500, depth: 0 },
    ];
    const { breaks, pageCount } = computeBreaks(units, 800);
    expect(pageCount).toBe(2);
    expect(breaks[0]).toMatchObject({ pos: 5, depth: 0 });
  });
});

describe('manual page break — forced break point', () => {
  const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const doc = (...content: object[]) => new Editor({ extensions: buildExtensions(), content: { type: 'doc', content } });

  it('a pageBreak node forces the FOLLOWING unit onto a new page', () => {
    const ed = doc(p('A'), { type: 'pageBreak' }, p('B'));
    const units = collectBreakUnits(ed.view);
    expect(units).toHaveLength(2); // the break itself contributes no unit
    expect(units[0]!.forced).toBeFalsy();
    expect(units[1]!.forced).toBe(true);
    ed.destroy();
  });

  it('consecutive breaks collapse to one boundary (no empty page)', () => {
    const ed = doc(p('A'), { type: 'pageBreak' }, { type: 'pageBreak' }, p('B'));
    const units = collectBreakUnits(ed.view);
    expect(units).toHaveLength(2);
    expect(units.filter((u) => u.forced)).toHaveLength(1);
    ed.destroy();
  });

  it('a break before a list forces the list onto the new page', () => {
    const ed = doc(
      p('A'),
      { type: 'pageBreak' },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('item')] }] },
    );
    const units = collectBreakUnits(ed.view);
    expect(units[units.length - 1]!.forced).toBe(true);
    ed.destroy();
  });

  it('a trailing break produces no forced unit (no empty page)', () => {
    const ed = doc(p('A'), { type: 'pageBreak' });
    const units = collectBreakUnits(ed.view);
    expect(units).toHaveLength(1);
    expect(units.some((u) => u.forced)).toBe(false);
    ed.destroy();
  });

  it('computeBreaks starts a new page before a forced unit even if it fits', () => {
    const units: BlockMetric[] = [
      { pos: 0, height: 100, depth: 0 },
      { pos: 5, height: 100, depth: 0, forced: true },
    ];
    const { breaks, pageCount } = computeBreaks(units, 800);
    expect(pageCount).toBe(2);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ pos: 5, page: 1 });
  });

  it('a forced unit already at the top of a page does not add an empty page', () => {
    const units: BlockMetric[] = [{ pos: 0, height: 100, depth: 0, forced: true }];
    const { breaks, pageCount } = computeBreaks(units, 800);
    expect(breaks).toHaveLength(0);
    expect(pageCount).toBe(1);
  });
});
