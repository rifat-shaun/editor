import { useEditorState } from '../editor/context';
import { Icon } from './icons';

export function StatusBar() {
  const { wordCount, pageCount, zoom, setZoom } = useEditorState();

  return (
    <footer className="print-hide flex h-8 shrink-0 items-center justify-between border-t border-border bg-chrome px-3 text-[11px] text-[#7a848d]">
      <span>
        {pageCount.toLocaleString()} {pageCount === 1 ? 'page' : 'pages'} · {wordCount.toLocaleString()} words · English (US)
      </span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 w-28 cursor-pointer accent-[#0e7490]"
          />
          <span className="w-9 tabular-nums">{zoom}%</span>
        </div>
        <span className="h-4 w-px bg-border" />
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-ui hover:bg-[#eef1f3]"
        >
          <Icon.present size={13} />
          Present
        </button>
      </div>
    </footer>
  );
}
