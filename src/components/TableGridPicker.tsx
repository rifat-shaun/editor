import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Menu } from './primitives';
import { Icon } from './icons';

const MAX = 10;
const CELL = 16; // px per grid square

/**
 * Table insert control: hover a 10×10 grid to choose dimensions, click to
 * insert. Always inserts a header row (toggle it off afterwards via the table
 * menu). Rendered inside the portaled `Menu` so it escapes the toolbar's
 * overflow clipping.
 */
export function TableGridPicker({ editor }: { editor: Editor }) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 });

  return (
    <Menu
      align="left"
      panelClassName="p-2"
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          title="Insert table"
          aria-label="Insert table"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-[5px] px-1.5 text-[12px] text-ui hover:bg-[var(--ui-hover)]"
        >
          <Icon.table size={16} />
        </button>
      )}
    >
      {(close) => (
        <div onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
          <div
            role="grid"
            aria-label="Table size"
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${MAX}, ${CELL}px)` }}
          >
            {Array.from({ length: MAX * MAX }).map((_, i) => {
              const r = Math.floor(i / MAX) + 1;
              const c = (i % MAX) + 1;
              const active = r <= hover.rows && c <= hover.cols;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${r} by ${c}`}
                  onMouseEnter={() => setHover({ rows: r, cols: c })}
                  onFocus={() => setHover({ rows: r, cols: c })}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: r, cols: c, withHeaderRow: true })
                      .run();
                    setHover({ rows: 0, cols: 0 });
                    close();
                  }}
                  style={{ width: CELL, height: CELL }}
                  className={[
                    'rounded-[2px] border',
                    active ? 'border-primary bg-primary-soft' : 'border-border bg-[var(--ui-surface)] hover:border-[var(--ui-border-strong)]',
                  ].join(' ')}
                />
              );
            })}
          </div>
          <div className="mt-1.5 text-center text-[11px] text-muted">
            {hover.rows > 0 ? `${hover.rows} × ${hover.cols}` : 'Insert table'}
          </div>
        </div>
      )}
    </Menu>
  );
}
