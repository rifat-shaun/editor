/**
 * Page-setup geometry: the draft state model, paper/margin tables, and the
 * conversions that turn a `PageSetup` into the pagination engine's page format
 * (px @96dpi) + margins. Shared by the dialog, the doc-attr bridge, and the
 * live preview.
 */

export interface PageSetup {
  orientation: 'portrait' | 'landscape';
  paperSize: 'letter' | 'legal' | 'tabloid' | 'a4' | 'a3' | 'a5' | 'executive';
  margins: { top: number; right: number; bottom: number; left: number }; // inches
  marginPreset: 'normal' | 'narrow' | 'moderate' | 'wide' | null; // null = custom
}

export const DPI = 96;

export type PaperKey = PageSetup['paperSize'];

/** Paper sizes in CSS px @96dpi (portrait: width × height). */
export const PAPER_SIZES: Record<PaperKey, { label: string; dim: string; w: number; h: number }> = {
  letter: { label: 'Letter', dim: '8.5" × 11"', w: 816, h: 1056 },
  legal: { label: 'Legal', dim: '8.5" × 14"', w: 816, h: 1344 },
  tabloid: { label: 'Tabloid', dim: '11" × 17"', w: 1056, h: 1632 },
  a4: { label: 'A4', dim: '210 × 297 mm', w: 794, h: 1123 },
  a3: { label: 'A3', dim: '297 × 420 mm', w: 1123, h: 1587 },
  a5: { label: 'A5', dim: '148 × 210 mm', w: 559, h: 794 },
  executive: { label: 'Executive', dim: '7.25" × 10.5"', w: 696, h: 1008 },
};

export const PAPER_ORDER: PaperKey[] = ['letter', 'legal', 'tabloid', 'a4', 'a3', 'a5', 'executive'];

export type MarginPresetKey = 'normal' | 'narrow' | 'moderate' | 'wide';

/** Margin presets in INCHES (top / right / bottom / left). */
export const MARGIN_PRESETS: Record<MarginPresetKey, PageSetup['margins']> = {
  normal: { top: 1, right: 1, bottom: 1, left: 1 },
  narrow: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  moderate: { top: 1, right: 0.75, bottom: 1, left: 0.75 },
  wide: { top: 1, right: 1.5, bottom: 1, left: 1.5 },
};

export const MARGIN_PRESET_ORDER: MarginPresetKey[] = ['normal', 'narrow', 'moderate', 'wide'];

export const DEFAULT_PAGE_SETUP: PageSetup = {
  orientation: 'portrait',
  paperSize: 'letter',
  margins: { ...MARGIN_PRESETS.normal },
  marginPreset: 'normal',
};

export const MIN_MARGIN_IN = 0.25;

/** The preset whose margins exactly match, or null (custom). */
export function matchMarginPreset(m: PageSetup['margins']): MarginPresetKey | null {
  for (const key of MARGIN_PRESET_ORDER) {
    const p = MARGIN_PRESETS[key];
    if (p.top === m.top && p.right === m.right && p.bottom === m.bottom && p.left === m.left) return key;
  }
  return null;
}

/** Portrait base size (px) for the chosen paper. */
function basePx(setup: PageSetup): { w: number; h: number } {
  const s = PAPER_SIZES[setup.paperSize];
  return { w: s.w, h: s.h };
}

/** Page size in px, orientation applied (landscape swaps w/h). */
export function pagePx(setup: PageSetup): { width: number; height: number } {
  const { w, h } = basePx(setup);
  return setup.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
}

/** Margins in px for the pagination engine. */
export function marginsPx(setup: PageSetup): { top: number; right: number; bottom: number; left: number } {
  const { top, right, bottom, left } = setup.margins;
  return {
    top: Math.round(top * DPI),
    right: Math.round(right * DPI),
    bottom: Math.round(bottom * DPI),
    left: Math.round(left * DPI),
  };
}

/** Everything the pagination commands need. */
export function resolveGeometry(setup: PageSetup) {
  return { pageFormat: pagePx(setup), margins: marginsPx(setup) };
}

/** Max allowed margin (inches) for a side = half the page dimension it eats into. */
export function maxMargin(setup: PageSetup, side: keyof PageSetup['margins']): number {
  const { width, height } = pagePx(setup);
  const dimIn = (side === 'top' || side === 'bottom' ? height : width) / DPI;
  return Math.round((dimIn / 2) * 10) / 10;
}

/** Two caption lines for the preview. */
export function captionLines(setup: PageSetup): [string, string] {
  const paper = PAPER_SIZES[setup.paperSize].label;
  const orient = setup.orientation === 'landscape' ? 'Landscape' : 'Portrait';
  const m = setup.margins;
  const uniform = m.top === m.right && m.right === m.bottom && m.bottom === m.left;
  const summary = uniform ? `${m.top.toFixed(1)}" margins` : 'Custom margins';
  return [`${paper} · ${orient}`, summary];
}
