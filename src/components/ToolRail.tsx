import { useEditorState } from '../editor/context';
import { Icon } from './icons';
import type { IconName } from './icons';

interface RailItem {
  key: string;
  icon: IconName;
  label: string;
}

const ITEMS: RailItem[] = [
  { key: 'comments', icon: 'comment', label: 'Comments' },
  { key: 'find', icon: 'find', label: 'Find & replace' },
  { key: 'history', icon: 'history', label: 'Version history' },
  { key: 'export', icon: 'exportIcon', label: 'Export' },
  { key: 'share', icon: 'share', label: 'Share' },
];

export function ToolRail() {
  const { ai } = useEditorState();
  const aiActive = ai.phase === 'reviewing' || ai.phase === 'generating';

  return (
    <div className="flex w-[46px] shrink-0 flex-col items-center gap-1 border-l border-border bg-panel py-2">
      <button
        type="button"
        title="AI edits"
        aria-label="AI edits"
        onClick={() => (ai.phase === 'idle' ? ai.openPrompt() : ai.focusNext())}
        className="group relative mb-1 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={
          aiActive
            ? { background: '#0e7490', color: '#fff', boxShadow: '0 0 0 3px #d4f2f7' }
            : { color: '#8a939b' }
        }
      >
        <Icon.sparkle size={18} />
        {ai.counts.pending > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[9px] font-bold text-white">
            {ai.counts.pending}
          </span>
        )}
      </button>
      {ITEMS.map((it) => {
        const IconCmp = Icon[it.icon];
        return (
          <button
            key={it.key}
            type="button"
            title={it.label}
            aria-label={it.label}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[#e9edee] hover:text-ui"
          >
            <IconCmp size={18} />
          </button>
        );
      })}
    </div>
  );
}
