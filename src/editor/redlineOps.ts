import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { RegistryChange } from '../types';

export interface LiveRange {
  from: number;
  to: number;
}

/** Contiguous ranges carrying a given redline mark for a change id. */
export function markRanges(doc: PMNode, markName: string, changeId: string): LiveRange[] {
  const ranges: LiveRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const has = node.marks.some(
      (m) => m.type.name === markName && m.attrs.changeId === changeId,
    );
    if (has) {
      const from = pos;
      const to = pos + node.nodeSize;
      const last = ranges[ranges.length - 1];
      if (last && last.to === from) last.to = to;
      else ranges.push({ from, to });
    }
    return true;
  });
  return ranges;
}

/**
 * Materialise a proposed change as redline marks in the document. Nothing is
 * resolved to clean text here — deletions are *marked* (not removed) and
 * insertions are added with the insertion mark. Returns the live span covering
 * the whole change so the registry can anchor cards and spotlights.
 *
 * `from`/`to` must already be mapped into the current document coordinate space.
 */
export function applyRedline(
  editor: Editor,
  opts: { changeId: string; from: number; to: number; deletion?: string; insertion?: string },
): LiveRange {
  const { state } = editor.view;
  const { schema } = state;
  const tr = state.tr;

  const delType = schema.marks.deletion;
  const insType = schema.marks.insertion;
  if (!delType || !insType) return { from: opts.from, to: opts.to };

  const hasDel = !!opts.deletion && opts.to > opts.from;
  if (hasDel) {
    tr.addMark(opts.from, opts.to, delType.create({ changeId: opts.changeId }));
  }

  let liveTo = opts.to;
  if (opts.insertion) {
    const insertAt = hasDel ? opts.to : opts.from;
    tr.insert(
      insertAt,
      schema.text(opts.insertion, [insType.create({ changeId: opts.changeId })]),
    );
    liveTo = insertAt + opts.insertion.length;
  }

  tr.setMeta('addToHistory', true);
  editor.view.dispatch(tr);
  return { from: opts.from, to: liveTo };
}

/**
 * Resolve a change to clean text. Accept keeps insertions / drops deletions;
 * reject does the inverse. Ranges are processed right-to-left and remapped
 * through the running transaction so positions stay valid. The transaction is
 * a normal (undoable) edit.
 */
export function resolveRedline(
  editor: Editor,
  change: RegistryChange,
  action: 'accept' | 'reject',
): void {
  const { state } = editor.view;
  const { schema, doc } = state;
  const tr = state.tr;

  const delType = schema.marks.deletion;
  const insType = schema.marks.insertion;
  if (!delType || !insType) return;

  const ops = [
    ...markRanges(doc, 'deletion', change.id).map((r) => ({ ...r, type: 'del' as const })),
    ...markRanges(doc, 'insertion', change.id).map((r) => ({ ...r, type: 'ins' as const })),
  ].sort((a, b) => b.from - a.from);

  for (const op of ops) {
    const from = tr.mapping.map(op.from, 1);
    const to = tr.mapping.map(op.to, -1);
    if (to <= from && op.type === 'ins') continue;
    if (action === 'accept') {
      if (op.type === 'del') tr.delete(from, to);
      else tr.removeMark(from, to, insType);
    } else {
      if (op.type === 'del') tr.removeMark(from, to, delType);
      else tr.delete(from, to);
    }
  }

  if (tr.docChanged) {
    tr.setMeta('addToHistory', true);
    editor.view.dispatch(tr);
  }
}

/** Strip every redline mark for a change without resolving text (cleanup). */
export function stripRedline(editor: Editor, changeId: string): void {
  const { state } = editor.view;
  const { schema, doc } = state;
  const tr = state.tr;
  const delType = schema.marks.deletion;
  const insType = schema.marks.insertion;
  if (!delType || !insType) return;

  for (const r of markRanges(doc, 'deletion', changeId)) tr.removeMark(r.from, r.to, delType);
  for (const r of markRanges(doc, 'insertion', changeId)) tr.removeMark(r.from, r.to, insType);
  if (tr.docChanged || tr.storedMarksSet) editor.view.dispatch(tr);
}
