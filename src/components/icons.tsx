/* eslint-disable react-refresh/only-export-components */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  appGrid: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  star: (p: P) => (
    <Svg {...p}>
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3z" />
    </Svg>
  ),
  move: (p: P) => (
    <Svg {...p}>
      <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </Svg>
  ),
  comment: (p: P) => (
    <Svg {...p}>
      <path d="M4 5h16v11H8l-4 4V5z" />
    </Svg>
  ),
  chevronDown: (p: P) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  sparkle: (p: P) => (
    <Svg {...p}>
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z" />
      <path d="M18 15l.7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15z" />
    </Svg>
  ),
  undo: (p: P) => (
    <Svg {...p}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </Svg>
  ),
  redo: (p: P) => (
    <Svg {...p}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10h1" />
    </Svg>
  ),
  print: (p: P) => (
    <Svg {...p}>
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M8 15h8v6H8z" />
    </Svg>
  ),
  spellcheck: (p: P) => (
    <Svg {...p}>
      <path d="M4 16l4-10 4 10" />
      <path d="M5.5 12.5h5" />
      <path d="M14 14l2.5 2.5L21 11" />
    </Svg>
  ),
  bold: (p: P) => (
    <Svg {...p}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </Svg>
  ),
  italic: (p: P) => (
    <Svg {...p}>
      <path d="M10 5h8M6 19h8M14 5l-4 14" />
    </Svg>
  ),
  underline: (p: P) => (
    <Svg {...p}>
      <path d="M7 4v7a5 5 0 0 0 10 0V4" />
      <path d="M5 21h14" />
    </Svg>
  ),
  strike: (p: P) => (
    <Svg {...p}>
      <path d="M5 12h14" />
      <path d="M8 7a4 3 0 0 1 8 0M8 16a4 3 0 0 0 8 0" />
    </Svg>
  ),
  textColor: (p: P) => (
    <Svg {...p}>
      <path d="M7 16L11 6l4 10" />
      <path d="M8.5 12.5h5" />
      <path d="M5 20h14" strokeWidth={3} />
    </Svg>
  ),
  alignLeft: (p: P) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h10M4 18h14" />
    </Svg>
  ),
  alignCenter: (p: P) => (
    <Svg {...p}>
      <path d="M4 6h16M7 12h10M5 18h14" />
    </Svg>
  ),
  alignRight: (p: P) => (
    <Svg {...p}>
      <path d="M4 6h16M10 12h10M6 18h14" />
    </Svg>
  ),
  alignJustify: (p: P) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  ),
  lineHeight: (p: P) => (
    <Svg {...p}>
      <path d="M10 6h11M10 12h11M10 18h11M4 4v16M4 4l-2 2.5M4 4l2 2.5M4 20l-2-2.5M4 20l2-2.5" />
    </Svg>
  ),
  bulletList: (p: P) => (
    <Svg {...p}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </Svg>
  ),
  orderedList: (p: P) => (
    <Svg {...p}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 5v3M3.5 5.2L4 5M3.5 12h1.2L3.5 14h1.4M3.5 16.5h1.3v3.5H3.6" strokeWidth={1.3} />
    </Svg>
  ),
  checklist: (p: P) => (
    <Svg {...p}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M3 6l1.4 1.4L7 4.8M3 16.5l1.4 1.4L7 15.3" strokeWidth={1.5} />
    </Svg>
  ),
  link: (p: P) => (
    <Svg {...p}>
      <path d="M10 13a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 11a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </Svg>
  ),
  quote: (p: P) => (
    <Svg {...p}>
      <path d="M7 7H4v6h5V7l-2 4M17 7h-3v6h5V7l-2 4" />
    </Svg>
  ),
  table: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
    </Svg>
  ),
  image: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </Svg>
  ),
  find: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </Svg>
  ),
  history: (p: P) => (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4l3 2" />
    </Svg>
  ),
  exportIcon: (p: P) => (
    <Svg {...p}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
    </Svg>
  ),
  share: (p: P) => (
    <Svg {...p}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
    </Svg>
  ),
  present: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M8 20h8" />
    </Svg>
  ),
  plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  minus: (p: P) => (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  ),
  check: (p: P) => (
    <Svg {...p}>
      <path d="M5 12l5 5L20 6" />
    </Svg>
  ),
  x: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  chevronRight: (p: P) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  chevronLeft: (p: P) => (
    <Svg {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  ),
  panelLeft: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Svg>
  ),
  pageSetup: (p: P) => (
    <Svg {...p}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <rect x="8" y="6" width="8" height="12" rx="0.5" strokeDasharray="2 2" />
    </Svg>
  ),
  more: (p: P) => (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  stop: (p: P) => (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </Svg>
  ),
  spinner: (p: P) => (
    <Svg {...p} className={`docs-spin ${p.className ?? ''}`}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
