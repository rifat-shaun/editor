/**
 * Infer a numbering DEFINITION from the marker text seen in pasted content.
 *
 * Given the markers observed at each nesting level (e.g. level 1 = ["1.","2."],
 * level 2 = ["a)","b)"], level 3 = ["i","ii","iii"]), produce a ListDefinition
 * that reproduces that scheme, so a pasted list keeps its structure.
 *
 * Accuracy notes (the hard bits):
 *  - letter vs roman: `i, v, x, l, c, d, m` are valid as BOTH. We decide per
 *    LEVEL from the whole sequence — a roman level reads as consecutive romans
 *    starting at `i` (i, ii, iii…); otherwise it's alphabetic (a, b, c… or even
 *    i, j, k). A lone ambiguous marker defaults to roman only for `i`.
 *  - separator: `a.` → dot, `a)` → paren, `(a)` → parens; a bare marker → dot.
 *  - parent-inclusion: a composite marker with dot-joined segments (`1.1`,
 *    `1.a`) at level > 1 → includeParent.
 * These are pure functions — unit-tested — so the inference can be verified in
 * isolation from the paste plumbing.
 */
import {
  defaultLevelConfig,
  toRoman,
  type ListDefinition,
  type ListLevelConfig,
  type NumberStyle,
  type Separator,
} from './model';

export interface ParsedMarker {
  /** Dot-joined segments, e.g. "1.a" → ["1","a"]; "b)" → ["b"]. */
  segments: string[];
  separator: Separator;
}

/** Parse one marker string into segments + separator (null if not a marker). */
export function parseMarker(raw: string): ParsedMarker | null {
  let s = (raw ?? '').replace(/[\u00a0]/g, " ").trim();
  if (!s) return null;

  let separator: Separator = 'dot';
  const parens = /^\((.+?)\)\.?$/.exec(s);
  if (parens) {
    separator = 'parens';
    s = parens[1]!;
  } else if (/\)$/.test(s)) {
    separator = 'paren';
    s = s.replace(/\)$/, '');
  } else if (/\.$/.test(s)) {
    separator = 'dot';
    s = s.replace(/\.$/, '');
  }
  s = s.trim();
  if (!s) return null;

  const segments = s.split('.').map((x) => x.trim()).filter(Boolean);
  if (!segments.length) return null;
  // Every segment must be all-digits or all-letters (else it's not a marker).
  if (!segments.every((seg) => /^\d+$/.test(seg) || /^[a-zA-Z]+$/.test(seg))) return null;
  return { segments, separator };
}

const ROMAN_RE = /^[ivxlcdm]+$/;

function fromRoman(s: string): number {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const lc = s.toLowerCase();
  if (!ROMAN_RE.test(lc)) return NaN;
  let total = 0;
  let prev = 0;
  for (let i = lc.length - 1; i >= 0; i--) {
    const v = map[lc[i]!]!;
    if (v < prev) total -= v;
    else {
      total += v;
      prev = v;
    }
  }
  return total;
}

/** Bijective base-26: a→1, z→26, aa→27. NaN if not letters. */
function fromAlpha(s: string): number {
  const lc = s.toLowerCase();
  if (!/^[a-z]+$/.test(lc)) return NaN;
  let n = 0;
  for (const ch of lc) n = n * 26 + (ch.charCodeAt(0) - 96);
  return n;
}

/**
 * Does this level's own tokens read as ROMAN rather than alphabetic? A real
 * roman list is consecutive canonical romans starting at `i`; that rules out
 * `c, d` (alpha) while accepting `i, ii, iii, iv`. A lone token is roman only
 * if it is exactly `i`.
 */
function looksRoman(tokens: string[]): boolean {
  if (!tokens.every((t) => ROMAN_RE.test(t))) return false;
  const vals = tokens.map(fromRoman);
  if (vals.some((v) => !Number.isFinite(v) || v <= 0)) return false;
  // Must be canonical (toRoman(fromRoman(t)) === t) — rejects e.g. "iiii".
  if (!tokens.every((t, i) => toRoman(vals[i]!, false) === t)) return false;
  if (tokens.length === 1) return tokens[0] === 'i';
  // Multi: start at i (1) and strictly increase — the shape of a real roman list.
  if (vals[0] !== 1) return false;
  for (let i = 1; i < vals.length; i++) if (vals[i]! <= vals[i - 1]!) return false;
  return true;
}

/** Infer the number style for a level from its own tokens (last segments). */
export function inferStyle(tokens: string[]): NumberStyle {
  const t = tokens.filter(Boolean);
  if (!t.length) return 'decimal';
  if (t.every((x) => /^\d+$/.test(x))) {
    return t.some((x) => x.length > 1 && x.startsWith('0')) ? 'decimalZero' : 'decimal';
  }
  const isUpper = t.every((x) => /^[A-Z]+$/.test(x));
  const isLower = t.every((x) => /^[a-z]+$/.test(x));
  if (isUpper || isLower) {
    const lc = t.map((x) => x.toLowerCase());
    if (looksRoman(lc)) return isUpper ? 'upperRoman' : 'lowerRoman';
    return isUpper ? 'upperAlpha' : 'lowerAlpha';
  }
  return 'decimal';
}

function valueOf(token: string, style: NumberStyle): number {
  switch (style) {
    case 'decimal':
    case 'decimalZero':
      return parseInt(token, 10) || 1;
    case 'lowerAlpha':
    case 'upperAlpha':
      return fromAlpha(token) || 1;
    case 'lowerRoman':
    case 'upperRoman':
      return fromRoman(token) || 1;
  }
}

function mode<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  let best: T = xs[0]!;
  let bestN = 0;
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1;
    counts.set(x, n);
    if (n > bestN) {
      best = x;
      bestN = n;
    }
  }
  return best;
}

/**
 * Build a ListDefinition from per-level marker samples (1-based level keys).
 * Levels with no usable samples fall back to the default 1/a/i cycle.
 */
export function inferDefinition(levelMarkers: Map<number, string[]>): ListDefinition {
  const maxLevel = Math.max(1, ...levelMarkers.keys());
  const def: ListLevelConfig[] = [];
  for (let d = 1; d <= maxLevel; d++) {
    const parsed = (levelMarkers.get(d) ?? []).map(parseMarker).filter((x): x is ParsedMarker => !!x);
    if (!parsed.length) {
      def.push(defaultLevelConfig(d));
      continue;
    }
    const separator = mode(parsed.map((p) => p.separator));
    const ownTokens = parsed.map((p) => p.segments[p.segments.length - 1]!);
    const style = inferStyle(ownTokens);
    const includeParent = d > 1 && parsed.some((p) => p.segments.length > 1);
    const startAt = Math.max(1, valueOf(parsed[0]!.segments[parsed[0]!.segments.length - 1]!, style));
    def.push({ style, separator, startAt, includeParent });
  }
  return def;
}

/** True if the definition has at least one level worth applying (ordered). */
export function isMeaningfulDefinition(def: ListDefinition): boolean {
  return def.length > 0;
}
