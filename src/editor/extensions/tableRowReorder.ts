/**
 * Notion-style drag-to-reorder for table rows (Tiptap v2, bespoke).
 *
 * Interaction only decides source row index + target gap index; the move is a
 * single transaction (see tableReorder.ts) — DOM is never moved directly.
 *
 * Everything here is LOCAL view state rendered as plain DOM in an overlay layer
 * (no React → no remount crashes; Yjs-safe → nothing transient touches the doc).
 * We use plain pointer events (never HTML5 draggable), so we don't fight
 * ProseMirror's "possessive" drag handling, and it works inside iframes.
 *
 * Policies: tables with a `rowspan > 1` cell disable reordering (moving a row
 * would slice a vertical span); leading all-header rows are pinned.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { ResolvedPos } from '@tiptap/pm/model';
import {
  buildReorder,
  headerRowCount,
  isGapClean,
  isRowMovable,
  rowPositions,
} from './tableReorder';
import {
  ROW_MOVE_MESSAGE,
  dismissTableMoveError,
  showTableMoveError,
} from './tableMoveErrorToast';
import { DRAG_DOTS_VERTICAL_SVG } from '../../components/dragDots';

const HANDLE_W = 20; // ≥ 20px hit target
const HANDLE_GAP = 6;
const AUTOSCROLL_EDGE = 48; // px from the scroller edge that triggers autoscroll
const AUTOSCROLL_STEP = 12;

const showRowMoveError = () => showTableMoveError(ROW_MOVE_MESSAGE);

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
}

/** Innermost table node enclosing a resolved position (handles nesting). */
function findTableAt($pos: ResolvedPos): { pos: number } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.spec.tableRole === 'table') {
      return { pos: $pos.before(depth) };
    }
  }
  return null;
}

class RowReorderView {
  private scroller: HTMLElement | null;
  private layer: HTMLElement;
  private handles: HTMLElement[] = [];
  private indicator: HTMLElement;
  private ghost: HTMLElement | null = null;

  private shownTablePos: number | null = null;
  private drag: {
    tablePos: number;
    sourceIndex: number;
    sourceRowDom: HTMLElement | null;
    headerRows: number;
  } | null = null;
  private targetGap = -1;
  private raf = 0;
  private autoscrollDir = 0;
  // Keyboard-driven reorder (Enter picks up, arrows move, Enter drops, Esc cancels).
  private kbd: { tablePos: number; sourceIndex: number; handle: HTMLElement } | null = null;

  private onScrollerMove = (e: MouseEvent) => this.handleHover(e);
  private onScrollerLeave = () => !this.drag && !this.kbd && this.hideHandles();
  private onDocMove = (e: PointerEvent) => this.handleDragMove(e);
  private onDocUp = () => this.endDrag(true); // committed drop
  private onDocCancel = () => this.endDrag(false); // pointer canceled (e.g. released off-window)
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drag) {
      e.preventDefault();
      this.endDrag(false); // Escape aborts the drag with no reorder
    }
  };

  constructor(private view: EditorView) {
    this.scroller = view.dom.closest('[data-docs-scroll]') as HTMLElement | null;
    this.layer = document.createElement('div');
    this.layer.className = 'pgn-rowdrag-layer';
    this.indicator = document.createElement('div');
    this.indicator.className = 'pgn-rowdrag-indicator';
    this.indicator.style.display = 'none';
    this.layer.appendChild(this.indicator);
    // The layer lives inside the scroll container so handles scroll with the
    // content (absolute children of a scroller scroll with it).
    (this.scroller ?? view.dom.parentElement)?.appendChild(this.layer);

    const host = this.scroller ?? view.dom;
    host.addEventListener('mousemove', this.onScrollerMove);
    host.addEventListener('mouseleave', this.onScrollerLeave);
  }

  /* ----- geometry: viewport rect → scroller-content coordinates ----- */
  private toContent(r: DOMRect): Rect {
    const s = this.scroller;
    const base = s ? s.getBoundingClientRect() : ({ top: 0, left: 0 } as DOMRect);
    const sl = s?.scrollLeft ?? 0;
    const st = s?.scrollTop ?? 0;
    return {
      top: r.top - base.top + st,
      left: r.left - base.left + sl,
      width: r.width,
      height: r.height,
      bottom: r.top - base.top + st + r.height,
    };
  }

  private tableUnderPointer(x: number, y: number): number | null {
    const found = this.view.posAtCoords({ left: x, top: y });
    if (!found) return null;
    const $pos = this.view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos);
    return findTableAt($pos)?.pos ?? null;
  }

  /* ---------------------------- hover ---------------------------- */
  private handleHover(e: MouseEvent) {
    if (this.drag || this.kbd) return; // a drag (pointer or keyboard) owns the handles
    if (!this.view.editable) return this.hideHandles(); // hidden in viewing mode
    let tablePos = this.tableUnderPointer(e.clientX, e.clientY);
    // Keep handles visible while the pointer is in the gutter of the shown
    // table (posAtCoords may miss the empty margin area to the left).
    if (tablePos == null && this.shownTablePos != null && this.pointerInGutter(e)) {
      tablePos = this.shownTablePos;
    }
    if (tablePos == null) this.hideHandles();
    // Same table already shown → don't rebuild (avoids re-triggering the fade
    // on every mousemove).
    else if (tablePos !== this.shownTablePos || !this.handles.length) this.showHandles(tablePos);
  }

  private pointerInGutter(e: MouseEvent): boolean {
    if (this.shownTablePos == null) return false;
    const dom = this.view.nodeDOM(this.shownTablePos) as HTMLElement | null;
    if (!dom) return false;
    const r = dom.getBoundingClientRect();
    return (
      e.clientY >= r.top &&
      e.clientY <= r.bottom &&
      e.clientX >= r.left - (HANDLE_W + HANDLE_GAP + 6) &&
      e.clientX <= r.right
    );
  }

  private rowDom(rowFrom: number): HTMLElement | null {
    const dom = this.view.nodeDOM(rowFrom);
    return dom instanceof HTMLElement ? dom : null;
  }

  private showHandles(tablePos: number) {
    const table = this.view.state.doc.nodeAt(tablePos);
    const tableDom = this.view.nodeDOM(tablePos) as HTMLElement | null;
    if (!this.view.editable) return this.hideHandles(); // hidden in viewing mode
    if (!table || table.type.spec.tableRole !== 'table' || !tableDom) return this.hideHandles();

    this.clearHandles();
    this.shownTablePos = tablePos;

    const pinned = headerRowCount(table);
    const tableRect = this.toContent(tableDom.getBoundingClientRect());
    const rows = rowPositions(table, tablePos);
    const fresh: HTMLElement[] = [];

    rows.forEach((rp) => {
      if (rp.index < pinned) return; // pinned header rows get no handle
      const rd = this.rowDom(rp.from);
      if (!rd) return;
      const rc = this.toContent(rd.getBoundingClientRect());

      // PER-ROW policy: only a row that straddles a vertical (rowspan) merge is
      // blocked — colspan-only / unmerged rows drag normally.
      const movable = isRowMovable(table, rp.index);

      const h = document.createElement('button');
      h.type = 'button';
      // tabIndex 0 (default for <button>) → focusable for keyboard reordering.
      h.className = `pgn-rowdrag-handle${movable ? '' : ' is-blocked'}`;
      h.setAttribute(
        'aria-label',
        movable ? 'Drag to reorder row' : 'This row is part of a merged cell and can’t be moved',
      );
      h.title = h.getAttribute('aria-label')!;
      h.style.top = `${rc.top}px`;
      h.style.left = `${tableRect.left - HANDLE_W - HANDLE_GAP}px`;
      h.style.height = `${Math.max(rc.height, 20)}px`;
      h.style.width = `${HANDLE_W}px`;
      h.innerHTML = DRAG_DOTS_VERTICAL_SVG;

      if (movable) {
        h.addEventListener('pointerdown', (ev) => this.startDrag(ev, tablePos, rp.index));
      } else {
        // Enforcement point 1: grabbing a straddling row never starts a drag —
        // it surfaces the error (the required feedback) and does nothing else.
        h.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          showRowMoveError();
        });
      }
      h.addEventListener('keydown', (ev) => this.onHandleKey(ev, tablePos, rp.index, movable, h));
      this.layer.appendChild(h);
      this.handles.push(h);
      fresh.push(h);
    });

    // Fade in (100ms) once created.
    requestAnimationFrame(() => fresh.forEach((h) => h.classList.add('is-in')));
  }

  private clearHandles() {
    for (const h of this.handles) h.remove();
    this.handles = [];
  }

  private hideHandles() {
    // Fade out over 100ms, then remove.
    const leaving = this.handles;
    this.handles = [];
    this.shownTablePos = null;
    for (const h of leaving) h.classList.remove('is-in');
    if (leaving.length) window.setTimeout(() => leaving.forEach((h) => h.remove()), 120);
  }

  /* ---------------------------- drag ---------------------------- */
  private startDrag(e: PointerEvent, tablePos: number, sourceIndex: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement | null)?.classList.add('is-dragging');
    const table = this.view.state.doc.nodeAt(tablePos);
    if (!table) return;
    const pinned = headerRowCount(table);
    const rows = rowPositions(table, tablePos);
    const sourceRow = rows[sourceIndex];
    const sourceRowDom = sourceRow ? this.rowDom(sourceRow.from) : null;

    this.drag = { tablePos, sourceIndex, sourceRowDom, headerRows: pinned };
    this.targetGap = -1;
    document.body.classList.add('pgn-row-dragging');
    if (sourceRowDom) sourceRowDom.classList.add('pgn-rowdrag-source');

    // Ghost preview: a floating clone of the row (wrapped in a table so <tr>
    // renders). Follows the pointer via fixed positioning.
    if (sourceRowDom) {
      const ghost = document.createElement('table');
      ghost.className = 'pgn-rowdrag-ghost';
      const tbody = document.createElement('tbody');
      tbody.appendChild(sourceRowDom.cloneNode(true));
      ghost.appendChild(tbody);
      ghost.style.width = `${sourceRowDom.getBoundingClientRect().width}px`;
      document.body.appendChild(ghost);
      this.ghost = ghost;
    }

    // All of these funnel into the single idempotent endDrag(), so the drag is
    // ALWAYS torn down — normal drop, pointer released off-window
    // (pointercancel), Escape, or editor unmount (destroy → endDrag).
    document.addEventListener('pointermove', this.onDocMove);
    document.addEventListener('pointerup', this.onDocUp);
    document.addEventListener('pointercancel', this.onDocCancel);
    document.addEventListener('keydown', this.onKeyDown, true);
    this.handleDragMove(e);
  }

  /** Compute the target gap from pointer Y against row midpoints (clamped past pinned header rows). */
  private computeGap(clientY: number): number {
    const drag = this.drag!;
    const table = this.view.state.doc.nodeAt(drag.tablePos);
    if (!table) return -1;
    const rows = rowPositions(table, drag.tablePos);
    let gap = rows.length; // default: after last row
    // Read LIVE geometry every move — so a pagination recompute (or any reflow)
    // that shifts rows mid-drag can't desync the target from what's on screen.
    for (const rp of rows) {
      const rd = this.rowDom(rp.from);
      if (!rd) continue;
      const r = rd.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        gap = rp.index;
        break;
      }
    }
    // Header rows are pinned: nothing may land above them.
    return Math.max(gap, drag.headerRows);
  }

  private handleDragMove(e: PointerEvent) {
    if (!this.drag) return;
    if (this.ghost) {
      this.ghost.style.top = `${e.clientY + 12}px`;
      this.ghost.style.left = `${e.clientX + 12}px`;
    }
    this.targetGap = this.computeGap(e.clientY);
    this.positionIndicator(this.drag.tablePos);
    this.updateAutoscroll(e.clientY);
  }

  private positionIndicator(tablePos: number) {
    if (this.targetGap < 0) return;
    const table = this.view.state.doc.nodeAt(tablePos);
    const tableDom = this.view.nodeDOM(tablePos) as HTMLElement | null;
    if (!table || !tableDom) return;
    const rows = rowPositions(table, tablePos);
    const tableRect = this.toContent(tableDom.getBoundingClientRect());

    let y: number;
    if (this.targetGap >= rows.length) {
      const lastDom = this.rowDom(rows[rows.length - 1]!.from);
      y = lastDom ? this.toContent(lastDom.getBoundingClientRect()).bottom : tableRect.bottom;
    } else {
      const rd = this.rowDom(rows[this.targetGap]!.from);
      y = rd ? this.toContent(rd.getBoundingClientRect()).top : tableRect.top;
    }
    this.indicator.style.display = 'block';
    this.indicator.style.top = `${y}px`;
    this.indicator.style.left = `${tableRect.left}px`;
    this.indicator.style.width = `${tableRect.width}px`;
  }

  /* ------------------------- autoscroll ------------------------- */
  private updateAutoscroll(clientY: number) {
    const s = this.scroller;
    if (!s) return;
    const r = s.getBoundingClientRect();
    if (clientY < r.top + AUTOSCROLL_EDGE) this.autoscrollDir = -1;
    else if (clientY > r.bottom - AUTOSCROLL_EDGE) this.autoscrollDir = 1;
    else this.autoscrollDir = 0;

    if (this.autoscrollDir !== 0 && !this.raf) {
      const tick = () => {
        if (!this.drag || this.autoscrollDir === 0) {
          this.raf = 0;
          return;
        }
        s.scrollTop += this.autoscrollDir * AUTOSCROLL_STEP;
        this.positionIndicator(this.drag.tablePos);
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  /**
   * The SINGLE end-of-drag path. Idempotent (no-op if not dragging), so drop /
   * pointercancel / Escape / editor-unmount all funnel through here and the
   * transient chrome is ALWAYS torn down — never stranded by an interrupted
   * drag. `commit` decides whether to actually reorder (false = clean abort).
   *
   * Note: we deliberately never touched editor.editable or the shared
   * selection, so even a stranded drag could not have gated the toolbar — this
   * guarantees the leak can't happen at all.
   */
  private endDrag(commit: boolean) {
    const drag = this.drag;
    if (!drag) return; // already ended — idempotent
    this.drag = null; // clear first so re-entrant events short-circuit

    document.removeEventListener('pointermove', this.onDocMove);
    document.removeEventListener('pointerup', this.onDocUp);
    document.removeEventListener('pointercancel', this.onDocCancel);
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.autoscrollDir = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;

    if (commit && this.targetGap >= 0) {
      // Recompute positions from the CURRENT doc at drop time (never cached).
      const state = this.view.state;
      const table = state.doc.nodeAt(drag.tablePos);
      if (table && table.type.spec.tableRole === 'table') {
        const beforeCount = table.childCount;
        const tr = buildReorder(state, drag.tablePos, table, drag.sourceIndex, this.targetGap);
        // Enforcement point 2 (safety net): only gate a REAL move (`tr` is null
        // for a no-op, which must never error). Re-read live via TableMap and
        // abort — never dispatch — if the source row straddles a vertical merge
        // OR the drop boundary would split one. Same error, no doc mutation.
        if (tr && (!isRowMovable(table, drag.sourceIndex) || !isGapClean(table, this.targetGap))) {
          showRowMoveError();
        } else if (tr) {
          this.view.dispatch(tr);
          // Runtime guard for the #1 failure mode: the reorder must MOVE, not
          // duplicate — so the row count is invariant across the dispatch.
          const afterCount = findNearestTable(this.view, drag.tablePos)?.childCount ?? -1;
          if (afterCount !== beforeCount) {
            console.error(
              `[tableRowReorder] row count changed ${beforeCount} → ${afterCount} — possible duplication bug`,
            );
          }
        }
      }
    }

    // Cleanup transient view state (runs on every outcome).
    drag.sourceRowDom?.classList.remove('pgn-rowdrag-source');
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
    sourceIndex: number,
    movable: boolean,
    handle: HTMLElement,
  ) {
    if (this.drag) return; // pointer drag owns the interaction
    const isEnter = e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';

    if (!this.kbd) {
      if (isEnter) {
        e.preventDefault();
        if (!movable) return void showRowMoveError();
        this.kbd = { tablePos, sourceIndex, handle };
        this.targetGap = sourceIndex;
        handle.classList.add('is-dragging');
        this.positionIndicator(tablePos);
      }
      return;
    }
    // Picked up — move / drop / cancel.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const table = this.view.state.doc.nodeAt(this.kbd.tablePos);
      if (!table) return;
      const header = headerRowCount(table);
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      this.targetGap = Math.max(header, Math.min(table.childCount, this.targetGap + delta));
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
      if (!isRowMovable(table, kbd.sourceIndex) || !isGapClean(table, this.targetGap)) {
        showRowMoveError();
      } else {
        const tr = buildReorder(state, kbd.tablePos, table, kbd.sourceIndex, this.targetGap);
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

  /* --------------------- plugin-view lifecycle --------------------- */
  update() {
    // Reposition handles after any doc/geometry change (e.g. pagination
    // recompute shifts rows) while they are shown and we're not mid-drag.
    if (!this.drag && !this.kbd && this.shownTablePos != null) {
      const pos = this.shownTablePos;
      const node = this.view.state.doc.nodeAt(pos);
      if (node && node.type.spec.tableRole === 'table') this.showHandles(pos);
      else this.hideHandles();
    }
  }

  destroy() {
    // Abort any in-progress drag through the single cleanup path (removes doc
    // listeners, body class, ghost, raf) — covers unmount mid-drag.
    this.endDrag(false);
    this.kbd = null;
    dismissTableMoveError();
    const host = this.scroller ?? this.view.dom;
    host.removeEventListener('mousemove', this.onScrollerMove);
    host.removeEventListener('mouseleave', this.onScrollerLeave);
    document.body.classList.remove('pgn-row-dragging');
    this.layer.remove();
  }
}

/** Re-find the table at/near a position after a dispatch (position may shift). */
function findNearestTable(view: EditorView, approxPos: number) {
  const node = view.state.doc.nodeAt(approxPos);
  if (node && node.type.spec.tableRole === 'table') return node;
  let found: import('@tiptap/pm/model').Node | null = null;
  view.state.doc.descendants((n) => {
    if (!found && n.type.spec.tableRole === 'table') found = n;
    return !found;
  });
  return found;
}

export const tableRowReorderKey = new PluginKey('tableRowReorder');

export const TableRowReorder = Extension.create({
  name: 'tableRowReorder',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableRowReorderKey,
        view: (editorView) => new RowReorderView(editorView),
      }),
    ];
  },
});
