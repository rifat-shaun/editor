import { describe, expect, it } from 'vitest';
import {
  parseMarker,
  inferStyle,
  inferDefinition,
} from '../src/editor/extensions/listNumbering/inference';

describe('parseMarker', () => {
  it('reads separators', () => {
    expect(parseMarker('1.')).toEqual({ segments: ['1'], separator: 'dot' });
    expect(parseMarker('a)')).toEqual({ segments: ['a'], separator: 'paren' });
    expect(parseMarker('(iv)')).toEqual({ segments: ['iv'], separator: 'parens' });
    expect(parseMarker('B')).toEqual({ segments: ['B'], separator: 'dot' }); // bare → dot
  });
  it('reads composite segments', () => {
    expect(parseMarker('1.1.')).toEqual({ segments: ['1', '1'], separator: 'dot' });
    expect(parseMarker('1.a')).toEqual({ segments: ['1', 'a'], separator: 'dot' });
  });
  it('rejects non-markers', () => {
    expect(parseMarker('')).toBeNull();
    expect(parseMarker('hello world')).toBeNull();
  });
});

describe('inferStyle — number style detection', () => {
  it('decimal / zero-padded', () => {
    expect(inferStyle(['1', '2', '10'])).toBe('decimal');
    expect(inferStyle(['01', '02', '03'])).toBe('decimalZero');
  });
  it('alpha', () => {
    expect(inferStyle(['a', 'b', 'c'])).toBe('lowerAlpha');
    expect(inferStyle(['A', 'B', 'C'])).toBe('upperAlpha');
  });
  it('roman', () => {
    expect(inferStyle(['i', 'ii', 'iii'])).toBe('lowerRoman');
    expect(inferStyle(['I', 'II', 'III', 'IV'])).toBe('upperRoman');
  });
  it('disambiguates roman-looking ALPHA sequences', () => {
    // c, d are valid romans but as a list they read alphabetic (after a, b).
    expect(inferStyle(['c', 'd'])).toBe('lowerAlpha');
    // i, j, k — j is not roman → alpha.
    expect(inferStyle(['i', 'j', 'k'])).toBe('lowerAlpha');
  });
  it('lone ambiguous marker: only "i" is roman', () => {
    expect(inferStyle(['i'])).toBe('lowerRoman');
    expect(inferStyle(['v'])).toBe('lowerAlpha');
    expect(inferStyle(['x'])).toBe('lowerAlpha');
  });
});

describe('inferDefinition — the requested scenario', () => {
  it('parent 1.2.3 / child a)b)c) / grandchild i,ii,iii → matching definition', () => {
    const def = inferDefinition(
      new Map([
        [1, ['1.', '2.', '3.']],
        [2, ['a)', 'b)', 'c)']],
        [3, ['i', 'ii', 'iii']],
      ]),
    );
    expect(def).toHaveLength(3);
    expect(def[0]).toMatchObject({ style: 'decimal', separator: 'dot', includeParent: false });
    expect(def[1]).toMatchObject({ style: 'lowerAlpha', separator: 'paren', includeParent: false });
    expect(def[2]).toMatchObject({ style: 'lowerRoman', includeParent: false });
  });

  it('legal composite: 1. / 1.1. / 1.2.1. → parent-inclusive', () => {
    const def = inferDefinition(
      new Map([
        [1, ['1.', '2.']],
        [2, ['1.1.', '1.2.']],
        [3, ['1.2.1.']],
      ]),
    );
    expect(def[0]).toMatchObject({ style: 'decimal', includeParent: false });
    expect(def[1]).toMatchObject({ style: 'decimal', includeParent: true });
    expect(def[2]).toMatchObject({ style: 'decimal', includeParent: true });
  });

  it('captures startAt and zero-padding', () => {
    const def = inferDefinition(new Map([[1, ['03.', '04.', '05.']]]));
    expect(def[0]).toMatchObject({ style: 'decimalZero', startAt: 3 });
  });

  it('fills gaps with the default cycle', () => {
    const def = inferDefinition(new Map([[1, ['A.']], [3, ['i']]])); // level 2 missing
    expect(def).toHaveLength(3);
    expect(def[0]).toMatchObject({ style: 'upperAlpha' });
    expect(def[2]).toMatchObject({ style: 'lowerRoman' });
  });
});
