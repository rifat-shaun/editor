import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../src/editor/extensions/link';

describe('normalizeUrl', () => {
  it('keeps explicit schemes', () => {
    expect(normalizeUrl('https://a.com')).toBe('https://a.com');
    expect(normalizeUrl('http://a.com')).toBe('http://a.com');
    expect(normalizeUrl('mailto:x@y.com')).toBe('mailto:x@y.com');
    expect(normalizeUrl('tel:+15551234')).toBe('tel:+15551234');
  });

  it('trims whitespace', () => {
    expect(normalizeUrl('  https://a.com  ')).toBe('https://a.com');
  });

  it('accepts in-document anchors', () => {
    expect(normalizeUrl('#section-2')).toBe('#section-2');
  });

  it('upgrades a bare email to mailto:', () => {
    expect(normalizeUrl('jane@cognitus.com')).toBe('mailto:jane@cognitus.com');
  });

  it('prepends https:// for domain-like input', () => {
    expect(normalizeUrl('contracts.cognitus.com/msa-2025')).toBe('https://contracts.cognitus.com/msa-2025');
    expect(normalizeUrl('example.com')).toBe('https://example.com');
  });

  it('rejects empty / non-URL input (Apply stays disabled)', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl('just some words')).toBeNull();
    expect(normalizeUrl('nodot')).toBeNull();
  });
});
