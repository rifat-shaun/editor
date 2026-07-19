/** Unit conversions for OOXML / docx-js. Word uses half-points, twips, EMU. */

/** CSS pt → half-points (Word font size unit). 11pt → 22. */
export function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

/**
 * THE font-size helper — the single source of the DOCX size convention. Use it
 * for EVERY exported size (body, headings, inline marks) so the ratio can't
 * drift onto a subset of elements.
 *
 * Convention: POINTS-SOURCE (the editor is pt end-to-end, like Word). A bare
 * number or a "…pt" string is points, passed 1:1 to half-points (× 2), so the
 * exported number equals the editor's number AND the physical size matches.
 * "…px" only appears in IMPORTED content (pasted Word/web); it's treated as
 * visual parity: px → pt at 96dpi (× 0.75) then × 2. em/rem: 12pt base.
 *
 * @param value a number (points) or a CSS length string; null → null.
 */
export function fontSizeToHalfPoints(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? ptToHalfPoints(value) : null; // points, 1:1
  }
  const m = /^([\d.]+)(px|pt|em|rem)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || 'pt'; // native unit is points
  // pt → 1:1; px (imported) → pt at 96dpi; em/rem relative to a 12pt base.
  const pt = unit === 'px' ? n * 0.75 : unit === 'em' || unit === 'rem' ? n * 12 : n;
  return ptToHalfPoints(pt);
}

/** inches → twips (DXA). 1in = 1440. */
export function inchToTwip(inch: number): number {
  return Math.round(inch * 1440);
}

/** CSS px → twips (DXA) at 96dpi. */
export function pxToTwip(px: number): number {
  return Math.round((px / 96) * 1440);
}

/** Normalize a CSS color to a 6-hex string without '#', or null. */
export function toHex(color: string | null | undefined): string | null {
  if (!color) return null;
  let c = color.trim().toLowerCase();
  if (c.startsWith('#')) c = c.slice(1);
  if (/^[0-9a-f]{3}$/.test(c)) c = c.split('').map((x) => x + x).join('');
  if (/^[0-9a-f]{6}$/.test(c)) return c;
  return null;
}
