import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { buildExtensions } from '../src/editor/extensionsList';
import {
  buildReorder,
  headerColumnCount,
  headerRowCount,
  isColumnGapClean,
  isColumnMovable,
  isGapClean,
  isRowMovable,
  reorderColumnNode,
  rowPositions,
} from '../src/editor/extensions/tableReorder';
import { TableMap } from '@tiptap/pm/tables';

function makeEditor(tableHTML: string) {
  return new Editor({ extensions: buildExtensions(), content: tableHTML });
}

function findTable(doc: PMNode): { node: PMNode; pos: number } {
  let res: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (!res && node.type.name === 'table') res = { node, pos };
    return !res;
  });
  return res!;
}

/** First-cell text of every row, in order — the reorder fingerprint. */
function rowTexts(table: PMNode): string[] {
  const out: string[] = [];
  table.forEach((row) => out.push(row.child(0).textContent));
  return out;
}

const THREE_ROWS = `
  <table><tbody>
    <tr><td>R1</td><td>a</td></tr>
    <tr><td>R2</td><td>b</td></tr>
    <tr><td>R3</td><td>c</td></tr>
  </tbody></table>`;

describe('rowPositions', () => {
  it('returns one entry per row with matching node sizes', () => {
    const ed = makeEditor(THREE_ROWS);
    const { node, pos } = findTable(ed.state.doc);
    const positions = rowPositions(node, pos);
    expect(positions).toHaveLength(3);
    positions.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(p.to - p.from).toBe(node.child(i).nodeSize); // exact — off-by-one guard
    });
    // Rows are contiguous inside the table.
    expect(positions[0]!.to).toBe(positions[1]!.from);
    expect(positions[1]!.to).toBe(positions[2]!.from);
    ed.destroy();
  });
});

describe('buildReorder — the move is a transaction, never a duplication', () => {
  function move(html: string, source: number, gap: number) {
    const ed = makeEditor(html);
    const { node, pos } = findTable(ed.state.doc);
    const before = rowTexts(node);
    const tr = buildReorder(ed.state, pos, node, source, gap);
    if (!tr) {
      ed.destroy();
      return { tr: null as null, before, after: before, count: before.length };
    }
    const next = ed.state.apply(tr);
    const table = findTable(next.doc);
    const after = rowTexts(table.node);
    ed.destroy();
    return { tr, before, after, count: table.node.childCount };
  }

  it('moves row 1 → last (R1 to the end)', () => {
    const r = move(THREE_ROWS, 0, 3);
    expect(r.after).toEqual(['R2', 'R3', 'R1']);
  });

  it('moves last → first (R3 to the front)', () => {
    const r = move(THREE_ROWS, 2, 0);
    expect(r.after).toEqual(['R3', 'R1', 'R2']);
  });

  it('moves a middle row down by one', () => {
    const r = move(THREE_ROWS, 0, 2); // R1 between R2 and R3
    expect(r.after).toEqual(['R2', 'R1', 'R3']);
  });

  it('ROW COUNT IS UNCHANGED and no row is duplicated or lost (the #1 bug)', () => {
    for (const [s, g] of [
      [0, 3],
      [2, 0],
      [0, 2],
      [1, 0],
    ] as const) {
      const r = move(THREE_ROWS, s, g);
      expect(r.count).toBe(3); // no stray/duplicated row
      expect([...r.after].sort()).toEqual(['R1', 'R2', 'R3']); // same rows, reordered
      expect(new Set(r.after).size).toBe(3); // no duplicates
    }
  });

  it('is a clean no-op when dropped onto itself', () => {
    expect(move(THREE_ROWS, 1, 1).tr).toBeNull(); // same slot
    expect(move(THREE_ROWS, 1, 2).tr).toBeNull(); // the gap just below itself
    expect(move(THREE_ROWS, 1, 1).after).toEqual(['R1', 'R2', 'R3']);
  });

  it('rejects out-of-range input', () => {
    const ed = makeEditor(THREE_ROWS);
    const { node, pos } = findTable(ed.state.doc);
    expect(buildReorder(ed.state, pos, node, -1, 0)).toBeNull();
    expect(buildReorder(ed.state, pos, node, 0, 99)).toBeNull();
    ed.destroy();
  });

  it('single-row table has nothing to reorder', () => {
    const r = move(`<table><tbody><tr><td>Only</td></tr></tbody></table>`, 0, 1);
    expect(r.tr).toBeNull();
  });
});

describe('policy helpers', () => {
  it('headerRowCount detects a leading header row', () => {
    const withHeader = makeEditor(
      `<table><tbody>
         <tr><th>H1</th><th>H2</th></tr>
         <tr><td>a</td><td>b</td></tr>
       </tbody></table>`,
    );
    expect(headerRowCount(findTable(withHeader.state.doc).node)).toBe(1);
    withHeader.destroy();

    const noHeader = makeEditor(THREE_ROWS);
    expect(headerRowCount(findTable(noHeader.state.doc).node)).toBe(0);
    noHeader.destroy();
  });

  it('isRowMovable — rowspan that STARTS in the row → not movable', () => {
    // Row 0 holds a cell spanning rows 0–1; row 1 is covered by it.
    const ed = makeEditor(
      `<table><tbody>
         <tr><td rowspan="2">X</td><td>a</td></tr>
         <tr><td>b</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    expect(isRowMovable(t, 0)).toBe(false); // span starts here, extends below
    expect(isRowMovable(t, 1)).toBe(false); // covered by a span starting above
    ed.destroy();
  });

  it('isRowMovable — colspan-only row → movable (horizontal merge never blocks)', () => {
    const ed = makeEditor(
      `<table><tbody>
         <tr><td colspan="2">X</td></tr>
         <tr><td>a</td><td>b</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    expect(isRowMovable(t, 0)).toBe(true);
    expect(isRowMovable(t, 1)).toBe(true);
    ed.destroy();
  });

  it('isRowMovable — no merges → every row movable', () => {
    const ed = makeEditor(THREE_ROWS);
    const t = findTable(ed.state.doc).node;
    expect([0, 1, 2].map((i) => isRowMovable(t, i))).toEqual([true, true, true]);
    ed.destroy();
  });

  it('isGapClean — a vertical span makes the crossed boundary dirty, edges stay clean', () => {
    const ed = makeEditor(
      `<table><tbody>
         <tr><td rowspan="2">X</td><td>a</td></tr>
         <tr><td>b</td></tr>
         <tr><td>c</td><td>d</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    expect(isGapClean(t, 0)).toBe(true); // top edge
    expect(isGapClean(t, 1)).toBe(false); // X spans rows 0–1 → crosses this gap
    expect(isGapClean(t, 2)).toBe(true); // between the merged block and row 2
    expect(isGapClean(t, 3)).toBe(true); // bottom edge
    ed.destroy();
  });
});

/* --------------------------- COLUMN reordering --------------------------- */

// Row-0 cell text per column, left→right — the column-order fingerprint.
function colTexts(table: PMNode): string[] {
  const out: string[] = [];
  table.child(0).forEach((cell) => out.push(cell.textContent));
  return out;
}
const GRID_3COL = `
  <table><tbody>
    <tr><td>A</td><td>B</td><td>C</td></tr>
    <tr><td>a</td><td>b</td><td>c</td></tr>
  </tbody></table>`;

describe('reorderColumnNode — move is a rebuild, never a duplication', () => {
  function move(html: string, sourceCol: number, gap: number) {
    const ed = makeEditor(html);
    const t = findTable(ed.state.doc).node;
    const before = { width: TableMap.get(t).width, cells: t.nodeSize };
    const next = reorderColumnNode(t, sourceCol, gap);
    ed.destroy();
    return { next, before };
  }

  it('moves first column → last', () => {
    const r = move(GRID_3COL, 0, 3);
    expect(colTexts(r.next!)).toEqual(['B', 'C', 'A']);
  });

  it('moves last column → first', () => {
    const r = move(GRID_3COL, 2, 0);
    expect(colTexts(r.next!)).toEqual(['C', 'A', 'B']);
  });

  it('COLUMN COUNT + CELL COUNT unchanged, no duplication (the #1 bug)', () => {
    for (const [s, g] of [
      [0, 3],
      [2, 0],
      [0, 2],
    ] as const) {
      const r = move(GRID_3COL, s, g);
      const m = TableMap.get(r.next!);
      expect(m.width).toBe(3); // no lost/added column
      // Total cells unchanged (2 rows × 3 cols = 6), no orphans/dupes.
      let cellCount = 0;
      r.next!.descendants((n) => {
        if (n.type.spec.tableRole === 'cell' || n.type.spec.tableRole === 'header_cell')
          cellCount += 1;
        return true;
      });
      expect(cellCount).toBe(6);
      expect([...colTexts(r.next!)].sort()).toEqual(['A', 'B', 'C']);
    }
  });

  it('is a clean no-op dropped onto itself / single-column table', () => {
    const ed = makeEditor(GRID_3COL);
    const t = findTable(ed.state.doc).node;
    expect(reorderColumnNode(t, 1, 1)).toBeNull(); // own slot
    expect(reorderColumnNode(t, 1, 2)).toBeNull(); // the gap just right of itself
    ed.destroy();
    const single = makeEditor(`<table><tbody><tr><td>only</td></tr></tbody></table>`);
    expect(reorderColumnNode(findTable(single.state.doc).node, 0, 1)).toBeNull();
    single.destroy();
  });

  it('carries the column WIDTH to its new position', () => {
    // Middle column has an explicit colwidth; move it to the front.
    const ed = makeEditor(
      `<table><tbody>
         <tr><td>A</td><td colwidth="180">B</td><td>C</td></tr>
         <tr><td>a</td><td colwidth="180">b</td><td>c</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    const next = reorderColumnNode(t, 1, 0)!; // B → front
    expect(colTexts(next)).toEqual(['B', 'A', 'C']);
    // The moved (now first) column's cell keeps its colwidth.
    expect(next.child(0).child(0).attrs.colwidth).toEqual([180]);
    ed.destroy();
  });

  it('rowspan cell moves ONCE and stays consistent (uses TableMap identity)', () => {
    // Col 0 has a cell spanning both rows; move col 0 to the end.
    const ed = makeEditor(
      `<table><tbody>
         <tr><td rowspan="2">M</td><td>B</td><td>C</td></tr>
         <tr><td>b</td><td>c</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    const next = reorderColumnNode(t, 0, 3)!;
    const m = TableMap.get(next);
    expect(m.width).toBe(3);
    // The rowspan cell now sits in the last column, still spanning 2 rows, once.
    let rowspanCells = 0;
    next.descendants((n) => {
      if ((Number(n.attrs.rowspan) || 1) > 1) rowspanCells += 1;
      return true;
    });
    expect(rowspanCells).toBe(1);
    expect(colTexts(next)).toEqual(['B', 'C', 'M']);
    ed.destroy();
  });
});

describe('column policy helpers', () => {
  it('isColumnMovable — colspan straddle blocks, colspan-only elsewhere allows', () => {
    const ed = makeEditor(
      `<table><tbody>
         <tr><td colspan="2">X</td><td>C</td></tr>
         <tr><td>a</td><td>b</td><td>c</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    expect(isColumnMovable(t, 0)).toBe(false); // part of the colspan
    expect(isColumnMovable(t, 1)).toBe(false); // part of the colspan
    expect(isColumnMovable(t, 2)).toBe(true); // standalone column
    ed.destroy();
  });

  it('isColumnMovable — rowspan does NOT block a column', () => {
    const ed = makeEditor(
      `<table><tbody>
         <tr><td rowspan="2">M</td><td>B</td></tr>
         <tr><td>b</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    expect(isColumnMovable(t, 0)).toBe(true);
    expect(isColumnMovable(t, 1)).toBe(true);
    ed.destroy();
  });

  it('isColumnGapClean — a colspan makes the crossed vertical boundary dirty', () => {
    const ed = makeEditor(
      `<table><tbody>
         <tr><td colspan="2">X</td><td>C</td></tr>
         <tr><td>a</td><td>b</td><td>c</td></tr>
       </tbody></table>`,
    );
    const t = findTable(ed.state.doc).node;
    expect(isColumnGapClean(t, 0)).toBe(true); // left edge
    expect(isColumnGapClean(t, 1)).toBe(false); // inside the colspan
    expect(isColumnGapClean(t, 2)).toBe(true); // after the colspan block
    expect(isColumnGapClean(t, 3)).toBe(true); // right edge
    ed.destroy();
  });

  it('headerColumnCount detects a leading header column', () => {
    const ed = makeEditor(
      `<table><tbody>
         <tr><th>H</th><td>B</td></tr>
         <tr><th>H2</th><td>b</td></tr>
       </tbody></table>`,
    );
    expect(headerColumnCount(findTable(ed.state.doc).node)).toBe(1);
    ed.destroy();
    const plain = makeEditor(GRID_3COL);
    expect(headerColumnCount(findTable(plain.state.doc).node)).toBe(0);
    plain.destroy();
  });
});
