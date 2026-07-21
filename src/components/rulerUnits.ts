/**
 * The single px ↔ measurement conversion, shared by the ruler and (via ×15)
 * the DOCX export. Base unit is CSS px @96dpi — the same unit the pagination
 * engine and indent attributes use.
 *
 *   1 inch = 96px = 1440 twips   →   1px = 15 twips
 *   1 cm   = 96/2.54 px ≈ 37.795px
 */
export type RulerUnit = 'in' | 'cm';

export const PX_PER_IN = 96;
export const PX_PER_CM = 96 / 2.54;
export const TWIPS_PER_PX = 1440 / 96; // 15

export function pxToTwips(pxValue: number): number {
  return Math.round(pxValue * TWIPS_PER_PX);
}

export function pxPerUnit(unit: RulerUnit): number {
  return unit === 'cm' ? PX_PER_CM : PX_PER_IN;
}

/** px → a short readout in the current unit, e.g. "1.5"" or "3.8 cm". */
export function formatMeasure(pxValue: number, unit: RulerUnit): string {
  const v = pxValue / pxPerUnit(unit);
  return unit === 'cm' ? `${(Math.round(v * 10) / 10).toFixed(1)} cm` : `${Math.round(v * 100) / 100}"`;
}

export interface TickSpec {
  minorPx: number; // spacing between minor ticks
  perMajor: number; // minor ticks per labeled major tick
  label: (majorIndex: number) => string; // label at each major (index 0,1,2…)
}

/** Word-like tick cadence per unit. */
export function tickSpec(unit: RulerUnit): TickSpec {
  if (unit === 'cm') {
    // minor every 0.25cm, label every 1cm.
    return { minorPx: PX_PER_CM / 4, perMajor: 4, label: (i) => String(i) };
  }
  // minor every 1/8", label every 1".
  return { minorPx: PX_PER_IN / 8, perMajor: 8, label: (i) => String(i) };
}
