/**
 * Bullet-list data model — the single source of truth shared by the CSS
 * generator, the DOCX mapping, the customize UI, and the tests. Mirrors the
 * ordered-list model (see ../listNumbering/model) but for UNORDERED markers:
 * no start-at, separator, parent-inclusion, or restart — bullets have none of
 * those concepts.
 *
 * STORAGE: a document-level registry (`bulletDefs` on the Document node),
 * exactly like the ordered `listDefs`. Each <ul> carries a `bulletDefId`. A
 * bullet list node's LEVEL is its nesting depth among BULLET lists (computed at
 * render time). Persists via getJSON + parse/renderHTML.
 *
 * NOTE: this is for visual bullet lists only. Task/checkbox lists are a separate
 * Tiptap node (TaskList/TaskItem) and are NOT covered here — a "✓" is available
 * only as a Custom glyph (a visual marker), never as an interactive checkbox.
 */
import { jsonHash } from '../listNumbering/model';

export type MarkerStyle = 'disc' | 'circle' | 'square' | 'dash' | 'arrow' | 'custom' | 'none';

export interface BulletLevelConfig {
  markerStyle: MarkerStyle;
  /** Used when markerStyle === 'custom' — a single character or emoji. */
  customMarker?: string;
  /** Optional marker color (CSS color). */
  color?: string | null;
  /** Optional marker size (CSS length, e.g. "1.3em" / "20px"). */
  size?: string | null;
}

export type BulletDefinition = BulletLevelConfig[];
export type BulletDefRegistry = Record<string, BulletDefinition>;

export const MAX_LEVELS = 9;

/** Built-in glyphs for the non-native marker styles. */
export const DASH_GLYPH = '–'; // en dash
export const ARROW_GLYPH = '→';

/** The glyph to DISPLAY for a level (preview + custom-marker CSS). */
export function markerGlyph(cfg: BulletLevelConfig): string {
  switch (cfg.markerStyle) {
    case 'disc': return '•';
    case 'circle': return '◦';
    case 'square': return '▪';
    case 'dash': return DASH_GLYPH;
    case 'arrow': return ARROW_GLYPH;
    case 'custom': return (cfg.customMarker || '').trim() || '•';
    case 'none': return '';
  }
}

/** True when the style is rendered via a ::before glyph (not native list-style). */
export function usesGlyphMarker(style: MarkerStyle): boolean {
  return style === 'dash' || style === 'arrow' || style === 'custom';
}

/* ------------------------------- presets -------------------------------- */

const L = (
  markerStyle: MarkerStyle,
  extra: Partial<BulletLevelConfig> = {},
): BulletLevelConfig => ({ markerStyle, ...extra });

export interface BulletPreset {
  id: string;
  levels: BulletDefinition;
}

export const BULLET_PRESETS: BulletPreset[] = [
  { id: 'classic', levels: [L('disc'), L('circle'), L('square')] },
  { id: 'dash', levels: [L('dash'), L('dash'), L('dash')] },
  { id: 'arrow', levels: [L('arrow'), L('dash'), L('disc')] },
  { id: 'squareFirst', levels: [L('square'), L('disc'), L('circle')] },
  { id: 'large', levels: [L('disc', { size: '1.4em' }), L('circle'), L('square')] },
  { id: 'none', levels: [L('none'), L('none'), L('none')] },
];

export function getBulletPreset(id: string): BulletPreset | undefined {
  return BULLET_PRESETS.find((p) => p.id === id);
}

/** Ensure ≥ n levels, cycling the last three (Word-style) for deep nesting. */
export function extendBulletDefinition(def: BulletDefinition, n = MAX_LEVELS): BulletDefinition {
  if (def.length >= n) return def.slice(0, n);
  const out = def.slice();
  const tail = def.slice(-3);
  let i = 0;
  while (out.length < n) {
    out.push({ ...tail[i % tail.length]! });
    i += 1;
  }
  return out;
}

/** Default config for a freshly added level: the disc/circle/square cycle. */
export function defaultBulletLevelConfig(depth: number): BulletLevelConfig {
  const cycle: MarkerStyle[] = ['disc', 'circle', 'square'];
  return L(cycle[(depth - 1) % 3]!);
}

/** Stable content-hash id (shared hashing with the ordered system). */
export function bulletDefinitionId(def: BulletDefinition): string {
  return `bd${jsonHash(def)}`;
}
