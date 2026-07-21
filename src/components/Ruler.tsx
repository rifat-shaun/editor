/**
 * Word-style ruler. A custom UI layer (not a PM node) above the page, pixel-
 * aligned to the page content area. Reads page width + margins from the
 * pagination engine's live CSS vars on `.docs-page-content` (so Letter↔A4,
 * margin, and zoom changes reflect automatically — the measured page width vs.
 * the unzoomed `--pgn-page-width` gives the zoom scale). Reads the caret
 * paragraph's indents reactively and writes them back on drag via the same
 * commands the Align & indent menu uses.
 *
 * Visibility is bound to View → Show ruler (context `showRuler`). Margins are
 * shown as non-interactive shading (dragging them is deferred — use Page Setup).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useEditorState } from '../editor/context';
import { indentAtSelection } from './indentSelection';
import { formatMeasure, tickSpec, type RulerUnit } from './rulerUnits';

const H = 22; // ruler height

interface Geom {
  pageW: number; // unzoomed page width (px)
  ml: number; // unzoomed left margin
  mr: number; // unzoomed right margin
  scale: number; // measured / unzoomed  (== zoom)
  offset: number; // page left edge, relative to the ruler container
  ready: boolean;
}

function readGeom(container: HTMLElement | null, scroller: HTMLElement | null): Geom {
  const page = scroller?.querySelector('.docs-page-content') as HTMLElement | null;
  if (!container || !page) return { pageW: 816, ml: 96, mr: 96, scale: 1, offset: 0, ready: false };
  const cs = getComputedStyle(page);
  const pageW = parseFloat(cs.getPropertyValue('--pgn-page-width')) || 816;
  const ml = parseFloat(cs.getPropertyValue('--pgn-ml')) || 0;
  const mr = parseFloat(cs.getPropertyValue('--pgn-mr')) || 0;
  const pr = page.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  const scale = pr.width / pageW || 1;
  return { pageW, ml, mr, scale, offset: pr.left - cr.left, ready: true };
}

export function Ruler({ scrollerRef }: { scrollerRef: RefObject<HTMLDivElement | null> }) {
  const { editor, showRuler, rulerUnit, setRulerUnit } = useEditorState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom>({ pageW: 816, ml: 96, mr: 96, scale: 1, offset: 0, ready: false });
  const [, bump] = useState(0);

  // Re-measure on scroll / resize / format / zoom.
  useLayoutEffect(() => {
    if (!showRuler) return;
    const measure = () => setGeom(readGeom(containerRef.current, scrollerRef.current));
    measure();
    const scroller = scrollerRef.current;
    const page = scroller?.querySelector('.docs-page-content') as HTMLElement | null;
    const ro = new ResizeObserver(measure);
    if (page) ro.observe(page);
    if (containerRef.current) ro.observe(containerRef.current);
    scroller?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      scroller?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [showRuler, scrollerRef]);

  // Re-read indents + re-measure (zoom transform) on selection/doc changes.
  useEffect(() => {
    if (!editor || !showRuler) return;
    const onChange = () => {
      bump((n) => n + 1);
      setGeom(readGeom(containerRef.current, scrollerRef.current));
    };
    editor.on('selectionUpdate', onChange);
    editor.on('transaction', onChange);
    return () => {
      editor.off('selectionUpdate', onChange);
      editor.off('transaction', onChange);
    };
  }, [editor, showRuler, scrollerRef]);

  if (!showRuler || !editor) return null;

  const { pageW, ml, mr, scale, offset } = geom;
  const sx = (unzoomedPx: number) => unzoomedPx * scale; // unzoomed px → screen px
  const indent = indentAtSelection(editor);

  const contentStart = ml; // ruler 0 == left margin
  const contentEnd = pageW - mr;

  // Marker positions (unzoomed px from page left edge).
  const xLeft = ml + indent.left; // left rectangle + hanging triangle
  const xFirst = ml + indent.left + indent.firstLine; // first-line triangle
  const xRight = pageW - mr - indent.right; // right triangle

  const setIndent = (patch: { left?: number; right?: number; firstLine?: number }) =>
    editor.chain().focus().setParagraphIndent(patch).run();

  return (
    <div
      ref={containerRef}
      className="print-hide relative shrink-0 border-b border-border bg-[var(--ui-surface-2)]"
      style={{ height: H }}
      role="group"
      aria-label="Ruler"
    >
      {/* Unit toggle (far left). */}
      <button
        type="button"
        onClick={() => setRulerUnit(rulerUnit === 'in' ? 'cm' : 'in')}
        title="Toggle ruler units"
        aria-label={`Ruler units: ${rulerUnit === 'in' ? 'inches' : 'centimeters'}`}
        style={{ position: 'absolute', left: 4, top: 2, height: H - 5, padding: '0 6px', fontSize: 10, fontWeight: 600, color: 'var(--ui-text-soft)', border: '1px solid var(--ui-border-strong)', borderRadius: 4, background: 'var(--ui-surface)', cursor: 'pointer', zIndex: 2 }}
      >
        {rulerUnit === 'in' ? 'in' : 'cm'}
      </button>

      {/* Page-aligned layer. */}
      <div style={{ position: 'absolute', top: 0, left: offset, width: sx(pageW), height: H, overflow: 'hidden' }}>
        {/* Margin shading + text column. */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: sx(contentStart), height: H, background: 'var(--ui-shade)' }} />
        <div style={{ position: 'absolute', top: 0, left: sx(contentEnd), width: sx(mr), height: H, background: 'var(--ui-shade)' }} />
        <div style={{ position: 'absolute', top: 0, left: sx(contentStart), width: sx(contentEnd - contentStart), height: H, background: 'var(--ui-surface)', borderLeft: '1px solid var(--ui-border-strong)', borderRight: '1px solid var(--ui-border-strong)' }} />

        <Ticks pageW={pageW} ml={ml} sx={sx} unit={rulerUnit} />

        {/* Indent markers. */}
        <Marker
          kind="first"
          x={sx(xFirst)}
          scale={scale}
          label={formatMeasure(indent.firstLine, rulerUnit)}
          onDelta={(du) => setIndent({ firstLine: indent.firstLine + du })}
        />
        <Marker
          kind="hanging"
          x={sx(xLeft)}
          scale={scale}
          label={formatMeasure(indent.left, rulerUnit)}
          // Hanging: move body-line indent, keep the first line fixed.
          onDelta={(du) => setIndent({ left: indent.left + du, firstLine: indent.firstLine - du })}
        />
        <Marker
          kind="left"
          x={sx(xLeft)}
          scale={scale}
          label={formatMeasure(indent.left, rulerUnit)}
          onDelta={(du) => setIndent({ left: indent.left + du })}
        />
        <Marker
          kind="right"
          x={sx(xRight)}
          scale={scale}
          label={formatMeasure(indent.right, rulerUnit)}
          onDelta={(du) => setIndent({ right: indent.right - du })}
        />
      </div>
    </div>
  );
}

function Ticks({ pageW, ml, sx, unit }: { pageW: number; ml: number; sx: (n: number) => number; unit: RulerUnit }) {
  const { minorPx, perMajor, label } = tickSpec(unit);
  const els: React.ReactNode[] = [];
  // i indexes minor ticks from the left margin (0); go both directions to fill.
  const iMin = Math.ceil((0 - ml) / minorPx);
  const iMax = Math.floor((pageW - ml) / minorPx);
  for (let i = iMin; i <= iMax; i++) {
    const xu = ml + i * minorPx;
    const x = sx(xu);
    const major = i % perMajor === 0;
    const h = major ? 6 : 3;
    els.push(<div key={`t${i}`} style={{ position: 'absolute', left: x, bottom: 0, width: 1, height: h, background: 'var(--ui-faint)' }} />);
    if (major && i >= 0) {
      const n = i / perMajor;
      if (n > 0) els.push(<div key={`l${i}`} style={{ position: 'absolute', left: x, top: 2, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--color-muted)', lineHeight: 1 }}>{label(n)}</div>);
    }
  }
  return <>{els}</>;
}

type MarkerKind = 'first' | 'hanging' | 'left' | 'right';

function Marker({
  kind,
  x,
  scale,
  label,
  onDelta,
}: {
  kind: MarkerKind;
  x: number;
  scale: number;
  label: string;
  onDelta: (deltaUnzoomedPx: number) => void;
}) {
  const [drag, setDrag] = useState<{ startX: number } | null>(null);
  const lastApplied = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lastApplied.current = 0;
    setDrag({ startX: e.clientX });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const du = Math.round((e.clientX - drag.startX) / scale);
    const step = du - lastApplied.current;
    if (step !== 0) {
      lastApplied.current = du;
      onDelta(step);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDrag(null);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const NUDGE = 6; // 1/16 in
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onDelta(kind === 'right' ? NUDGE : -NUDGE);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onDelta(kind === 'right' ? -NUDGE : NUDGE);
    }
  };

  const triangle = (dir: 'up' | 'down'): CSSProperties =>
    dir === 'down'
      ? { borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid var(--ui-text-soft)' }
      : { borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '6px solid var(--ui-text-soft)' };

  const common: CSSProperties = {
    position: 'absolute',
    left: x,
    transform: 'translateX(-50%)',
    width: 10,
    height: 10,
    cursor: 'ew-resize',
    zIndex: 3,
    touchAction: 'none',
  };
  const shape: CSSProperties =
    kind === 'first'
      ? { ...common, top: 1, ...triangle('down') }
      : kind === 'left'
        ? { ...common, top: 15, width: 10, height: 6, background: 'var(--ui-text-soft)', borderRadius: 1 }
        : { ...common, top: 9, ...triangle('up') }; // hanging + right both bottom triangles

  const labels: Record<MarkerKind, string> = {
    first: 'First-line indent',
    hanging: 'Hanging indent',
    left: 'Left indent',
    right: 'Right indent',
  };

  return (
    <>
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels[kind]}
        aria-valuetext={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        style={shape}
      />
      {drag && (
        <div style={{ position: 'absolute', left: x, top: H + 2, transform: 'translateX(-50%)', fontSize: 10, background: 'var(--color-ink)', color: '#fff', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', zIndex: 5 }}>
          {label}
        </div>
      )}
    </>
  );
}
