/**
 * Drag-to-reorder for table COLUMNS (Tiptap v2, bespoke) — the sibling of
 * tableRowReorder.ts, sharing its structure and its editability-safe approach
 * (plain pointer events, never `setEditable`, idempotent teardown), so it can't
 * re-break the cell toolbar.
 *
 * A column is not a node, so the move is a single transaction that rebuilds the
 * table with columns permuted (see buildColumnReorder / reorderColumnNode) —
 * never a DOM move. All chrome here is local-only DOM (Yjs-safe).
 *
 * Policies: a column that straddles a `colspan` merge is blocked with an error
 * toast (rowspan does NOT block — a rowspan cell sits in one column and moves
 * once); leading all-header columns are pinned.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { ResolvedPos } from '@tiptap/pm/model';
import { TableMap } from '@tiptap/pm/tables';
import {
  buildColumnReorder,
  headerColumnCount,
  isColumnGapClean,
  isColumnMovable,
} from './tableReorder';
import {
  COLUMN_MOVE_MESSAGE,
  dismissTableMoveError,
  showTableMoveError,
} from './tableMoveErrorToast';
import { DRAG_DOTS_HORIZONTAL_SVG } from '../../components/dragDots';

const HANDLE_H = 20; // ≥ 20px hit target
const HANDLE_GAP = 1; // sit the handle right up against the table (small visual gap)
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_STEP = 12;

const showColumnMoveError = () => showTableMoveError(COLUMN_MOVE_MESSAGE);

interface Span {
  left: number;
  width: number;
}

/** Innermost table enclosing a resolved position (handles nested tables). */
function findTableAt($pos: ResolvedPos): { pos: number } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.spec.tableRole === 'table') return { pos: $pos.before(depth) };
  }
  return null;
}

class ColumnReorderView {
  private scroller: HTMLElement | null;
  private listenerHost: HTMLElement; // where the hover listeners currently live
  private layer: HTMLElement;
  private handles: HTMLElement[] = [];
  private indicator: HTMLElement;
  private ghost: HTMLElement | null = null;

  private shownTablePos: number | null = null;
  private drag: { tablePos: number; sourceCol: number; headerCols: number; dimmed: HTMLElement[] } | null =
    null;
  private targetGap = -1;
  private raf = 0;
  private autoscrollDir = 0;
  private kbd: { tablePos: number; sourceCol: number; handle: HTMLElement } | null = null;

  private onScrollerMove = (e: MouseEvent) => this.handleHover(e);
  private onScrollerLeave = () => !this.drag && !this.kbd && this.hideHandles();
  private onDocMove = (e: PointerEvent) => this.handleDragMove(e);
  private onDocUp = () => this.endDrag(true);
  private onDocCancel = () => this.endDrag(false);
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drag) {
      e.preventDefault();
      this.endDrag(false);
    }
  };

  constructor(private view: EditorView) {
    this.scroller = view.dom.closest('[data-docs-scroll]') as HTMLElement | null;
    this.layer = document.createElement('div');
    this.layer.className = 'pgn-coldrag-layer';
    this.indicator = document.createElement('div');
    this.indicator.className = 'pgn-coldrag-indicator';
    this.indicator.style.display = 'none';
    this.layer.appendChild(this.indicator);
    (this.scroller ?? view.dom.parentElement)?.appendChild(this.layer);

    // Bootstrap on view.dom; upgraded to the scroller by ensureListeners() once
    // mounted (the scroller is the common ancestor of the page + handle layer, so
    // moving onto a handle no longer fires a mouseleave that hides the handles).
    this.listenerHost = view.dom;
    this.listenerHost.addEventListener('mousemove', this.onScrollerMove);
    this.listenerHost.addEventListener('mouseleave', this.onScrollerLeave);
  }

  /** Upgrade the hover listeners onto the scroller once it's in the DOM. */
  private ensureListeners(): void {
    const s = this.resolveScroller();
    if (s && s !== this.listenerHost) {
      this.listenerHost.removeEventListener('mousemove', this.onScrollerMove);
      this.listenerHost.removeEventListener('mouseleave', this.onScrollerLeave);
      s.addEventListener('mousemove', this.onScrollerMove);
      s.addEventListener('mouseleave', this.onScrollerLeave);
      this.listenerHost = s;
    }
  }

  /**
   * Resolve (and cache) the scroll container lazily. The plugin view is created
   * before the editor DOM is mounted into the scrolling layout, so resolving in
   * the constructor returned null and left handles in raw viewport coordinates
   * (misaligned, and shifting on any layout change such as the outline toggle).
   */
  private resolveScroller(): HTMLElement | null {
    if (!this.scroller || !this.scroller.isConnected) {
      this.scroller = this.view.dom.closest('[data-docs-scroll]') as HTMLElement | null;
    }
    return this.scroller;
  }

  /** Keep the handle layer parented to the scroller so it scrolls with content. */
  private ensureLayerHost(): void {
    const host = this.resolveScroller() ?? this.view.dom.parentElement;
    if (host && this.layer.parentElement !== host) host.appendChild(this.layer);
  }

  /* viewport rect → scroller-content coords (same technique as the row plugin) */
  private toContentTop(viewportTop: number): number {
    const s = this.resolveScroller();
    if (!s) return viewportTop;
    return viewportTop - s.getBoundingClientRect().top + s.scrollTop;
  }
  private toContentLeft(viewportLeft: number): number {
    const s = this.resolveScroller();
    if (!s) return viewportLeft;
    return viewportLeft - s.getBoundingClientRect().left + s.scrollLeft;
  }

  private tableUnderPointer(x: number, y: number): number | null {
    const found = this.view.posAtCoords({ left: x, top: y });
    if (!found) return null;
    const $pos = this.view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos);
    return findTableAt($pos)?.pos ?? null;
  }

  /**
   * Per-column viewport spans, measured from row 0's cell DOMs (row 0 has no
   * covered cells). A colspan cell is split evenly across the columns it spans
   * — only needed to *position* handles for those (blocked) columns.
   */
  private columnSpans(tablePos: number, table: import('@tiptap/pm/model').Node): Span[] | null {
    const map = TableMap.get(table);
    const spans = new Array<Span>(map.width);
    for (let c = 0; c < map.width; ) {
      const cellRel = map.map[c]!;
      const rect = map.findCell(cellRel);
      const dom = this.view.nodeDOM(tablePos + 1 + cellRel);
      if (!(dom instanceof HTMLElement)) {
        c += 1;
        continue;
      }
      const r = dom.getBoundingClientRect();
      const span = rect.right - rect.left;
      for (let i = 0; i < span; i++) spans[c + i] = { left: r.left + (r.width * i) / span, width: r.width / span };
      c += span;
    }
    return spans.every(Boolean) ? spans : null;
  }

  private handleHover(e: MouseEvent) {
    this.ensureListeners(); // upgrade to the scroller once mounted
    if (this.drag || this.kbd) return;
    if (!this.view.editable) return this.hideHandles(); // hidden in viewing mode
    let tablePos = this.tableUnderPointer(e.clientX, e.clientY);
    if (tablePos == null && this.shownTablePos != null && this.pointerInGutter(e)) {
      tablePos = this.shownTablePos;
    }
    if (tablePos == null) this.hideHandles();
    else if (tablePos !== this.shownTablePos || !this.handles.length) this.showHandles(tablePos);
  }

  private pointerInGutter(e: MouseEvent): boolean {
    if (this.shownTablePos == null) return false;
    const dom = this.view.nodeDOM(this.shownTablePos) as HTMLElement | null;
    if (!dom) return false;
    const r = dom.getBoundingClientRect();
    return (
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top - (HANDLE_H + HANDLE_GAP + 6) &&
      e.clientY <= r.bottom
    );
  }

  private showHandles(tablePos: number) {
    const table = this.view.state.doc.nodeAt(tablePos);
    const tableDom = this.view.nodeDOM(tablePos) as HTMLElement | null;
    if (!this.view.editable) return this.hideHandles(); // hidden in viewing mode
    if (!table || table.type.spec.tableRole !== 'table' || !tableDom) return this.hideHandles();

    const spans = this.columnSpans(tablePos, table);
    if (!spans) return this.hideHandles();

    this.clearHandles();
    this.ensureLayerHost(); // (re)attach to the scroller now the DOM is mounted
    this.shownTablePos = tablePos;

    const pinned = headerColumnCount(table);
    const tableTop = this.toContentTop(tableDom.getBoundingClientRect().top);
    const fresh: HTMLElement[] = [];

    spans.forEach((sp, col) => {
      if (col < pinned) return; // pinned header columns get no handle
      const movable = isColumnMovable(table, col);
      const h = document.createElement('button');
      h.type = 'button';
      h.className = `pgn-coldrag-handle${movable ? '' : ' is-blocked'}`;
      h.setAttribute(
        'aria-label',
        movable ? 'Drag to reorder column' : 'This column is part of a merged cell and can’t be moved',
      );
      h.title = h.getAttribute('aria-label')!;
      h.style.left = `${this.toContentLeft(sp.left)}px`;
      h.style.top = `${tableTop - HANDLE_H - HANDLE_GAP}px`;
      h.style.width = `${Math.max(sp.width, 20)}px`;
      h.style.height = `${HANDLE_H}px`;
      h.innerHTML = DRAG_DOTS_HORIZONTAL_SVG;
      if (movable) {
        h.addEventListener('pointerdown', (ev) => this.startDrag(ev, tablePos, col));
      } else {
        h.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          showColumnMoveError();
        });
      }
      h.addEventListener('keydown', (ev) => this.onHandleKey(ev, tablePos, col, movable, h));
      this.layer.appendChild(h);
      this.handles.push(h);
      fresh.push(h);
    });

    requestAnimationFrame(() => fresh.forEach((h) => h.classList.add('is-in')));
  }

  private clearHandles() {
    for (const h of this.handles) h.remove();
    this.handles = [];
  }
  private hideHandles() {
    const leaving = this.handles;
    this.handles = [];
    this.shownTablePos = null;
    for (const h of leaving) h.classList.remove('is-in');
    if (leaving.length) window.setTimeout(() => leaving.forEach((h) => h.remove()), 120);
  }

  /* DOMs of every cell in a column (deduped for rowspan) — for source dimming. */
  private columnCellDoms(tablePos: number, table: import('@tiptap/pm/model').Node, col: number): HTMLElement[] {
    const map = TableMap.get(table);
    const seen = new Set<number>();
    const out: HTMLElement[] = [];
    for (let r = 0; r < map.height; r++) {
      const cellRel = map.map[r * map.width + col]!;
      if (seen.has(cellRel)) continue;
      seen.add(cellRel);
      const dom = this.view.nodeDOM(tablePos + 1 + cellRel);
      if (dom instanceof HTMLElement) out.push(dom);
    }
    return out;
  }

  private startDrag(e: PointerEvent, tablePos: number, sourceCol: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement | null)?.classList.add('is-dragging');
    const table = this.view.state.doc.nodeAt(tablePos);
    if (!table) return;
    const dimmed = this.columnCellDoms(tablePos, table, sourceCol);

    this.drag = { tablePos, sourceCol, headerCols: headerColumnCount(table), dimmed };
    this.targetGap = -1;
    document.body.classList.add('pgn-row-dragging'); // reuse: grabbing cursor + user-select:none
    dimmed.forEach((d) => d.classList.add('pgn-coldrag-source'));

    // Ghost: the source column's cells stacked vertically.
    const ghost = document.createElement('div');
    ghost.className = 'pgn-coldrag-ghost';
    ghost.style.width = `${dimmed[0]?.getBoundingClientRect().width ?? 80}px`;
    dimmed.forEach((d) => {
      const cell = document.createElement('div');
      cell.className = 'pgn-coldrag-ghost-cell';
      cell.textContent = d.textContent;
      ghost.appendChild(cell);
    });
    document.body.appendChild(ghost);
    this.ghost = ghost;

    document.addEventListener('pointermove', this.onDocMove);
    document.addEventListener('pointerup', this.onDocUp);
    document.addEventListener('pointercancel', this.onDocCancel);
    document.addEventListener('keydown', this.onKeyDown, true);
    this.handleDragMove(e);
  }

  /** Target gap from pointer X against column midpoints (clamped past pinned cols). */
  private computeGap(clientX: number): number {
    const drag = this.drag!;
    const table = this.view.state.doc.nodeAt(drag.tablePos);
    if (!table) return -1;
    const spans = this.columnSpans(drag.tablePos, table);
    if (!spans) return -1;
    let gap = spans.length; // default: after the last column
    for (let c = 0; c < spans.length; c++) {
      if (clientX < spans[c]!.left + spans[c]!.width / 2) {
        gap = c;
        break;
      }
    }
    return Math.max(gap, drag.headerCols); // pinned header columns
  }

  private handleDragMove(e: PointerEvent) {
    if (!this.drag) return;
    if (this.ghost) {
      this.ghost.style.top = `${e.clientY + 12}px`;
      this.ghost.style.left = `${e.clientX + 12}px`;
    }
    this.targetGap = this.computeGap(e.clientX);
    this.positionIndicator(this.drag.tablePos);
    this.updateAutoscroll(e.clientX);
  }

  private positionIndicator(tablePos: number) {
    if (this.targetGap < 0) return;
    const table = this.view.state.doc.nodeAt(tablePos);
    const tableDom = this.view.nodeDOM(tablePos) as HTMLElement | null;
    if (!table || !tableDom) return;
    const spans = this.columnSpans(tablePos, table);
    if (!spans) return;
    const r = tableDom.getBoundingClientRect();

    const x =
      this.targetGap >= spans.length
        ? spans[spans.length - 1]!.left + spans[spans.length - 1]!.width
        : spans[this.targetGap]!.left;
    this.indicator.style.display = 'block';
    this.indicator.style.left = `${this.toContentLeft(x)}px`;
    this.indicator.style.top = `${this.toContentTop(r.top)}px`;
    this.indicator.style.height = `${r.height}px`;
  }

  private updateAutoscroll(clientX: number) {
    const s = this.scroller;
    if (!s) return;
    const r = s.getBoundingClientRect();
    if (clientX < r.left + AUTOSCROLL_EDGE) this.autoscrollDir = -1;
    else if (clientX > r.right - AUTOSCROLL_EDGE) this.autoscrollDir = 1;
    else this.autoscrollDir = 0;

    if (this.autoscrollDir !== 0 && !this.raf) {
      const tick = () => {
        if (!this.drag || this.autoscrollDir === 0) {
          this.raf = 0;
          return;
        }
        s.scrollLeft += this.autoscrollDir * AUTOSCROLL_STEP;
        this.positionIndicator(this.drag.tablePos);
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  /** Single idempotent end-of-drag path (drop / cancel / Escape / unmount). */
  private endDrag(commit: boolean) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;

    document.removeEventListener('pointermove', this.onDocMove);
    document.removeEventListener('pointerup', this.onDocUp);
    document.removeEventListener('pointercancel', this.onDocCancel);
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.autoscrollDir = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;

    if (commit && this.targetGap >= 0) {
      const state = this.view.state;
      const table = state.doc.nodeAt(drag.tablePos);
      if (table && table.type.spec.tableRole === 'table') {
        const beforeCols = TableMap.get(table).width;
        const tr = buildColumnReorder(state, drag.tablePos, table, drag.sourceCol, this.targetGap);
        // Safety net: only gate a REAL move; abort (never dispatch) if the source
        // column straddles a colspan OR the drop boundary would split one.
        if (tr && (!isColumnMovable(table, drag.sourceCol) || !isColumnGapClean(table, this.targetGap))) {
          showColumnMoveError();
        } else if (tr) {
          this.view.dispatch(tr);
          const after = this.view.state.doc.nodeAt(drag.tablePos);
          const afterCols =
            after && after.type.spec.tableRole === 'table' ? TableMap.get(after).width : -1;
          if (afterCols !== beforeCols) {
            console.error(
              `[tableColumnReorder] column count changed ${beforeCols} → ${afterCols} — possible duplication bug`,
            );
          }
        }
      }
    }

    drag.dimmed.forEach((d) => d.classList.remove('pgn-coldrag-source'));
    document.body.classList.remove('pgn-row-dragging');
    this.ghost?.remove();
    this.ghost = null;
    this.indicator.style.display = 'none';
    this.targetGap = -1;
    this.hideHandles();
  }

  /* ------------------------- keyboard reorder ------------------------- */
  private onHandleKey(
    e: KeyboardEvent,
    tablePos: number,
    sourceCol: number,
    movable: boolean,
    handle: HTMLElement,
  ) {
    if (this.drag) return;
    const isEnter = e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';

    if (!this.kbd) {
      if (isEnter) {
        e.preventDefault();
        if (!movable) return void showColumnMoveError();
        this.kbd = { tablePos, sourceCol, handle };
        this.targetGap = sourceCol;
        handle.classList.add('is-dragging');
        this.positionIndicator(tablePos);
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const table = this.view.state.doc.nodeAt(this.kbd.tablePos);
      if (!table) return;
      const header = headerColumnCount(table);
      const width = TableMap.get(table).width;
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      this.targetGap = Math.max(header, Math.min(width, this.targetGap + delta));
      this.positionIndicator(this.kbd.tablePos);
    } else if (isEnter) {
      e.preventDefault();
      this.commitKbd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.endKbd();
    }
  }

  private commitKbd() {
    const kbd = this.kbd;
    if (!kbd) return;
    const state = this.view.state;
    const table = state.doc.nodeAt(kbd.tablePos);
    if (table && table.type.spec.tableRole === 'table') {
      if (!isColumnMovable(table, kbd.sourceCol) || !isColumnGapClean(table, this.targetGap)) {
        showColumnMoveError();
      } else {
        const tr = buildColumnReorder(state, kbd.tablePos, table, kbd.sourceCol, this.targetGap);
        if (tr) this.view.dispatch(tr);
      }
    }
    this.endKbd();
  }

  private endKbd() {
    this.kbd?.handle.classList.remove('is-dragging');
    this.kbd = null;
    this.targetGap = -1;
    this.indicator.style.display = 'none';
    this.hideHandles();
  }

  update() {
    if (!this.drag && !this.kbd && this.shownTablePos != null) {
      const node = this.view.state.doc.nodeAt(this.shownTablePos);
      if (node && node.type.spec.tableRole === 'table') this.showHandles(this.shownTablePos);
      else this.hideHandles();
    }
  }

  destroy() {
    this.endDrag(false);
    this.kbd = null;
    dismissTableMoveError();
    this.listenerHost.removeEventListener('mousemove', this.onScrollerMove);
    this.listenerHost.removeEventListener('mouseleave', this.onScrollerLeave);
    document.body.classList.remove('pgn-row-dragging');
    this.layer.remove();
  }
}

export const tableColumnReorderKey = new PluginKey('tableColumnReorder');

export const TableColumnReorder = Extension.create({
  name: 'tableColumnReorder',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableColumnReorderKey,
        view: (editorView) => new ColumnReorderView(editorView),
      }),
    ];
  },
});
