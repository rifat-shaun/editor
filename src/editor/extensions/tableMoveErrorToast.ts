/**
 * Shared "can't move that" error toast for table row/column reordering.
 *
 * Purely local DOM view state — it never touches the document, so the editor
 * stays editable, the toolbar stays enabled, and undo history is untouched. A
 * single deduped, dismissible toast: repeated attempts reset the timer on the
 * SAME element instead of stacking. Used by both the row- and column-reorder
 * plugins (they can't drag simultaneously, so one singleton is enough).
 */
const TITLE = 'There was a problem';
const DISMISS_MS = 6000;

export const ROW_MOVE_MESSAGE =
  'Sorry, it is not possible to move a row that contains only part of a merged cell. Please unmerge and try again.';
export const COLUMN_MOVE_MESSAGE =
  'Sorry, it is not possible to move a column that contains only part of a merged cell. Please unmerge and try again.';

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function dismissTableMoveError() {
  clearTimeout(toastTimer);
  toastEl?.remove();
  toastEl = null;
}

export function showTableMoveError(message: string) {
  if (typeof document === 'undefined') return;
  if (!toastEl) {
    const el = document.createElement('div');
    el.className = 'pgn-move-error-toast';
    el.setAttribute('role', 'alert');
    const body = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'pgn-move-error-title';
    title.textContent = TITLE;
    const msg = document.createElement('div');
    msg.className = 'pgn-move-error-msg';
    body.append(title, msg);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pgn-move-error-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', dismissTableMoveError);
    el.append(body, close);
    document.body.appendChild(el);
    toastEl = el;
  }
  // Update the message (row vs column) and dedupe by resetting the timer.
  const msgEl = toastEl.querySelector('.pgn-move-error-msg');
  if (msgEl) msgEl.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissTableMoveError, DISMISS_MS);
}
