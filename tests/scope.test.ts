import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { findSectionRange, resolveScope } from '../src/lib/scope';
import type { HeadingMark } from '../src/lib/scope';

describe('findSectionRange (pure)', () => {
  const headings: HeadingMark[] = [
    { pos: 2, level: 2 },
    { pos: 40, level: 2 },
    { pos: 80, level: 3 },
  ];

  it('returns the enclosing section for a mid-section position', () => {
    expect(findSectionRange(headings, 50, 0, 120)).toEqual({ from: 40, to: 120 });
    expect(findSectionRange(headings, 10, 0, 120)).toEqual({ from: 2, to: 40 });
  });

  it('spans doc-start to the first heading when before any section', () => {
    expect(findSectionRange(headings, 1, 0, 120)).toEqual({ from: 0, to: 2 });
  });

  it('uses the whole document when there are no headings', () => {
    expect(findSectionRange([], 5, 0, 120)).toEqual({ from: 0, to: 120 });
  });

  it('ignores deeper sub-headings when computing section boundaries', () => {
    // The H3 at 80 does not start a new section; §2 (pos 40) runs to docEnd.
    expect(findSectionRange(headings, 90, 0, 120)).toEqual({ from: 40, to: 120 });
  });
});

describe('resolveScope (against a live editor state)', () => {
  function makeEditor() {
    return new Editor({
      extensions: buildExtensions(),
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'First body.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Beta' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second body.' }] },
        ],
      },
    });
  }

  it('document scope covers the full doc', () => {
    const ed = makeEditor();
    const s = resolveScope(ed.state, 'document');
    expect(s.from).toBe(0);
    expect(s.to).toBe(ed.state.doc.content.size);
    expect(s.text).toContain('Alpha');
    expect(s.text).toContain('Second body.');
    ed.destroy();
  });

  it('selection scope returns the selected text', () => {
    const ed = makeEditor();
    // Select within "First body." (paragraph starts after the first heading).
    ed.commands.setTextSelection({ from: 9, to: 14 });
    const s = resolveScope(ed.state, 'selection');
    expect(s.to).toBeGreaterThan(s.from);
    expect(s.text.length).toBeGreaterThan(0);
    ed.destroy();
  });

  it('section scope returns the enclosing section and a ref label', () => {
    const ed = makeEditor();
    // Put the caret inside the "Beta" section body.
    const betaBodyPos = ed.state.doc.content.size - 3;
    ed.commands.setTextSelection(betaBodyPos);
    const s = resolveScope(ed.state, 'section');
    expect(s.text).toContain('Beta');
    expect(s.text).toContain('Second body.');
    expect(s.text).not.toContain('Alpha');
    expect(s.sectionRef).toBe('Beta');
    ed.destroy();
  });
});
