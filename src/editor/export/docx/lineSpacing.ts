/**
 * Line-height ⇄ Word line-spacing mapping — the single, explicit source of the
 * DOCX line-spacing convention (previously absent/lossy).
 *
 * Editor convention: UNITLESS multipliers (the block's `lineHeight` attr, e.g.
 * "1.5"). Word expresses spacing in 240ths of a line for AUTO, or in twips for
 * EXACT/AT_LEAST.
 *
 *   multiplier m  →  { line: round(m × 240), lineRule: AUTO }
 *     1.0 → 240 · 1.15 → 276 · 1.5 → 360 · 2.0 → 480   (Word "single" = 240)
 *
 *   explicit length (px/pt) →  { line: <twips>, lineRule: EXACT }
 *     pt → twips × 20 ; px → pt (×0.75) → twips
 *
 * Lossy points: EXACT spacing smaller than the font can clip lines (Word does
 * the same); AUTO multipliers are exact.
 */
import { LineRuleType } from 'docx';

export type DocxLineSpacing = {
  line: number;
  lineRule: (typeof LineRuleType)[keyof typeof LineRuleType];
};

/** Word's "single" line = 240 (twentieths of a line). */
export const WORD_SINGLE_LINE = 240;

/**
 * Paragraph space-before / space-after (a "<n>pt"/"<n>px" length or number of
 * points) → Word twips (1pt = 20 twips; 12pt = 240). null when unset/invalid.
 */
export function spacePtToTwips(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  let pt: number;
  if (typeof value === 'number') {
    pt = value;
  } else {
    const m = /^([\d.]+)(px|pt)?$/.exec(value.trim().toLowerCase());
    if (!m) return null;
    const n = parseFloat(m[1]!);
    if (!Number.isFinite(n)) return null;
    pt = m[2] === 'px' ? n * 0.75 : n;
  }
  return Number.isFinite(pt) && pt >= 0 ? Math.round(pt * 20) : null;
}

/**
 * Map a block's `lineHeight` attribute to a docx `spacing` object, or `null`
 * when there's no explicit value (inherit Word's default).
 */
export function lineHeightToSpacing(value: string | number | null | undefined): DocxLineSpacing | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0
      ? { line: Math.round(value * WORD_SINGLE_LINE), lineRule: LineRuleType.AUTO }
      : null;
  }
  const raw = value.trim().toLowerCase();
  const len = /^([\d.]+)(px|pt)$/.exec(raw);
  if (len) {
    const n = parseFloat(len[1]!);
    if (!Number.isFinite(n) || n <= 0) return null;
    const pt = len[2] === 'px' ? n * 0.75 : n;
    return { line: Math.round(pt * 20), lineRule: LineRuleType.EXACT };
  }
  const mult = parseFloat(raw);
  if (!Number.isFinite(mult) || mult <= 0 || !/^[\d.]+$/.test(raw)) return null;
  return { line: Math.round(mult * WORD_SINGLE_LINE), lineRule: LineRuleType.AUTO };
}

/**
 * Reverse map — Word line-spacing back to a `lineHeight` attribute string.
 * AUTO → unitless multiplier (line ÷ 240); EXACT/AT_LEAST → "<pt>pt".
 *
 * NOTE: not wired into an import pipeline (no DOCX importer exists yet). HTML /
 * paste "import" is handled by the extension's `parseHTML`. Kept + tested so a
 * future importer has a verified inverse of `lineHeightToSpacing`.
 */
export function spacingToLineHeight(spacing: Partial<DocxLineSpacing> | null | undefined): string | null {
  if (!spacing || spacing.line == null || !Number.isFinite(spacing.line) || spacing.line <= 0) return null;
  const rule = spacing.lineRule ?? LineRuleType.AUTO;
  if (rule === LineRuleType.AUTO) {
    return String(Math.round((spacing.line / WORD_SINGLE_LINE) * 100) / 100);
  }
  // EXACT / EXACTLY / AT_LEAST: twips → pt.
  return `${Math.round((spacing.line / 20) * 100) / 100}pt`;
}
