import { describe, expect, it } from 'vitest';
import { StepMap } from '@tiptap/pm/transform';
import { ChangeRegistry } from '../src/editor/changeRegistry';
import type { ProposedChange } from '../src/types';

function mk(id: string, from: number, to: number): ProposedChange {
  return { id, anchor: { from, to }, insertion: 'x', rationale: '' };
}

describe('position remapping after document edits', () => {
  it('shifts anchors located after an insertion', () => {
    const r = new ChangeRegistry();
    r.add(mk('a', 10, 20));
    r.add(mk('b', 2, 5));

    // Insert 5 units of content at position 6.
    const map = new StepMap([6, 0, 5]);
    r.remap(map);

    // "a" is entirely after the insertion -> +5.
    expect(r.get('a')!.live).toEqual({ from: 15, to: 25 });
    // "b" is entirely before the insertion -> unchanged.
    expect(r.get('b')!.live).toEqual({ from: 2, to: 5 });
  });

  it('contracts anchors after a deletion', () => {
    const r = new ChangeRegistry();
    r.add(mk('a', 30, 40));

    // Delete 4 units starting at position 10.
    const map = new StepMap([10, 4, 0]);
    r.remap(map);

    expect(r.get('a')!.live).toEqual({ from: 26, to: 36 });
  });

  it('composes across several sequential edits', () => {
    const r = new ChangeRegistry();
    r.add(mk('a', 50, 60));

    r.remap(new StepMap([0, 0, 10])); // +10 before everything -> 60..70
    r.remap(new StepMap([65, 5, 0])); // delete 5 at 65 -> from 60 stays, to 70 -> 65

    expect(r.get('a')!.live.from).toBe(60);
    expect(r.get('a')!.live.to).toBe(65);
  });

  it('keeps the original anchor immutable while live tracks edits', () => {
    const r = new ChangeRegistry();
    r.add(mk('a', 10, 20));
    r.remap(new StepMap([0, 0, 3]));
    expect(r.get('a')!.anchor).toEqual({ from: 10, to: 20 }); // untouched
    expect(r.get('a')!.live).toEqual({ from: 13, to: 23 });
  });
});
