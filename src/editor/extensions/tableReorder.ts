/**
 * Pure helpers for table row reordering. No DOM — unit-testable in isolation.
 *
 * The interaction layer only decides a *source row index* and a *target gap
 * index*; the actual move is always a single ProseMirror transaction built here
 * (delete the source row slice, re-insert it at the mapped target). This is the
 * whole point of the CRITICAL CORRECTNESS RULE: never move DOM nodes, or the
 * row gets duplicated instead of moved.
 *
 * Gap-index model: a "gap" is a slot *between* rows. Gap `g` (0..rowCount) means
 * "insert before row g" (gap rowCount = after the last row). Dropping into the
 * source row's own gap (g === source or g === source+1) is a no-op.
 */
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

export interface RowPos {
  index: number;
  /** Doc position immediately before the row node. */
  from: number;
  /** Doc position immediately after the row node. */
  to: number;
}

/**
 * Positions of every tableRow child, in the CURRENT document. `tablePos` is the
 * position of the table node itself (the position immediately before it), so
 * `tablePos + 1` is the first position inside the table = the first row's start.
 * Table children are always tableRows (prosemirror-tables keeps colwidth on the
 * cells, so there is no colgroup node to skip).
 */
export function rowPositions(table: PMNode, tablePos: number): RowPos[] {
  const out: RowPos[] = [];
  table.forEach((row, offset, index) => {
    const from = tablePos + 1 + offset;
    out.push({ index, from, to: from + row.nodeSize });
  });
  return out;
}

/** Number of leading rows whose cells are ALL header cells (a pinned header). */
export function headerRowCount(table: PMNode): number {
  let count = 0;
  for (let i = 0; i < table.childCount; i++) {
    const row = table.child(i);
    let allHeader = row.childCount > 0;
    row.forEach((cell) => {
      if (cell.type.name !== 'tableHeader') allHeader = false;
    });
    if (allHeader) count += 1;
    else break;
  }
  return count;
}

/**
 * Can row `R` be moved independently? NO if it holds only *part* of a
 * vertically-merged cell — i.e. any cell occupying row R also occupies R−1 or
 * R+1. Using `TableMap`, every grid slot in row R resolves (via `findCell`) to
 * its originating cell's rect; a cell fully within R occupies exactly the row
 * range `[R, R+1)`. If any occupying cell's `top < R` (a rowspan starting
 * above extends into R) or `bottom > R+1` (a rowspan starting in R extends
 * below), the row straddles a vertical merge → NOT movable.
 *
 * Horizontal-only merges (colspan, rowspan === 1) sit entirely within one row,
 * so they never block — only vertical straddling matters.
 */
export function isRowMovable(table: PMNode, rowIndex: number): boolean {
  const map = TableMap.get(table);
  if (rowIndex < 0 || rowIndex >= map.height) return false;
  for (let col = 0; col < map.width; col++) {
    const rect = map.findCell(map.map[rowIndex * map.width + col]!);
    // `rect.top`/`rect.bottom` are grid ROW coordinates (bottom is exclusive).
    if (rect.top < rowIndex || rect.bottom > rowIndex + 1) return false;
  }
  return true;
}

/**
 * Is the boundary at `gapIndex` (0..height) free of a vertical span crossing
 * it? Dropping a row into a gap that a rowspan straddles would split the merge.
 * The table's top (0) and bottom (height) edges are always clean. For an inner
 * gap `g`, a span crosses it iff some cell occupying row `g` starts above it
 * (`rect.top < g`).
 */
export function isGapClean(table: PMNode, gapIndex: number): boolean {
  const map = TableMap.get(table);
  if (gapIndex <= 0 || gapIndex >= map.height) return true; // table edges
  for (let col = 0; col < map.width; col++) {
    const rect = map.findCell(map.map[gapIndex * map.width + col]!);
    if (rect.top < gapIndex) return false; // a rowspan straddles this boundary
  }
  return true;
}

/* =========================== COLUMN reordering =========================== *
 * A column is not a node — it's "the cell at column C" across every row. So a
 * column move relocates a cell in every row, in ONE transaction. Correctness
 * lives here, driven entirely by TableMap (never naive child indexing).
 * ========================================================================= */

/**
 * Can column `C` be moved independently? NO if it holds only *part* of a
 * horizontally-merged (colspan) cell — i.e. any cell occupying column C also
 * occupies C−1 or C+1. This is the column analogue of {@link isRowMovable}.
 *
 * rowspan does NOT block: a rowspan cell sits in a single column, so the whole
 * column (including it) relocates cleanly — the cell just moves once (see
 * {@link reorderColumnNode}) and keeps spanning its rows.
 */
export function isColumnMovable(table: PMNode, colIndex: number): boolean {
  const map = TableMap.get(table);
  if (colIndex < 0 || colIndex >= map.width) return false;
  for (let row = 0; row < map.height; row++) {
    const rect = map.findCell(map.map[row * map.width + colIndex]!);
    // `rect.left`/`rect.right` are grid COLUMN coords (right is exclusive).
    if (rect.left < colIndex || rect.right > colIndex + 1) return false;
  }
  return true;
}

/**
 * Is the vertical boundary at `gapIndex` (0..width) free of a colspan crossing
 * it? Dropping a column into a gap a colspan straddles would split the merge.
 * Table left (0) / right (width) edges are always clean.
 */
export function isColumnGapClean(table: PMNode, gapIndex: number): boolean {
  const map = TableMap.get(table);
  if (gapIndex <= 0 || gapIndex >= map.width) return true; // table edges
  for (let row = 0; row < map.height; row++) {
    const rect = map.findCell(map.map[row * map.width + gapIndex]!);
    if (rect.left < gapIndex) return false; // a colspan straddles this boundary
  }
  return true;
}

/** Number of leading columns whose cells are ALL header cells (pinned header column). */
export function headerColumnCount(table: PMNode): number {
  const map = TableMap.get(table);
  let count = 0;
  for (let col = 0; col < map.width; col++) {
    let allHeader = map.height > 0;
    for (let row = 0; row < map.height; row++) {
      const cell = table.nodeAt(map.map[row * map.width + col]!);
      if (!cell || cell.type.name !== 'tableHeader') allHeader = false;
    }
    if (allHeader) count += 1;
    else break;
  }
  return count;
}

/**
 * Rebuild the table node with column `sourceCol` moved to `gapIndex`. Returns
 * `null` for a no-op / out-of-range.
 *
 * Rather than N fragile per-cell position moves, we permute columns and rebuild
 * each row: a row's child cells are exactly its *originating* cells (rect.top
 * === r) in left-to-right column order, so re-sorting them by the new column
 * index reorders the column. rowspan cells are children of one row only, so
 * they move exactly ONCE and stay consistent across the rows they cover. The
 * caller must have gated colspan straddles (isColumnMovable / isColumnGapClean),
 * which guarantees every colspan group stays contiguous under the permutation.
 * Cells move whole — content, attrs, `colwidth`, header status all travel — so
 * a resized column keeps its width at the new index.
 */
export function reorderColumnNode(
  table: PMNode,
  sourceCol: number,
  gapIndex: number,
): PMNode | null {
  const map = TableMap.get(table);
  const width = map.width;
  if (sourceCol < 0 || sourceCol >= width) return null;
  if (gapIndex < 0 || gapIndex > width) return null;
  if (gapIndex === sourceCol || gapIndex === sourceCol + 1) return null; // no-op

  // Column permutation: [0..width-1] with sourceCol lifted out and re-inserted.
  const order: number[] = [];
  for (let c = 0; c < width; c++) order.push(c);
  order.splice(sourceCol, 1);
  order.splice(gapIndex > sourceCol ? gapIndex - 1 : gapIndex, 0, sourceCol);
  // newIndexOf[oldColumn] = its position after the move.
  const newIndexOf = new Array<number>(width);
  order.forEach((oldCol, newIdx) => (newIndexOf[oldCol] = newIdx));

  const newRows: PMNode[] = [];
  for (let r = 0; r < map.height; r++) {
    const row = table.child(r);
    // Columns whose cell ORIGINATES in this row, ascending — these line up 1:1
    // with the row's children in order.
    const origCols: number[] = [];
    for (let c = 0; c < width; c++) {
      const rect = map.findCell(map.map[r * width + c]!);
      if (rect.top === r && rect.left === c) origCols.push(c);
    }
    const cells = origCols.map((oldCol, k) => ({ oldCol, node: row.child(k) }));
    cells.sort((a, b) => newIndexOf[a.oldCol]! - newIndexOf[b.oldCol]!);
    newRows.push(row.copy(Fragment.from(cells.map((c) => c.node))));
  }
  return table.copy(Fragment.from(newRows));
}

/**
 * Build the COLUMN reorder transaction: replace the whole table node with the
 * column-permuted rebuild in one atomic, undoable step, then land the selection
 * in a cell of the moved column. `null` for a no-op. Positions read live.
 */
export function buildColumnReorder(
  state: EditorState,
  tablePos: number,
  table: PMNode,
  sourceCol: number,
  gapIndex: number,
): Transaction | null {
  const newTable = reorderColumnNode(table, sourceCol, gapIndex);
  if (!newTable) return null;
  const tr = state.tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable);
  // Final index of the moved column, and its row-0 cell in the rebuilt table.
  const newCol = gapIndex > sourceCol ? gapIndex - 1 : gapIndex;
  const cellRel = TableMap.get(newTable).map[newCol] ?? 0;
  tr.setSelection(TextSelection.near(tr.doc.resolve(tablePos + 1 + cellRel + 1)));
  return tr.scrollIntoView();
}

/**
 * Build the reorder transaction. Returns `null` for a no-op (source dropped in
 * its own gap, or out-of-range input). Positions are read from the passed
 * (current) state at call time — never cached across a transaction.
 */
export function buildReorder(
  state: EditorState,
  tablePos: number,
  table: PMNode,
  sourceIndex: number,
  gapIndex: number,
): Transaction | null {
  const rowCount = table.childCount;
  if (sourceIndex < 0 || sourceIndex >= rowCount) return null;
  if (gapIndex < 0 || gapIndex > rowCount) return null;
  // Dropping into the source row's own slot changes nothing.
  if (gapIndex === sourceIndex || gapIndex === sourceIndex + 1) return null;

  const positions = rowPositions(table, tablePos);
  const src = positions[sourceIndex]!;
  const sourceNode = table.child(sourceIndex);

  // Insertion anchor = start of gap `gapIndex` in the ORIGINAL doc; gap ===
  // rowCount means "after the last row" (end of table content).
  const insAt = gapIndex < rowCount ? positions[gapIndex]!.from : positions[rowCount - 1]!.to;

  const tr = state.tr;
  // Delete the source row, then map the insertion anchor through that deletion
  // so a downward move lands at the right place automatically (this mapping is
  // what keeps the math correct without hand-adjusting for the shift).
  tr.delete(src.from, src.to);
  const mappedIns = tr.mapping.map(insAt);
  tr.insert(mappedIns, sourceNode);

  // Put the cursor inside the moved row's first cell so focus doesn't jump.
  const sel = TextSelection.near(tr.doc.resolve(mappedIns + 1));
  tr.setSelection(sel);

  return tr.scrollIntoView();
}
