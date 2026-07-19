/**
 * DOCX font theme — the SINGLE source of truth for fonts in the export.
 *
 * The editor's fonts live in CSS (`--font-doc`, per-heading sizes), which the
 * exporter cannot read from `editor.getJSON()`. So we declare them explicitly
 * here, mirroring the editor's stylesheet, and resolve any CSS font (or stack)
 * to ONE Word-installed font name — Word can't parse "system-ui, sans-serif".
 *
 * Keep this in lockstep with `styles.css` (`.docs-page-content` body + h1–h4).
 * Do not scatter font names across converters — read them from here.
 */
import { fontSizeToHalfPoints } from './units';

export interface HeadingFont {
  /** Editor point size (Word-native; → half-points via fontSizeToHalfPoints). */
  sizePt: number;
  bold: boolean;
}

export interface DocxFontTheme {
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  /** Editor point body size. */
  bodySizePt: number;
  textColor: string; // hex, no '#'
  /** editor line-height (unitless) → docx line spacing. */
  lineHeight: number;
  /** paragraph space-after in px (editor paragraph margin-bottom). */
  paraAfterPx: number;
  headings: Record<1 | 2 | 3 | 4 | 5 | 6, HeadingFont>;
  /** Resolve an editor CSS font / stack → one Word font name. */
  cssFontToWord: Record<string, string>;
}

/** Mirrors styles.css: Georgia body @16px, bold Georgia headings, Courier code. */
export const DEFAULT_FONT_THEME: DocxFontTheme = {
  bodyFont: 'Georgia',
  headingFont: 'Georgia',
  monoFont: 'Courier New',
  bodySizePt: 12, // mirrors .docs-page-content font-size (12pt = 16px)
  textColor: '1A212B',
  lineHeight: 1.85,
  paraAfterPx: 16,
  headings: {
    1: { sizePt: 21, bold: true }, // 28px
    2: { sizePt: 18, bold: true }, // 24px
    3: { sizePt: 15, bold: true }, // 20px
    4: { sizePt: 12, bold: true }, // 16px
    5: { sizePt: 12, bold: true },
    6: { sizePt: 12, bold: true },
  },
  // Web/CSS fonts → a concrete Word-installed font.
  cssFontToWord: {
    georgia: 'Georgia',
    'times new roman': 'Times New Roman',
    times: 'Times New Roman',
    arial: 'Arial',
    helvetica: 'Arial',
    calibri: 'Calibri',
    'system-ui': 'Calibri', // not a real font → substitute
    '-apple-system': 'Calibri',
    'segoe ui': 'Segoe UI',
    roboto: 'Arial', // web font not in Word → substitute
    inter: 'Calibri', // web font not in Word → substitute
    serif: 'Georgia',
    'sans-serif': 'Arial',
    monospace: 'Courier New',
    'courier new': 'Courier New',
  },
};

/**
 * Resolve a CSS font value or stack to ONE Word font name. Takes the first
 * family in the stack; maps known web/CSS fonts to installed substitutes;
 * otherwise returns the (de-quoted) name as-is for Word to try.
 */
export function resolveWordFont(
  cssValue: string | null | undefined,
  theme: DocxFontTheme = DEFAULT_FONT_THEME,
): string | null {
  if (!cssValue) return null;
  const first = cssValue.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  if (!first) return null;
  const key = first.toLowerCase();
  if (theme.cssFontToWord[key]) return theme.cssFontToWord[key]!;
  return first; // an explicit, possibly-installed family name
}

/** CSS numeric font-weight → Word bold. ≥600 collapses to bold (documented). */
export function boldFromWeight(weight: number | string | null | undefined): boolean {
  if (weight == null) return false;
  if (weight === 'bold' || weight === 'bolder') return true;
  const n = typeof weight === 'number' ? weight : parseInt(weight, 10);
  return Number.isFinite(n) && n >= 600;
}

export function bodySizeHalfPoints(theme: DocxFontTheme = DEFAULT_FONT_THEME): number {
  return fontSizeToHalfPoints(theme.bodySizePt) ?? 24;
}
