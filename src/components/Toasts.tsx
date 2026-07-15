import { useEditorState } from '../editor/context';
import { Icon } from './icons';

export function Toasts() {
  const { ai } = useEditorState();

  if (ai.phase === 'generating' && ai.generation) {
    const { sectionRef, count } = ai.generation;
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        <div
          role="status"
          className="docs-rise pointer-events-auto flex items-center gap-3 rounded-xl bg-[#1f2933] px-4 py-2.5 text-white shadow-2xl"
        >
          <Icon.spinner size={16} />
          <span className="text-[12.5px]">
            {sectionRef ? `Reviewing ${sectionRef} — ` : 'Drafting edits — '}
            <strong className="font-semibold">
              {count} change{count === 1 ? '' : 's'}
            </strong>{' '}
            proposed so far
          </span>
          <button
            type="button"
            onClick={ai.stop}
            className="ml-1 inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[11.5px] font-medium hover:bg-white/25"
          >
            <Icon.stop size={11} />
            Stop
          </button>
        </div>
      </div>
    );
  }

  if (ai.phase === 'resolved' && ai.summary) {
    const { accepted, rejected } = ai.summary;
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        <div
          role="status"
          className="docs-rise pointer-events-auto flex items-center gap-3 rounded-xl bg-[#1f2933] px-4 py-2.5 text-white shadow-2xl"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ins text-white">
            <Icon.check size={13} />
          </span>
          <span className="text-[12.5px]">
            {accepted} accepted, {rejected} rejected · logged in version history
          </span>
          <button
            type="button"
            onClick={ai.dismissResolved}
            className="ml-1 rounded-md bg-white/15 px-2 py-1 text-[11.5px] font-medium hover:bg-white/25"
          >
            View history
          </button>
          <button
            type="button"
            onClick={ai.undoLast}
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-[#a5e8f2] hover:bg-white/10"
          >
            Undo all
          </button>
          <button
            type="button"
            onClick={ai.dismissResolved}
            aria-label="Dismiss"
            className="rounded p-1 text-white/60 hover:bg-white/10"
          >
            <Icon.x size={13} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
