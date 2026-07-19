/**
 * Map THIS editor's list definitions → docx-js numbering config.
 *
 * The crux of DOCX export. Word numbering is a document-level list of
 * definitions, each with per-level entries (LevelFormat + a text template like
 * "%1." and indentation). Paragraphs reference one via { numbering: { reference,
 * level } }. We reuse the OOXML mapping in ../../extensions/listNumbering/
 * docxNumbering (numFmt strings + %n templates incl. composite 1.a.i) and turn
 * those into docx-js `ILevelsOptions`.
 *
 * References are allocated PER top-level list occurrence (see convert.ts) so
 * separate lists restart independently — matching the editor. One reference
 * carries all 9 depth levels, so nesting maps to `level` 0..8.
 */
import { AlignmentType, LevelFormat, type ILevelsOptions } from 'docx';
import {
  ooxmlNumFmt,
  ooxmlLevelText,
  ooxmlBulletText,
} from '../../extensions/listNumbering/docxNumbering';
import { extendDefinition, type ListDefinition } from '../../extensions/listNumbering/model';
import {
  extendBulletDefinition,
  type BulletDefinition,
} from '../../extensions/bulletList/model';
import { toHex } from './units';

/** OOXML numFmt string → docx-js LevelFormat. */
export function levelFormatFor(numFmt: string): (typeof LevelFormat)[keyof typeof LevelFormat] {
  switch (numFmt) {
    case 'decimal': return LevelFormat.DECIMAL;
    case 'decimalZero': return LevelFormat.DECIMAL_ZERO;
    case 'lowerLetter': return LevelFormat.LOWER_LETTER;
    case 'upperLetter': return LevelFormat.UPPER_LETTER;
    case 'lowerRoman': return LevelFormat.LOWER_ROMAN;
    case 'upperRoman': return LevelFormat.UPPER_ROMAN;
    default: return LevelFormat.DECIMAL;
  }
}

/** Standard Word list indentation for a depth: 0.5in per level, 0.25in hanging. */
function indentFor(depth: number) {
  return { left: 720 * (depth + 1), hanging: 360 };
}

/** docx-js levels for an ordered definition (composite templates preserved). */
export function orderedLevels(def: ListDefinition): ILevelsOptions[] {
  const full = extendDefinition(def);
  return full.map((cfg, i) => ({
    level: i,
    format: levelFormatFor(ooxmlNumFmt(cfg.style)),
    text: ooxmlLevelText(full, i + 1), // e.g. "%1.", "%1.%2." (parent-inclusive)
    alignment: AlignmentType.START,
    start: cfg.startAt || 1,
    style: { paragraph: { indent: indentFor(i) } },
  }));
}

/** docx-js levels for a bullet definition (BULLET format + glyph). */
export function bulletLevels(def: BulletDefinition): ILevelsOptions[] {
  const full = extendBulletDefinition(def);
  return full.map((cfg, i) => {
    const color = toHex(cfg.color);
    return {
      level: i,
      format: LevelFormat.BULLET,
      text: ooxmlBulletText(cfg) || '•',
      alignment: AlignmentType.START,
      style: {
        paragraph: { indent: indentFor(i) },
        ...(color ? { run: { color } } : {}),
      },
    };
  });
}
