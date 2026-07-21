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

/** 16-grid wrapper for the unified toolbar icon set (design 24a). Base stroke
 *  1.3; fill-only shapes set stroke="none", stroked details override strokeWidth. */
function Svg16({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
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
    <Svg16 {...p}>
      <path d="M5 3h3.6a2.35 2.35 0 010 4.7H5V3zM5 7.7h4.3a2.65 2.65 0 010 5.3H5V7.7z" strokeWidth={1.4} />
    </Svg16>
  ),
  italic: (p: P) => (
    <Svg16 {...p}>
      <path d="M6.8 3h5M4.2 13h5M9.7 3l-3.4 10" />
    </Svg16>
  ),
  underline: (p: P) => (
    <Svg16 {...p}>
      <path d="M4.5 3v4.3a3.5 3.5 0 007 0V3M3.5 13h9" />
    </Svg16>
  ),
  strike: (p: P) => (
    <Svg16 {...p}>
      <path d="M11.5 4.5c-.5-1-1.8-1.5-3.5-1.5-2.1 0-3.3.9-3.3 2.2 0 1 .7 1.6 2.1 2M4.5 11.5c.5 1 1.8 1.5 3.5 1.5 2.1 0 3.3-.9 3.3-2.2 0-.45-.1-.8-.35-1.1M3 8h10" />
    </Svg16>
  ),
  textColor: (p: P) => (
    <Svg16 {...p}>
      <path d="M4 10.8L8 2.5l4 8.3M5.3 8.3h5.4" />
      <path d="M3.5 13.5h9" strokeWidth={1.8} />
    </Svg16>
  ),
  alignLeft: (p: P) => (
    <Svg16 {...p}>
      <path d="M2 3h12M2 6.3h8M2 9.7h12M2 13h8" strokeWidth={1.4} />
    </Svg16>
  ),
  alignCenter: (p: P) => (
    <Svg16 {...p}>
      <path d="M2 3h12M4 6.3h8M2 9.7h12M4 13h8" strokeWidth={1.4} />
    </Svg16>
  ),
  alignRight: (p: P) => (
    <Svg16 {...p}>
      <path d="M2 3h12M6 6.3h8M2 9.7h12M6 13h8" strokeWidth={1.4} />
    </Svg16>
  ),
  alignJustify: (p: P) => (
    <Svg16 {...p}>
      <path d="M2 3h12M2 6.3h12M2 9.7h12M2 13h12" strokeWidth={1.4} />
    </Svg16>
  ),
  indentDecrease: (p: P) => (
    <Svg16 {...p}>
      <path d="M2 2.5h12M2 13.5h12M8.5 6.2h5.5M8.5 9.8h5.5" />
      <path d="M5.5 5.5L3 8l2.5 2.5" />
    </Svg16>
  ),
  indentIncrease: (p: P) => (
    <Svg16 {...p}>
      <path d="M2 2.5h12M2 13.5h12M8.5 6.2h5.5M8.5 9.8h5.5" />
      <path d="M3 5.5L5.5 8 3 10.5" />
    </Svg16>
  ),
  lineHeight: (p: P) => (
    <Svg16 {...p}>
      <path d="M3.5 2.5v11M3.5 2.5L1.8 4.2M3.5 2.5l1.7 1.7M3.5 13.5l-1.7-1.7M3.5 13.5l1.7-1.7" />
      <path d="M7.5 3.5h7M7.5 6.8h7M7.5 10.1h7M7.5 13.4h7" />
    </Svg16>
  ),
  bulletList: (p: P) => (
    <Svg16 {...p}>
      <circle cx="3" cy="3.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M6.5 3.5h7.5M6.5 8h7.5M6.5 12.5h7.5" />
    </Svg16>
  ),
  orderedList: (p: P) => (
    <Svg16 {...p}>
      <path d="M2.2 2.6l1.2-.8v3.4M2 9.2c0-.8.6-1.3 1.3-1.3.7 0 1.2.5 1.2 1.1 0 .5-.3.9-.8 1.3l-1.7 1.4h2.7" strokeWidth={1.1} />
      <path d="M6.5 3.5h7.5M6.5 8h7.5M6.5 12.5h7.5" />
    </Svg16>
  ),
  checklist: (p: P) => (
    <Svg16 {...p}>
      <rect x="1.5" y="1.8" width="4.4" height="4.4" rx="1" strokeWidth={1.2} />
      <path d="M2.8 3.9l.9.9 1.5-1.7" strokeWidth={1.1} />
      <rect x="1.5" y="9.4" width="4.4" height="4.4" rx="1" strokeWidth={1.2} />
      <path d="M8.5 4h5.5M8.5 11.6h5.5" />
    </Svg16>
  ),
  link: (p: P) => (
    <Svg16 {...p}>
      <path d="M6.8 9.2a3 3 0 004.3.2l1.8-1.8a3 3 0 10-4.3-4.3l-1 1" />
      <path d="M9.2 6.8a3 3 0 00-4.3-.2L3.1 8.4a3 3 0 104.3 4.3l1-1" />
    </Svg16>
  ),
  pencil: (p: P) => (
    <Svg16 {...p}>
      <path d="M11.2 2.8l2 2L6 12l-2.6.6L4 10l7.2-7.2z" />
      <path d="M10.2 3.8l2 2" />
    </Svg16>
  ),
  copy: (p: P) => (
    <Svg16 {...p}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
      <path d="M10.5 5.5V3.9A1.4 1.4 0 009.1 2.5H3.9A1.4 1.4 0 002.5 3.9v5.2A1.4 1.4 0 003.9 10.5h1.6" />
    </Svg16>
  ),
  trash: (p: P) => (
    <Svg16 {...p}>
      <path d="M3 4.5h10M6.2 4.5V3.2A1 1 0 017.2 2.2h1.6a1 1 0 011 1v1.3" />
      <path d="M4.2 4.5l.6 8a1 1 0 001 .9h4.4a1 1 0 001-.9l.6-8" />
    </Svg16>
  ),
  quote: (p: P) => (
    <Svg16 {...p}>
      <path d="M3 9.5a4.5 4.5 0 013-4.2M3 9.5A2.2 2.2 0 105.2 11.7 2.2 2.2 0 003 9.5zM9.5 9.5a4.5 4.5 0 013-4.2M9.5 9.5a2.2 2.2 0 102.2 2.2 2.2 2.2 0 00-2.2-2.2z" strokeWidth={1.2} />
    </Svg16>
  ),
  table: (p: P) => (
    <Svg16 {...p}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M2 6h12M6.7 6v8M11.3 6v8" />
    </Svg16>
  ),
  image: (p: P) => (
    <Svg16 {...p}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <circle cx="5.6" cy="6" r="1.2" strokeWidth={1.1} />
      <path d="M2.5 12.3l3.5-3.5 2.6 2.5 2.4-2.3 2.5 2.4" />
    </Svg16>
  ),
  pageBreak: (p: P) => (
    <Svg16 {...p}>
      <path d="M3.5 5.5V3.5A1.5 1.5 0 015 2h6a1.5 1.5 0 011.5 1.5v2M12.5 10.5v2A1.5 1.5 0 0111 14H5a1.5 1.5 0 01-1.5-1.5v-2" />
      <path d="M2 8h1.8M5.4 8h1.8M8.8 8h1.8M12.2 8H14" />
    </Svg16>
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
  download: (p: P) => (
    <Svg {...p}>
      <path d="M12 4v10M8 10l4 4 4-4" />
      <path d="M5 20h14" />
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
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
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
