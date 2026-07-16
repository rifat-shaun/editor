import { useEffect, useState } from 'react';
import { useEditorState } from '../editor/context';
import { Icon } from './icons';

export function OutlinePanel() {
  const { editor, outline, ai, outlineOpen, toggleOutline } = useEditorState();
  const [activePos, setActivePos] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from } = editor.state.selection;
      let current: number | null = null;
      for (const item of outline) {
        if (item.pos <= from) current = item.pos;
        else break;
      }
      setActivePos(current);
    };
    editor.on('selectionUpdate', update);
    update();
    return () => {
      editor.off('selectionUpdate', update);
    };
  }, [editor, outline]);

  const goTo = (pos: number) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    const coords = editor.view.coordsAtPos(pos + 1);
    const scroller = editor.view.dom.closest('[data-docs-scroll]') as HTMLElement | null;
    if (scroller) {
      const top = coords.top - scroller.getBoundingClientRect().top + scroller.scrollTop - 100;
      scroller.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const pending = ai.counts.pending;

  if (!outlineOpen) return null;

  return (
    <>
      {/* Scrim: on narrow screens the panel overlays the page. */}
      <div
        onClick={toggleOutline}
        className="print-hide absolute inset-0 z-20 bg-black/20 lg:hidden"
        aria-hidden="true"
      />
      <aside className="print-hide absolute inset-y-0 left-0 z-30 flex w-56 shrink-0 flex-col border-r border-border bg-panel shadow-xl lg:relative lg:z-auto lg:shadow-none">
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">
            Outline
          </span>
          <button
            type="button"
            onClick={toggleOutline}
            title="Hide outline"
            aria-label="Hide outline"
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-[#e9edee] hover:text-ui"
          >
            <Icon.chevronLeft size={15} />
          </button>
        </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2 docs-scroll" aria-label="Document outline">
        {outline.length === 0 && (
          <p className="px-2 py-1 text-[11.5px] text-muted">No headings yet</p>
        )}
        {outline.map((item) => {
          const isSub = item.level >= 3;
          const active = item.pos === activePos;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(item.pos)}
              aria-current={active ? 'true' : undefined}
              style={{ paddingLeft: isSub ? 20 : 8 }}
              className={[
                'block w-full truncate rounded-md py-1.5 pr-2 text-left transition-colors',
                isSub ? 'text-[11.5px] text-[#7a848d]' : 'text-[12px] text-ui',
                active ? '!text-primary font-semibold bg-primary-soft' : 'hover:bg-[#e9edee]',
              ].join(' ')}
            >
              {item.text}
            </button>
          );
        })}
      </nav>
      {pending > 0 && (
        <button
          type="button"
          onClick={() => ai.focusNext()}
          className="flex items-center gap-1.5 border-t border-border px-3 py-2.5 text-[11.5px] font-semibold text-primary hover:bg-[#e9edee]"
        >
          <Icon.sparkle size={13} />
          {pending} AI edit{pending === 1 ? '' : 's'} pending
        </button>
      )}
      </aside>
    </>
  );
}
