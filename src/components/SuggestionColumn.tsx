import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useEditorState } from '../editor/context';
import { CommentCard, SuggestionCard, type CommentCardData } from './SuggestionCard';
import { Icon } from './icons';

const GAP = 12;
const EST_HEIGHT = 150;
const OVERSCAN = 600;

// Static demo comments anchored into the document.
const COMMENTS: CommentCardData[] = [
  {
    id: 'c1',
    author: 'Dana Ruiz',
    color: '#0e7490',
    text: 'Should we specify a governing-law state here? Legal flagged this.',
    pos: 40,
  },
  {
    id: 'c2',
    author: 'Amir Shah',
    color: '#b5651d',
    text: 'Confirm the 2-year term matches the master agreement.',
    pos: 260,
  },
];

interface Positioned {
  id: string;
  kind: 'change' | 'comment';
  top: number;
}

export function SuggestionColumn({ scrollerRef }: { scrollerRef: RefObject<HTMLElement> }) {
  const { editor, ai } = useEditorState();
  const columnRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const heightsRef = useRef<Record<string, number>>({});

  const [positions, setPositions] = useState<Positioned[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [tick, setTick] = useState(0);

  const reviewing = ai.phase === 'reviewing';
  const visibleChanges = ai.changes.filter(
    (c) => c.status === 'pending' || ai.focusedChangeId === c.id,
  );

  // Recompute layout whenever the document, changes, or size changes.
  const bump = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', bump);
    window.addEventListener('resize', bump);
    const ro = new ResizeObserver(bump);
    ro.observe(editor.view.dom);
    return () => {
      editor.off('transaction', bump);
      window.removeEventListener('resize', bump);
      ro.disconnect();
    };
  }, [editor, bump]);

  // Track scroll for virtualization.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTop(scroller.scrollTop));
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    setScrollTop(scroller.scrollTop);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollerRef]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const column = columnRef.current;
    if (!editor || !scroller || !column) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const columnOffsetTop = column.offsetTop;
    const docSize = editor.state.doc.content.size;

    const anchors: { id: string; kind: 'change' | 'comment'; anchorTop: number }[] = [];

    for (const c of visibleChanges) {
      const pos = Math.min(Math.max(c.live.from, 0), docSize);
      const coords = editor.view.coordsAtPos(pos);
      const top = coords.top - scrollerRect.top + scroller.scrollTop - columnOffsetTop;
      anchors.push({ id: c.id, kind: 'change', anchorTop: top });
    }
    for (const cm of COMMENTS) {
      const pos = Math.min(Math.max(cm.pos, 0), docSize);
      const coords = editor.view.coordsAtPos(pos);
      const top = coords.top - scrollerRect.top + scroller.scrollTop - columnOffsetTop;
      anchors.push({ id: cm.id, kind: 'comment', anchorTop: top });
    }

    anchors.sort((a, b) => a.anchorTop - b.anchorTop);

    // Push apart so cards never overlap (Google-Docs-style stacking).
    let cursor = -Infinity;
    const next: Positioned[] = anchors.map((a) => {
      const top = Math.max(a.anchorTop, cursor);
      const h = heightsRef.current[a.id] ?? EST_HEIGHT;
      cursor = top + h + GAP;
      return { id: a.id, kind: a.kind, top };
    });

    setPositions((prev) => {
      if (
        prev.length === next.length &&
        prev.every((p, i) => p.id === next[i]!.id && Math.abs(p.top - next[i]!.top) < 0.5)
      ) {
        return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, tick, ai.changes, ai.focusedChangeId, scrollerRef]);

  // Measure card heights after paint; re-run stacking if they changed.
  useLayoutEffect(() => {
    let changed = false;
    for (const p of positions) {
      const el = cardRefs.current[p.id];
      if (el) {
        const h = el.offsetHeight;
        if (Math.abs((heightsRef.current[p.id] ?? -1) - h) > 1) {
          heightsRef.current[p.id] = h;
          changed = true;
        }
      }
    }
    if (changed) setTick((t) => t + 1);
  }, [positions]);

  if (!editor) return <div ref={columnRef} className="print-hide relative w-[280px] shrink-0" />;

  const scroller = scrollerRef.current;
  const viewTop = scrollTop - OVERSCAN;
  const viewBottom = scrollTop + (scroller?.clientHeight ?? 900) + OVERSCAN;
  const totalHeight =
    positions.length > 0
      ? Math.max(...positions.map((p) => p.top + (heightsRef.current[p.id] ?? EST_HEIGHT))) + 40
      : 0;

  const total = ai.counts.total;
  const resolved = ai.counts.accepted + ai.counts.rejected;

  return (
    <div ref={columnRef} className="print-hide relative w-[280px] shrink-0">
      {/* Reviewing header (sticky within the scroll viewport) */}
      {reviewing && total > 0 && (
        <div className="sticky top-0 z-20 mb-2 rounded-[10px] border border-primary-border bg-white/95 p-2.5 shadow-sm backdrop-blur">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-primary">
            <Icon.sparkle size={13} />
            Reviewing AI edits · {ai.counts.pending}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${total ? (resolved / total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1 text-[10.5px] text-muted">
            {resolved} of {total} resolved
          </div>
        </div>
      )}

      {/* Absolute card layer */}
      <div className="relative" style={{ height: totalHeight }}>
        {positions.map((p) => {
          const h = heightsRef.current[p.id] ?? EST_HEIGHT;
          if (p.top + h < viewTop || p.top > viewBottom) return null; // virtualized
          if (p.kind === 'comment') {
            const cm = COMMENTS.find((c) => c.id === p.id)!;
            return (
              <div
                key={p.id}
                ref={(el) => (cardRefs.current[p.id] = el)}
                style={{ position: 'absolute', top: p.top, left: 0, right: 0 }}
              >
                <CommentCard comment={cm} selected={false} onSelect={() => {}} />
              </div>
            );
          }
          const change = ai.changes.find((c) => c.id === p.id);
          if (!change) return null;
          return (
            <div
              key={p.id}
              ref={(el) => (cardRefs.current[p.id] = el)}
              style={{ position: 'absolute', top: p.top, left: 0, right: 0 }}
            >
              <SuggestionCard
                change={change}
                selected={ai.focusedChangeId === change.id}
                focused={ai.focusedChangeId === change.id}
                onSelect={() => ai.focusChange(change.id)}
                onAccept={() => ai.accept(change.id)}
                onReject={() => ai.reject(change.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Reviewing footer */}
      {reviewing && ai.counts.pending > 0 && (
        <div className="sticky bottom-0 z-20 mt-2 flex gap-2 rounded-[10px] border border-border bg-white/95 p-2 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={ai.acceptAllRemaining}
            className="flex-1 rounded-md bg-primary px-2 py-1.5 text-[11.5px] font-semibold text-white hover:brightness-110"
          >
            Accept all remaining
          </button>
          <button
            type="button"
            onClick={ai.rejectAll}
            className="flex-1 rounded-md border border-[#d7dde1] px-2 py-1.5 text-[11.5px] font-medium text-ui hover:bg-[#eef1f3]"
          >
            Reject all
          </button>
        </div>
      )}
    </div>
  );
}
