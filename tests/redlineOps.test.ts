import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { buildExtensions } from '../src/editor/extensionsList';
import { applyRedline, markRanges, resolveRedline } from '../src/editor/redlineOps';
import type { RegistryChange } from '../src/types';

function makeEditor(text: string) {
  return new Editor({
    extensions: buildExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
}

function locate(doc: PMNode, phrase: string) {
  let hit: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (!hit && node.isText && node.text) {
      const idx = node.text.indexOf(phrase);
      if (idx >= 0) hit = { from: pos + idx, to: pos + idx + phrase.length };
    }
    return true;
  });
  return hit!;
}

function asChange(id: string): RegistryChange {
  return {
    id,
    anchor: { from: 0, to: 0 },
    rationale: '',
    kind: 'replacement',
    status: 'pending',
    live: { from: 0, to: 0 },
  };
}

describe('redline ops — apply then resolve to clean text', () => {
  it('applies a replacement as marked del + inserted ins without losing either', () => {
    const ed = makeEditor('The quick brown fox');
    const r = locate(ed.state.doc, 'quick');
    applyRedline(ed, { changeId: 'x', from: r.from, to: r.to, deletion: 'quick', insertion: 'swift' });

    expect(ed.state.doc.textContent).toBe('The quickswift brown fox');
    expect(markRanges(ed.state.doc, 'deletion', 'x')).toHaveLength(1);
    expect(markRanges(ed.state.doc, 'insertion', 'x')).toHaveLength(1);
    ed.destroy();
  });

  it('accept removes the deletion and keeps the insertion', () => {
    const ed = makeEditor('The quick brown fox');
    const r = locate(ed.state.doc, 'quick');
    applyRedline(ed, { changeId: 'x', from: r.from, to: r.to, deletion: 'quick', insertion: 'swift' });

    resolveRedline(ed, asChange('x'), 'accept');
    expect(ed.state.doc.textContent).toBe('The swift brown fox');
    expect(markRanges(ed.state.doc, 'deletion', 'x')).toHaveLength(0);
    expect(markRanges(ed.state.doc, 'insertion', 'x')).toHaveLength(0);
    ed.destroy();
  });

  it('reject removes the insertion and restores the original', () => {
    const ed = makeEditor('The quick brown fox');
    const r = locate(ed.state.doc, 'quick');
    applyRedline(ed, { changeId: 'x', from: r.from, to: r.to, deletion: 'quick', insertion: 'swift' });

    resolveRedline(ed, asChange('x'), 'reject');
    expect(ed.state.doc.textContent).toBe('The quick brown fox');
    expect(markRanges(ed.state.doc, 'deletion', 'x')).toHaveLength(0);
    ed.destroy();
  });

  it('handles a pure insertion (accept keeps it, reject drops it)', () => {
    const ed = makeEditor('Governing law applies.');
    const anchor = ed.state.doc.content.size - 1; // end of paragraph text
    applyRedline(ed, { changeId: 'y', from: anchor, to: anchor, insertion: ' See §4.' });
    expect(ed.state.doc.textContent).toContain('See §4.');

    resolveRedline(ed, asChange('y'), 'reject');
    expect(ed.state.doc.textContent).toBe('Governing law applies.');
    ed.destroy();
  });

  it('resolving one change leaves an unrelated change intact', () => {
    const ed = makeEditor('alpha beta gamma');
    const a = locate(ed.state.doc, 'alpha');
    applyRedline(ed, { changeId: 'a', from: a.from, to: a.to, deletion: 'alpha', insertion: 'ALPHA' });
    const g = locate(ed.state.doc, 'gamma');
    applyRedline(ed, { changeId: 'g', from: g.from, to: g.to, deletion: 'gamma', insertion: 'GAMMA' });

    resolveRedline(ed, asChange('a'), 'accept');
    // 'g' redline still present and resolvable.
    expect(markRanges(ed.state.doc, 'insertion', 'g').length).toBeGreaterThan(0);
    resolveRedline(ed, asChange('g'), 'accept');
    expect(ed.state.doc.textContent).toBe('ALPHA beta GAMMA');
    ed.destroy();
  });
});
