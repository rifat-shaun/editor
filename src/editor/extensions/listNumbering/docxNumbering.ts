/**
 * DOCX numbering mapping — ListDefinition → Word (OOXML) numbering.
 *
 * Word stores numbering as `<w:abstractNum>` (the format) referenced by
 * `<w:num>` (an instance). Each abstractNum has up to 9 `<w:lvl>` entries with:
 *   - `w:numFmt`  → the number style (decimal, lowerLetter, …)
 *   - `w:lvlText` → the marker TEMPLATE using %1..%9 placeholders, e.g. "%1."
 *                   for "1.", or "%1.%2" for the composite "1.a"
 *   - `w:start`   → startAt
 *
 * CSS `::before` markers do NOT export to Word — the exporter must read THIS
 * mapping instead. This module is library-agnostic (plain OOXML-shaped data);
 * see the README for how to feed it into the `docx` npm package's numbering
 * config. A full whole-document DOCX exporter is out of scope (none exists in
 * the repo yet); this is the numbering piece, ready to plug in.
 */
import {
  extendDefinition,
  type ListDefinition,
  type ListDefRegistry,
  type NumberStyle,
  type Separator,
} from './model';

/** OOXML `w:numFmt` value for a NumberStyle. */
export function ooxmlNumFmt(style: NumberStyle): string {
  switch (style) {
    case 'decimal': return 'decimal';
    case 'decimalZero': return 'decimalZero';
    case 'lowerAlpha': return 'lowerLetter';
    case 'upperAlpha': return 'upperLetter';
    case 'lowerRoman': return 'lowerRoman';
    case 'upperRoman': return 'upperRoman';
  }
}

function decorate(body: string, sep: Separator): string {
  if (sep === 'parens') return `(${body})`;
  if (sep === 'paren') return `${body})`;
  return `${body}.`;
}

/**
 * The `w:lvlText` template for a level (1-based). Word placeholders are 1-based:
 * `%1` = level-1's number. Mirrors {@link renderMarker}'s composition so the
 * DOCX marker matches what the editor shows.
 */
export function ooxmlLevelText(def: ListDefinition, depth: number): string {
  const cfg = def[depth - 1];
  if (!cfg) return '';
  const include = cfg.includeParent && depth > 1;
  const from = include ? 1 : depth;
  const parts: string[] = [];
  for (let k = from; k <= depth; k++) parts.push(`%${k}`);
  return decorate(parts.join('.'), cfg.separator);
}

export interface OoxmlLevel {
  level: number; // 0-based (OOXML w:ilvl)
  numFmt: string;
  lvlText: string;
  start: number;
}
export interface OoxmlAbstractNum {
  id: string; // maps from the registry key
  levels: OoxmlLevel[];
}

/** Map one definition to a Word abstractNum (9 levels, deep levels extended). */
export function toAbstractNum(id: string, def: ListDefinition): OoxmlAbstractNum {
  const full = extendDefinition(def);
  const levels: OoxmlLevel[] = full.map((cfg, i) => ({
    level: i,
    numFmt: ooxmlNumFmt(cfg.style),
    lvlText: ooxmlLevelText(full, i + 1),
    start: cfg.startAt || 1,
  }));
  return { id, levels };
}

/** Map the whole registry → abstractNums + the num instances that reference them. */
export function toDocxNumbering(registry: ListDefRegistry): {
  abstractNums: OoxmlAbstractNum[];
  nums: { numId: number; abstractNumId: string }[];
} {
  const abstractNums = Object.entries(registry).map(([id, def]) => toAbstractNum(id, def));
  const nums = abstractNums.map((a, i) => ({ numId: i + 1, abstractNumId: a.id }));
  return { abstractNums, nums };
}

/* --------------------------- bullets (Word) ---------------------------- *
 * Word bullets are `<w:lvl>` with `w:numFmt="bullet"` and the glyph as
 * `w:lvlText`. Native disc/circle/square map to conventional Word bullet chars;
 * dash/arrow/custom map to their glyph; none → empty. Custom emoji are passed
 * through best-effort — Word renders them with the run font, which is limited
 * for pictographic glyphs (flagged in the README).
 * --------------------------------------------------------------------- */
import {
  extendBulletDefinition,
  markerGlyph,
  type BulletDefinition,
  type BulletDefRegistry,
  type BulletLevelConfig,
} from '../bulletList/model';

/** The `w:lvlText` glyph Word should show for a bullet level. */
export function ooxmlBulletText(cfg: BulletLevelConfig): string {
  switch (cfg.markerStyle) {
    case 'disc': return '•'; // •
    case 'circle': return 'o';
    case 'square': return '▪'; // ▪
    case 'none': return '';
    default: return markerGlyph(cfg); // dash / arrow / custom
  }
}

export function toBulletAbstractNum(id: string, def: BulletDefinition): OoxmlAbstractNum {
  const full = extendBulletDefinition(def);
  const levels: OoxmlLevel[] = full.map((cfg, i) => ({
    level: i,
    numFmt: 'bullet',
    lvlText: ooxmlBulletText(cfg),
    start: 1,
  }));
  return { id, levels };
}

/** Map the bullet registry → abstractNums + num instances. */
export function toDocxBulletNumbering(registry: BulletDefRegistry): {
  abstractNums: OoxmlAbstractNum[];
  nums: { numId: number; abstractNumId: string }[];
} {
  const abstractNums = Object.entries(registry).map(([id, def]) => toBulletAbstractNum(id, def));
  const nums = abstractNums.map((a, i) => ({ numId: i + 1, abstractNumId: a.id }));
  return { abstractNums, nums };
}
