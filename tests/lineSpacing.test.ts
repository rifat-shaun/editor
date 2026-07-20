import { describe, expect, it } from 'vitest';
import { LineRuleType } from 'docx';
import { lineHeightToSpacing, spacingToLineHeight, spacePtToTwips } from '../src/editor/export/docx/lineSpacing';

describe('lineHeightToSpacing — unitless multipliers → Word AUTO', () => {
  it.each([
    ['1', 240],
    ['1.0', 240],
    ['1.15', 276],
    ['1.5', 360],
    ['2', 480],
    ['2.0', 480],
  ])('%s → line %i (AUTO)', (value, line) => {
    expect(lineHeightToSpacing(value)).toEqual({ line, lineRule: LineRuleType.AUTO });
  });

  it('accepts a numeric multiplier', () => {
    expect(lineHeightToSpacing(1.5)).toEqual({ line: 360, lineRule: LineRuleType.AUTO });
  });

  it('maps explicit pt/px lengths to EXACT twips', () => {
    expect(lineHeightToSpacing('18pt')).toEqual({ line: 360, lineRule: LineRuleType.EXACT }); // 18 × 20
    expect(lineHeightToSpacing('24px')).toEqual({ line: 360, lineRule: LineRuleType.EXACT }); // 24×0.75=18pt → 360
  });

  it('returns null for unset/garbage', () => {
    expect(lineHeightToSpacing(null)).toBeNull();
    expect(lineHeightToSpacing('')).toBeNull();
    expect(lineHeightToSpacing('normal')).toBeNull();
    expect(lineHeightToSpacing('abc')).toBeNull();
    expect(lineHeightToSpacing(0)).toBeNull();
    expect(lineHeightToSpacing(-2)).toBeNull();
  });
});

describe('spacingToLineHeight — Word spacing → lineHeight (inverse)', () => {
  it.each([
    [240, '1'],
    [276, '1.15'],
    [360, '1.5'],
    [480, '2'],
  ])('AUTO line %i → %s', (line, expected) => {
    expect(spacingToLineHeight({ line, lineRule: LineRuleType.AUTO })).toBe(expected);
  });

  it('defaults to AUTO when no rule given', () => {
    expect(spacingToLineHeight({ line: 360 })).toBe('1.5');
  });

  it('EXACT/AT_LEAST twips → pt', () => {
    expect(spacingToLineHeight({ line: 360, lineRule: LineRuleType.EXACT })).toBe('18pt');
    expect(spacingToLineHeight({ line: 400, lineRule: LineRuleType.AT_LEAST })).toBe('20pt');
  });

  it('returns null for missing/invalid line', () => {
    expect(spacingToLineHeight(null)).toBeNull();
    expect(spacingToLineHeight({ line: 0, lineRule: LineRuleType.AUTO })).toBeNull();
  });
});

describe('spacePtToTwips — paragraph space before/after → Word twips', () => {
  it.each([
    ['12pt', 240],
    ['6pt', 120],
    ['0pt', 0],
    ['16px', 240], // 16px → 12pt → 240
  ])('%s → %i twips', (value, twips) => {
    expect(spacePtToTwips(value)).toBe(twips);
  });
  it('accepts a bare point number', () => {
    expect(spacePtToTwips(12)).toBe(240);
    expect(spacePtToTwips(0)).toBe(0);
  });
  it('returns null for unset/negative/garbage', () => {
    expect(spacePtToTwips(null)).toBeNull();
    expect(spacePtToTwips('')).toBeNull();
    expect(spacePtToTwips(-4)).toBeNull();
    expect(spacePtToTwips('abc')).toBeNull();
  });
});
