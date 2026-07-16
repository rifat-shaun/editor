import type { SVGProps } from 'react';

/**
 * Six-dot "drag indicator" icons. One coordinate source feeds BOTH the React
 * components (for any React consumer) and the raw SVG strings the table
 * row/column drag plugins inject into their plain-DOM handles — so the on-screen
 * grip is pixel-identical everywhere.
 *
 *  - Vertical   → 2 columns × 3 rows (row handles).
 *  - Horizontal → 3 columns × 2 rows (column handles).
 */
const VERTICAL: ReadonlyArray<readonly [number, number]> = [
  [6, 4],
  [10, 4],
  [6, 8],
  [10, 8],
  [6, 12],
  [10, 12],
];
const HORIZONTAL: ReadonlyArray<readonly [number, number]> = [
  [4, 6],
  [8, 6],
  [12, 6],
  [4, 10],
  [8, 10],
  [12, 10],
];

function toSvgString(dots: ReadonlyArray<readonly [number, number]>): string {
  const circles = dots.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="1.3"/>`).join('');
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}

/** Raw markup for the plain-DOM plugin handles (single source of truth). */
export const DRAG_DOTS_VERTICAL_SVG = toSvgString(VERTICAL);
export const DRAG_DOTS_HORIZONTAL_SVG = toSvgString(HORIZONTAL);

export function DragDotsVertical(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      {VERTICAL.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={1.3} />
      ))}
    </svg>
  );
}

export function DragDotsHorizontal(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      {HORIZONTAL.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={1.3} />
      ))}
    </svg>
  );
}
