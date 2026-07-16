/**
 * Table node set for the editor (Tiptap v2 — four separate node extensions).
 *
 * Cells carry two extra attributes beyond the prosemirror-tables defaults
 * (colspan/rowspan/colwidth): `backgroundColor` and `verticalAlign`. Text
 * alignment inside a cell is handled by the existing TextAlign extension acting
 * on the cell's paragraph content, so we don't duplicate it here.
 *
 * Custom commands `duplicateRow` / `duplicateColumn` are added because
 * prosemirror-tables has no built-in for them.
 */
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TableMap } from '@tiptap/pm/tables';
import type { EditorState } from '@tiptap/pm/state';
import { TableRowReorder } from './tableRowReorder';
import { TableColumnReorder } from './tableColumnReorder';

/** Shared extra attributes for cells + header cells. */
function cellAttributes() {
  return {
    backgroundColor: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) =>
        el.style.backgroundColor || el.getAttribute('data-background-color') || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.backgroundColor
          ? {
              // mergeAttributes concatenates `style` across attributes, so this
              // composes with verticalAlign below rather than overwriting it.
              style: `background-color: ${attrs.backgroundColor as string}`,
              'data-background-color': attrs.backgroundColor as string,
            }
          : {},
    },
    verticalAlign: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => el.style.verticalAlign || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign as string}` } : {},
    },
  };
}

/** Find the table node + its start position enclosing the current selection. */
function findTable(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.spec.tableRole === 'table') {
      const start = $from.before(depth);
      return { node, pos: start, start: start + 1 };
    }
  }
  return null;
}

/**
 * Position of the current cell's start, RELATIVE to the table content start —
 * i.e. in the same coordinate space as `TableMap.map` entries. Works for both a
 * plain text cursor and a CellSelection (a cursor is *inside* the cell, so we
 * walk up to the cell node's boundary rather than using the raw cursor pos).
 */
function currentCellRel(state: EditorState, tableStart: number): number {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const role = $from.node(d).type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') return $from.before(d) - tableStart;
  }
  return -1;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableExtras: {
      duplicateRow: () => ReturnType;
      duplicateColumn: () => ReturnType;
    };
  }
}

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() };
  },
});

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() };
  },
});

export const CustomTable = Table.extend({
  // Global table shortcuts — active only when the cursor is in a table (each
  // command returns false outside one, so the binding falls through). Mirrors
  // the shortcuts shown in the table context menu.
  addKeyboardShortcuts() {
    const run = (name: string) => () =>
      (this.editor.commands as unknown as Record<string, () => boolean>)[name]!();
    return {
      'Alt-Shift-ArrowUp': run('addRowBefore'),
      'Alt-Shift-ArrowDown': run('addRowAfter'),
      'Mod-d': run('duplicateRow'),
      'Alt-Backspace': run('deleteRow'),
      'Alt-Shift-ArrowLeft': run('addColumnBefore'),
      'Alt-Shift-ArrowRight': run('addColumnAfter'),
      'Mod-Shift-d': run('duplicateColumn'),
      'Alt-Shift-Backspace': run('deleteColumn'),
      'Mod-m': run('mergeCells'),
      'Mod-Shift-m': run('splitCell'),
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),

      // Duplicate the row containing the selection, inserting the copy directly
      // below it. Row cloning is safe w.r.t. colspans (we clone whole row nodes).
      duplicateRow:
        () =>
        ({ state, dispatch }) => {
          const table = findTable(state);
          if (!table) return false;
          const map = TableMap.get(table.node);
          const rel = currentCellRel(state, table.start);
          const rowIndex = rel >= 0 ? findRow(map, rel) : -1;
          if (rowIndex < 0) return false;
          const rowNode = table.node.child(rowIndex);
          if (dispatch) {
            const tr = state.tr;
            // Insert after the row: position at the end of that row.
            const insertPos = table.start + rowEndOffset(table.node, rowIndex);
            tr.insert(insertPos, rowNode.copy(rowNode.content));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      // Duplicate the column containing the selection. Best-effort for spans:
      // clones the cell found at the target column in each row (see README —
      // columns crossing merged cells are not perfectly handled).
      duplicateColumn:
        () =>
        ({ state, dispatch }) => {
          const table = findTable(state);
          if (!table) return false;
          const map = TableMap.get(table.node);
          const rel = currentCellRel(state, table.start);
          const colIndex = rel >= 0 ? findColumn(map, rel) : -1;
          if (colIndex < 0) return false;
          if (dispatch) {
            const tr = state.tr;
            // Insert right-to-left so earlier insert positions stay valid.
            for (let row = map.height - 1; row >= 0; row--) {
              const cellRel = map.map[row * map.width + colIndex]!;
              const cellStart = table.start + cellRel;
              const cell = state.doc.nodeAt(cellStart);
              if (!cell) continue;
              const after = cellStart + cell.nodeSize;
              tr.insert(tr.mapping.map(after), cell.copy(cell.content));
            }
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },
});

/* ----------------- TableMap helpers (pure position math) ----------------- */

function findRow(map: TableMap, relCellPos: number): number {
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.map[row * map.width + col] === relCellPos) return row;
    }
  }
  return -1;
}

function findColumn(map: TableMap, relCellPos: number): number {
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.map[row * map.width + col] === relCellPos) return col;
    }
  }
  return -1;
}

/** Offset (relative to table start) of the end of a given row. */
function rowEndOffset(table: import('@tiptap/pm/model').Node, rowIndex: number): number {
  let offset = 0;
  for (let i = 0; i <= rowIndex; i++) offset += table.child(i).nodeSize;
  return offset;
}

export function buildTableExtensions() {
  return [
    CustomTable.configure({
      resizable: true, // enables the column drag-resize handles
      lastColumnResizable: true,
      cellMinWidth: 48, // matches the CSS min-width so resize never collapses a cell
      allowTableNodeSelection: true,
    }),
    TableRow,
    CustomTableHeader,
    CustomTableCell,
    TableRowReorder, // drag-to-reorder row handles (bespoke plugin)
    TableColumnReorder, // drag-to-reorder column handles (bespoke plugin)
  ];
}
