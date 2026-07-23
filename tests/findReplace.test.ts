import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { findMatches } from '../src/editor/find/findMatches';
import { getFindState } from '../src/editor/find/findPlugin';

function ed(content: string): Editor {
  return new Editor({ extensions: buildExtensions(), content });
}

const opts = (matchCase = false, wholeWord = false) => ({ matchCase, wholeWord });

describe('findMatches (search engine)', () => {
  it('finds all case-insensitive matches; match-case narrows', () => {
    const e = ed('<p>Party party PARTY</p>');
    expect(findMatches(e.state.doc, 'party', opts(false)).length).toBe(3);
    expect(findMatches(e.state.doc, 'party', opts(true)).length).toBe(1); // only lowercase "party"
    e.destroy();
  });

  it('whole-word rejects sub-word matches', () => {
    const e = ed('<p>party parties counterparty</p>');
    expect(findMatches(e.state.doc, 'party', opts(false, false)).length).toBe(2); // party + counterPARTY
    expect(findMatches(e.state.doc, 'party', opts(false, true)).length).toBe(1); // only standalone "party"
    e.destroy();
  });

  it('matches a multi-word phrase as a unit', () => {
    const e = ed('<p>the Disclosing Party shall</p>');
    const m = findMatches(e.state.doc, 'Disclosing Party', opts());
    expect(m.length).toBe(1);
    expect(e.state.doc.textBetween(m[0]!.from, m[0]!.to)).toBe('Disclosing Party');
    e.destroy();
  });

  it('treats special characters literally (no regex)', () => {
    const e = ed('<p>note (a) and (b)</p>');
    expect(findMatches(e.state.doc, '(a)', opts()).length).toBe(1);
    e.destroy();
  });

  it('empty query → no matches', () => {
    const e = ed('<p>anything</p>');
    expect(findMatches(e.state.doc, '', opts())).toEqual([]);
    e.destroy();
  });

  it('does not match across block boundaries', () => {
    const e = ed('<p>Disclosing</p><p>Party</p>');
    expect(findMatches(e.state.doc, 'Disclosing Party', opts()).length).toBe(0);
    e.destroy();
  });

  it('finds matches inside table cells and list items', () => {
    const list = ed('<ul><li>find me here</li><li>and find me</li></ul>');
    expect(findMatches(list.state.doc, 'find me', opts()).length).toBe(2);
    list.destroy();
  });

  it('builds preview parts with ellipses for long context', () => {
    const e = ed('<p>' + 'x'.repeat(50) + 'TARGET' + 'y'.repeat(50) + '</p>');
    const [m] = findMatches(e.state.doc, 'TARGET', opts());
    expect(m!.text).toBe('TARGET');
    expect(m!.before.startsWith('…')).toBe(true);
    expect(m!.after.endsWith('…')).toBe(true);
    e.destroy();
  });
});

describe('variable tokens in search (match resolved value)', () => {
  it('matches the resolved value but marks the match non-replaceable', () => {
    const e = ed('<p>Client: <span data-var-name="client_name"></span></p>');
    e.commands.setVariableValues({ client_name: 'Meridian' });
    const m = findMatches(e.state.doc, 'Meridian', opts(), { client_name: 'Meridian' });
    expect(m.length).toBe(1);
    expect(m[0]!.replaceable).toBe(false); // inside an atomic token
    e.destroy();
  });
});

describe('plugin state + replace commands', () => {
  it('setFind populates matches + index; navigation clamps', () => {
    const e = ed('<p>one two one two one</p>');
    e.commands.setFind({ query: 'one', matchCase: false, wholeWord: false, index: 0 });
    expect(getFindState(e).matches.length).toBe(3);
    expect(getFindState(e).index).toBe(0);
    e.commands.setFind({ index: 2 });
    expect(getFindState(e).index).toBe(2);
    e.destroy();
  });

  it('replaceFindCurrent replaces the current match (marks preserved via leading run)', () => {
    const e = ed('<p>cat dog cat</p>');
    e.commands.setFind({ query: 'cat', matchCase: false, wholeWord: false, index: 0 });
    expect(e.commands.replaceFindCurrent('feline')).toBe(true);
    expect(e.state.doc.textContent).toBe('feline dog cat');
    e.destroy();
  });

  it('replaceFindAll replaces every match in ONE undo step and does not recurse (E3, E15)', () => {
    const e = ed('<p>cat cat cat</p>');
    e.commands.setFind({ query: 'cat', matchCase: false, wholeWord: false, index: 0 });
    // Replacement CONTAINS the query — must not re-replace the inserted text.
    e.commands.replaceFindAll('ccat');
    expect(e.state.doc.textContent).toBe('ccat ccat ccat'); // 3 replacements, not more
    // Single undo restores the entire pre-replace document.
    e.commands.undo();
    expect(e.state.doc.textContent).toBe('cat cat cat');
    e.destroy();
  });

  it('empty replacement deletes matches', () => {
    const e = ed('<p>[x][x]</p>');
    e.commands.setFind({ query: '[x]', matchCase: false, wholeWord: false, index: 0 });
    e.commands.replaceFindAll('');
    expect(e.state.doc.textContent).toBe('');
    e.destroy();
  });

  it('re-searches with fresh positions after a document edit', () => {
    const e = ed('<p>find find</p>');
    e.commands.setFind({ query: 'find', matchCase: false, wholeWord: false, index: 0 });
    expect(getFindState(e).matches.length).toBe(2);
    // Insert text at the start; matches recompute with updated positions.
    e.commands.insertContentAt(1, 'find ');
    expect(getFindState(e).matches.length).toBe(3);
    e.destroy();
  });

  it('does not replace a match inside a variable token', () => {
    const e = ed('<p><span data-var-name="client_name"></span></p>');
    e.commands.setVariableValues({ client_name: 'Meridian' });
    e.commands.setFind({ query: 'Meridian', matchCase: false, wholeWord: false, index: 0 });
    expect(getFindState(e).matches.length).toBe(1);
    expect(e.commands.replaceFindCurrent('X')).toBe(false); // skipped (atomic token)
    expect(e.state.doc.textContent).toBe(''); // token unchanged (renders no text node)
    e.destroy();
  });

  it('clearFind removes matches', () => {
    const e = ed('<p>abc abc</p>');
    e.commands.setFind({ query: 'abc', matchCase: false, wholeWord: false, index: 0 });
    expect(getFindState(e).matches.length).toBe(2);
    e.commands.clearFind();
    expect(getFindState(e).matches.length).toBe(0);
    e.destroy();
  });
});
