/**
 * Generate scoped CSS for a bullet definition. Mirrors the ordered
 * counterCss.ts, keyed by `[data-bullet-def="id"][data-bullet-level="d"]` so
 * multiple bullet lists coexist (and print clones inherit it).
 *
 * Marker rendering:
 *  - disc / circle / square → native `list-style-type` (the ::marker slot;
 *    color/size applied via `::marker`, and it already scales with the item's
 *    font size through the shared `--pgn-marker-size` var).
 *  - dash / arrow / custom  → `list-style: none` + an absolutely-positioned
 *    `li::before` glyph (same reliable, print-safe approach as ordered markers).
 *  - none → `list-style: none` (indentation preserved, no marker).
 */
import {
  MAX_LEVELS,
  markerGlyph,
  usesGlyphMarker,
  type BulletDefinition,
  type BulletLevelConfig,
} from './model';

/** CSS-escape a glyph for use inside a `content: "…"` string. */
function cssString(glyph: string): string {
  return glyph.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function markerSizeDecl(cfg: BulletLevelConfig): string {
  // Explicit size wins; otherwise follow the item's own font size.
  return `font-size:${cfg.size ? cfg.size : 'var(--pgn-marker-size,inherit)'};`;
}

export function generateBulletDefinitionCss(id: string, def: BulletDefinition): string {
  const sel = `.docs-page-content ul[data-bullet-def="${id}"]`;
  const out: string[] = [];
  for (let d = 1; d <= MAX_LEVELS; d++) {
    const cfg = def[d - 1] ?? def[def.length - 1];
    if (!cfg) break;
    const lvlSel = `${sel}[data-bullet-level="${d}"]`;

    if (cfg.markerStyle === 'none') {
      out.push(`${lvlSel}{list-style:none;}`);
      out.push(`${lvlSel}>li::before{content:none;}`);
      continue;
    }

    if (!usesGlyphMarker(cfg.markerStyle)) {
      // disc / circle / square — native marker.
      out.push(`${lvlSel}{list-style-type:${cfg.markerStyle};}`);
      const markerBits =
        (cfg.color ? `color:${cfg.color};` : '') +
        (cfg.size ? `font-size:${cfg.size};` : `font-size:var(--pgn-marker-size,inherit);`);
      out.push(`${lvlSel}>li::marker{${markerBits}}`);
      continue;
    }

    // dash / arrow / custom — glyph via ::before.
    out.push(`${lvlSel}{list-style:none;}`);
    out.push(`${lvlSel}>li{position:relative;}`);
    out.push(
      `${lvlSel}>li::before{` +
        `content:"${cssString(markerGlyph(cfg))}";` +
        `position:absolute;right:100%;margin-right:.5em;` +
        markerSizeDecl(cfg) +
        (cfg.color ? `color:${cfg.color};` : '') +
        `white-space:nowrap;` +
        `-webkit-print-color-adjust:exact;print-color-adjust:exact;` +
        `}`,
    );
  }
  return out.join('\n');
}

export function generateBulletRegistryCss(used: Record<string, BulletDefinition>): string {
  return Object.entries(used)
    .map(([id, def]) => generateBulletDefinitionCss(id, def))
    .join('\n');
}
