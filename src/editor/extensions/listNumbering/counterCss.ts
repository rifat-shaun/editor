/**
 * Generate scoped CSS that renders a numbering definition with CSS counters.
 *
 * Key idea: ONE counter per depth level (`pgnol1..pgnol9`), reset on each `<ol>`
 * of that level and incremented on its direct `<li>`s. Counter values inherit
 * to descendants, so a nested level's `::before` can reference its ancestors'
 * counters. Composing the marker from individual `counter(name, style)` pieces
 * (rather than a single `counters()`) is what lets each level use a DIFFERENT
 * style — e.g. `1.a` (decimal parent + alpha child), which `counters()` cannot
 * express. Rules are scoped by `[data-list-def="id"]` so lists with different
 * definitions coexist on the page (and in print clones).
 */
import {
  MAX_LEVELS,
  type ListDefinition,
  type NumberStyle,
  type Separator,
} from './model';

/** NumberStyle → CSS counter/list style keyword. */
export function cssCounterStyle(style: NumberStyle): string {
  switch (style) {
    case 'decimal': return 'decimal';
    case 'decimalZero': return 'decimal-leading-zero';
    case 'lowerAlpha': return 'lower-alpha';
    case 'upperAlpha': return 'upper-alpha';
    case 'lowerRoman': return 'lower-roman';
    case 'upperRoman': return 'upper-roman';
  }
}

function decorateCss(inner: string, sep: Separator): string {
  if (sep === 'parens') return `"(" ${inner} ")"`;
  if (sep === 'paren') return `${inner} ")"`;
  return `${inner} "."`;
}

/** The `content` value for a level's `::before`, composed from the counters. */
export function markerContent(def: ListDefinition, depth: number): string {
  const cfg = def[depth - 1];
  if (!cfg) return '""';
  const include = cfg.includeParent && depth > 1;
  const from = include ? 1 : depth;
  const parts: string[] = [];
  for (let k = from; k <= depth; k++) {
    const lvl = def[k - 1];
    if (!lvl) continue;
    parts.push(`counter(pgnol${k}, ${cssCounterStyle(lvl.style)})`);
  }
  return decorateCss(parts.join(' "." '), cfg.separator);
}

/**
 * CSS for one definition (all levels up to MAX_LEVELS), scoped by its id.
 * Prefixed with `.docs-page-content` so it also applies to print clones and
 * wins the cascade over the base `ol` styles.
 */
export function generateDefinitionCss(id: string, def: ListDefinition): string {
  const sel = `.docs-page-content ol[data-list-def="${id}"]`;
  const out: string[] = [
    `${sel}{list-style:none;}`,
    `${sel}>li{position:relative;}`,
  ];
  for (let d = 1; d <= MAX_LEVELS; d++) {
    const cfg = def[d - 1] ?? def[def.length - 1];
    if (!cfg) break;
    const start = (cfg.startAt || 1) - 1;
    const lvlSel = `${sel}[data-list-level="${d}"]`;
    out.push(`${lvlSel}{counter-reset:pgnol${d} ${start};}`);
    out.push(`${lvlSel}>li{counter-increment:pgnol${d};}`);
    out.push(
      `${lvlSel}>li::before{` +
        `content:${markerContent(def, d)};` +
        `position:absolute;right:100%;margin-right:.5em;` +
        `white-space:nowrap;font-variant-numeric:tabular-nums;` +
        // Ensure the composed marker prints (text, so exact color-adjust is not
        // strictly required, but harmless and future-proof).
        `-webkit-print-color-adjust:exact;print-color-adjust:exact;` +
        `}`,
    );
  }
  return out.join('\n');
}

/** CSS for every definition currently referenced in the document. */
export function generateRegistryCss(used: Record<string, ListDefinition>): string {
  return Object.entries(used)
    .map(([id, def]) => generateDefinitionCss(id, def))
    .join('\n');
}
