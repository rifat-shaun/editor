import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { transformMsoLists, buildListFromText } from '../src/editor/extensions/listPaste';

const schema = new Editor({ extensions: buildExtensions() }).schema;

describe('transformMsoLists — Word/Outlook paste', () => {
  const mso = (marker: string, level: number, text: string) =>
    `<p class=MsoListParagraph style='mso-list:l0 level${level} lfo1'>` +
    `<span style='mso-list:Ignore'>${marker}</span>${text}</p>`;

  it('rebuilds a real <ol> and drops the literal marker', () => {
    const out = transformMsoLists(mso('1.', 1, 'First') + mso('2.', 1, 'Second'));
    expect(out).toMatch(/<ol[\s>]/i);
    expect(out).toMatch(/<li>\s*First\s*<\/li>/i);
    expect(out).not.toMatch(/mso-list/i);
  });

  it('detects bullets vs numbers from the marker', () => {
    expect(transformMsoLists(mso('·', 1, 'a') + mso('·', 1, 'b'))).toMatch(/<ul[\s>]/i);
    expect(transformMsoLists(mso('a)', 1, 'x') + mso('a)', 1, 'y'))).toMatch(/<ol[\s>]/i);
  });

  it('nests level-2 items inside the parent item', () => {
    const out = transformMsoLists(
      mso('1.', 1, 'Parent') + mso('a.', 2, 'Child a') + mso('b.', 2, 'Child b'),
    );
    // A nested <ol> appears inside an <li> (the parent), i.e. an <ol> after <li> text.
    expect(out).toMatch(/<li>\s*Parent\s*<ol>/i);
    expect((out.match(/<ol[\s>]/gi) ?? []).length).toBe(2);
  });

  it('carries an inferred definition on the rebuilt list', () => {
    const out = transformMsoLists(mso('a)', 1, 'x') + mso('b)', 1, 'y'));
    expect(out).toMatch(/data-list-def-config=/i);
    expect(out).toMatch(/lowerAlpha/);
    expect(out).toMatch(/paren/);
  });

  it('leaves non-Word HTML untouched', () => {
    const html = '<p>hello</p><ul><li>x</li></ul>';
    expect(transformMsoLists(html)).toBe(html);
  });
});

describe('buildListFromText — plain-text paste', () => {
  const items = (n: import('@tiptap/pm/model').Node) =>
    n.children.map((c) => c.textContent);

  it('numbered lines → orderedList', () => {
    const n = buildListFromText(schema, '1. One\n2. Two\n3. Three');
    expect(n?.type.name).toBe('orderedList');
    expect(items(n!)).toEqual(['One', 'Two', 'Three']);
  });

  it('paren / letter markers also count as ordered', () => {
    const n = buildListFromText(schema, 'a) Apple\nb) Banana');
    expect(n?.type.name).toBe('orderedList');
  });

  it('bullet lines → bulletList', () => {
    const n = buildListFromText(schema, '- apple\n- banana');
    expect(n?.type.name).toBe('bulletList');
    expect(items(n!)).toEqual(['apple', 'banana']);
  });

  it('non-list text returns null (pastes normally)', () => {
    expect(buildListFromText(schema, 'First sentence.\nSecond sentence.')).toBeNull();
  });

  it('a single list-looking line is not enough (avoids false positives)', () => {
    expect(buildListFromText(schema, '1. just one line')).toBeNull();
  });

  it('mixed list + prose returns null', () => {
    expect(buildListFromText(schema, '1. One\nnot a list line\n2. Two')).toBeNull();
  });
});
