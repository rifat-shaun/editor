import { BubbleMenu } from '@tiptap/react';
import { useEditorState } from '../editor/context';
import { Icon } from './icons';

const QUICK: { label: string; instruction: string }[] = [
  { label: 'Shorten', instruction: 'Make this more concise without losing meaning.' },
  { label: 'Formalize', instruction: 'Rewrite in a more formal, professional tone.' },
  { label: 'Fix grammar', instruction: 'Fix grammar and improve clarity.' },
];

export function FloatingToolbar() {
  const { editor, ai, mode } = useEditorState();
  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="ai-floating-toolbar"
      shouldShow={({ editor: ed, from, to }) =>
        mode !== 'viewing' &&
        from !== to &&
        ai.phase === 'idle' &&
        !ed.isActive('deletion') &&
        // Inside a table, the dedicated TableMenu takes over (avoid two bubbles).
        !ed.isActive('table')
      }
      tippyOptions={{ duration: 120, placement: 'top' }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-white p-1 shadow-lg">
        <button
          type="button"
          onClick={() => ai.openPrompt()}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary-soft px-2 text-[11.5px] font-semibold text-primary"
        >
          <Icon.sparkle size={13} />
          AI edit
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => void ai.run(q.instruction, 'selection')}
            className="rounded-md px-2 py-1 text-[11.5px] text-ui hover:bg-[#eef1f3]"
          >
            {q.label}
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
