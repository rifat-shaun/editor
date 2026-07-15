import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { AiScope } from '../types';

export interface ResolvedScope {
  from: number;
  to: number;
  text: string;
  /** Section reference label if the scope maps to a heading (e.g. "§2"). */
  sectionRef?: string;
}

/** A heading landmark used for section-boundary math. */
export interface HeadingMark {
  /** Document position of the heading node's start. */
  pos: number;
  level: number;
}

/**
 * Given the ordered heading landmarks of a document, its total content size,
 * and a caret position, return the [from, to] span of the *section* that
 * contains `pos`. A section runs from a top-level heading (the lowest level
 * present) up to the next heading of the same-or-higher rank.
 *
 * Pure and self-contained so it can be unit-tested without an editor.
 */
export function findSectionRange(
  headings: HeadingMark[],
  pos: number,
  docStart: number,
  docEnd: number,
): { from: number; to: number } {
  if (headings.length === 0) return { from: docStart, to: docEnd };

  // The "section" rank is the shallowest heading level in the doc (e.g. H2).
  const sectionLevel = Math.min(...headings.map((h) => h.level));
  const anchors = headings.filter((h) => h.level === sectionLevel);

  // Find the last section-anchor at or before pos.
  let startIdx = -1;
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i]!.pos <= pos) startIdx = i;
    else break;
  }

  if (startIdx === -1) {
    // Before the first section heading: span from doc start to first anchor.
    return { from: docStart, to: anchors[0]!.pos };
  }

  const from = anchors[startIdx]!.pos;
  const to = startIdx + 1 < anchors.length ? anchors[startIdx + 1]!.pos : docEnd;
  return { from, to };
}

function collectHeadings(doc: PMNode): HeadingMark[] {
  const headings: HeadingMark[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ pos, level: (node.attrs.level as number) ?? 1 });
    }
    return true;
  });
  return headings;
}

function sectionRefFor(doc: PMNode, from: number): string | undefined {
  const node = doc.nodeAt(from);
  if (node && node.type.name === 'heading') {
    const text = node.textContent.trim();
    return text ? text.slice(0, 48) : undefined;
  }
  return undefined;
}

/**
 * Resolve an AI scope against the live editor state into a concrete range and
 * its plain-text payload for the provider.
 */
export function resolveScope(state: EditorState, scope: AiScope): ResolvedScope {
  const { doc, selection } = state;
  const docStart = 0;
  const docEnd = doc.content.size;

  if (scope === 'document') {
    return { from: docStart, to: docEnd, text: doc.textBetween(docStart, docEnd, '\n\n', ' ') };
  }

  if (scope === 'selection') {
    if (selection.empty) {
      // Fall back to the whole document when nothing is selected.
      return { from: docStart, to: docEnd, text: doc.textBetween(docStart, docEnd, '\n\n', ' ') };
    }
    const { from, to } = selection;
    return { from, to, text: doc.textBetween(from, to, '\n\n', ' ') };
  }

  // section
  const headings = collectHeadings(doc);
  const { from, to } = findSectionRange(headings, selection.from, docStart, docEnd);
  return {
    from,
    to,
    text: doc.textBetween(from, to, '\n\n', ' '),
    sectionRef: sectionRefFor(doc, from),
  };
}
