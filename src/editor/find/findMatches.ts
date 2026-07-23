/**
 * Find & Replace search engine (pure). Walks the document's text blocks and
 * returns match ranges in ProseMirror positions, plus a preview snippet for the
 * results list.
 *
 * Scope: every text block — paragraphs, headings, table cells, list items,
 * nested content. Matches never cross a block boundary (each block is searched
 * independently). Running headers/footers are pagination decorations, not
 * document content, so they are not searched.
 *
 * Variables: an atomic variable token contributes its RESOLVED VALUE to the
 * searchable text (you find what you see). A match that overlaps a token is
 * flagged `replaceable: false` — it still highlights/counts/navigates, but
 * Replace skips it (you can't edit inside an atom).
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import { resolveVariable } from '../extensions/variable';
import type { VariableValues } from '../../types';

export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
  /** False when the range overlaps a variable token (an atom) — Replace skips it. */
  replaceable: boolean;
  /** Preview snippet parts for the results list (block text around the match). */
  before: string;
  text: string;
  after: string;
}

const PREVIEW_PAD = 32;
// Sentinel for non-text inline nodes (hard breaks, unknown atoms) so a phrase
// never matches across them; stripped from previews.
const SENTINEL = '￿';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(ch: string | undefined): boolean {
  return ch != null && /[\p{L}\p{N}_]/u.test(ch);
}

function clean(s: string): string {
  return s.replace(new RegExp(SENTINEL, 'g'), '');
}

/** Build the searchable string of one text block + per-char doc-position maps. */
function indexBlock(block: PMNode, blockPos: number, values: VariableValues) {
  let text = '';
  const from: number[] = [];
  const to: number[] = [];
  const atom: boolean[] = [];
  block.forEach((child, offset) => {
    const childPos = blockPos + 1 + offset; // +1: into the block's content
    if (child.isText) {
      const s = child.text ?? '';
      for (let i = 0; i < s.length; i++) {
        text += s[i];
        from.push(childPos + i);
        to.push(childPos + i + 1);
        atom.push(false);
      }
    } else if (child.type.name === 'variable') {
      // The token's resolved value is searchable, but it maps to the single
      // atom span [childPos, childPos+1] and is not replaceable.
      const display = resolveVariable(values, (child.attrs.name as string) ?? '').display;
      for (const ch of display) {
        text += ch;
        from.push(childPos);
        to.push(childPos + child.nodeSize);
        atom.push(true);
      }
    } else {
      // Other inline nodes (hard break, unknown atoms): a non-matching sentinel.
      text += SENTINEL;
      from.push(childPos);
      to.push(childPos + child.nodeSize);
      atom.push(true);
    }
  });
  return { text, from, to, atom };
}

/**
 * All matches of `query` in `doc`. Literal matching (special chars escaped);
 * case-insensitive unless `matchCase`; word-boundary-gated when `wholeWord`.
 */
export function findMatches(
  doc: PMNode,
  query: string,
  opts: FindOptions,
  values: VariableValues = {},
): FindMatch[] {
  if (!query) return [];
  const re = new RegExp(escapeRegExp(query), opts.matchCase ? 'g' : 'gi');
  const out: FindMatch[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true; // descend into containers (tables, lists)
    const { text, from, to, atom } = indexBlock(node, pos, values);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      if (m[0].length === 0) {
        re.lastIndex++; // guard (shouldn't happen for a non-empty query)
        continue;
      }
      if (opts.wholeWord && (isWordChar(text[s - 1]) || isWordChar(text[e]))) {
        continue; // adjacent word char → not a whole-word match
      }
      let replaceable = true;
      for (let i = s; i < e; i++) if (atom[i]) replaceable = false;
      const bStart = Math.max(0, s - PREVIEW_PAD);
      const aEnd = Math.min(text.length, e + PREVIEW_PAD);
      out.push({
        from: from[s]!,
        to: to[e - 1]!,
        replaceable,
        before: (bStart > 0 ? '…' : '') + clean(text.slice(bStart, s)),
        text: clean(text.slice(s, e)),
        after: clean(text.slice(e, aEnd)) + (aEnd < text.length ? '…' : ''),
      });
    }
    return false; // handled this block's inline content manually
  });

  return out;
}
