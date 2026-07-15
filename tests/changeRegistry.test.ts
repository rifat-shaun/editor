import { describe, expect, it } from 'vitest';
import { ChangeRegistry } from '../src/editor/changeRegistry';
import type { ProposedChange } from '../src/types';

function mk(id: string, over: Partial<ProposedChange> = {}): ProposedChange {
  return {
    id,
    anchor: { from: 10, to: 20 },
    deletion: 'old',
    insertion: 'new',
    rationale: 'because',
    ...over,
  };
}

describe('ChangeRegistry — accept / reject / undo', () => {
  it('adds changes as pending and derives kind', () => {
    const r = new ChangeRegistry();
    r.add(mk('a'));
    r.add(mk('b', { deletion: undefined }));
    r.add(mk('c', { insertion: undefined }));

    expect(r.counts()).toEqual({ pending: 3, accepted: 0, rejected: 0, total: 3 });
    expect(r.get('a')?.kind).toBe('replacement');
    expect(r.get('b')?.kind).toBe('insertion');
    expect(r.get('c')?.kind).toBe('deletion');
    expect(r.get('a')?.status).toBe('pending');
  });

  it('accepts and rejects individual changes', () => {
    const r = new ChangeRegistry();
    r.add(mk('a'));
    r.add(mk('b'));

    expect(r.accept('a')).toBe(true);
    expect(r.reject('b')).toBe(true);
    expect(r.counts()).toEqual({ pending: 0, accepted: 1, rejected: 1, total: 2 });

    // Re-resolving the same status is a no-op.
    expect(r.accept('a')).toBe(false);
  });

  it('accepts / rejects all remaining pending', () => {
    const r = new ChangeRegistry();
    r.add(mk('a'));
    r.add(mk('b'));
    r.add(mk('c'));
    r.reject('b');

    const accepted = r.acceptAll();
    expect(accepted.sort()).toEqual(['a', 'c']);
    expect(r.counts()).toEqual({ pending: 0, accepted: 2, rejected: 1, total: 3 });
  });

  it('undoes the most recent resolution in LIFO order', () => {
    const r = new ChangeRegistry();
    r.add(mk('a'));
    r.add(mk('b'));

    r.accept('a');
    r.reject('b');
    expect(r.canUndo()).toBe(true);

    expect(r.undo()).toBe('b');
    expect(r.get('b')?.status).toBe('pending');

    expect(r.undo()).toBe('a');
    expect(r.get('a')?.status).toBe('pending');

    expect(r.undo()).toBeNull();
    expect(r.canUndo()).toBe(false);
  });

  it('undoes acceptAll back to pending', () => {
    const r = new ChangeRegistry();
    r.add(mk('a'));
    r.add(mk('b'));
    r.acceptAll();
    expect(r.counts().accepted).toBe(2);

    r.undo();
    r.undo();
    expect(r.counts().pending).toBe(2);
  });

  it('navigates pending changes with wrap-around', () => {
    const r = new ChangeRegistry();
    r.add(mk('a'));
    r.add(mk('b'));
    r.add(mk('c'));

    expect(r.nextPending(null)).toBe('a');
    expect(r.nextPending('a')).toBe('b');
    expect(r.nextPending('c')).toBe('a'); // wraps
    expect(r.prevPending('a')).toBe('c'); // wraps

    r.reject('b');
    expect(r.nextPending('a')).toBe('c'); // skips resolved
  });

  it('notifies subscribers on mutation', () => {
    const r = new ChangeRegistry();
    let calls = 0;
    const off = r.subscribe(() => (calls += 1));
    r.add(mk('a'));
    r.accept('a');
    off();
    r.reject('a'); // no longer observed (already accepted anyway)
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
