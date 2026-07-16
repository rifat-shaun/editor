import { useState } from 'react';
import { useEditorState } from '../editor/context';
import type { AiScope } from '../types';
import { useDismissable } from '../hooks/useDismissable';
import { Icon } from './icons';
import { Segmented } from './primitives';

const CHIPS = ['Shorten', 'Formalize tone', 'Fix grammar & clarity', 'Simplify language'];

export function AIPromptPopover() {
  const { ai } = useEditorState();
  const [instruction, setInstruction] = useState('');
  const [scope, setScope] = useState<AiScope>('selection');
  const ref = useDismissable<HTMLDivElement>(
    ai.phase === 'invoking',
    () => ai.cancelPrompt(),
    { trapFocus: true },
  );

  if (ai.phase !== 'invoking') return null;

  const submit = () => {
    const text = instruction.trim();
    if (!text) return;
    void ai.run(text, scope);
    setInstruction('');
  };

  return (
    <div className="print-hide pointer-events-none fixed inset-0 z-50 flex items-start justify-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="AI edit instruction"
        className="docs-rise pointer-events-auto mt-24 w-[520px] max-w-[92vw] rounded-xl border border-primary-border bg-white p-4 shadow-2xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
            <Icon.sparkle size={14} />
          </span>
          <span className="text-[13px] font-semibold text-ink">Edit with AI</span>
          <button
            type="button"
            onClick={ai.cancelPrompt}
            aria-label="Close"
            className="ml-auto rounded p-1 text-muted hover:bg-[#eef1f3]"
          >
            <Icon.x size={15} />
          </button>
        </div>

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Tell the AI how to edit — e.g. “Tighten the confidentiality clause and remove redundancy.”"
          className="w-full resize-none rounded-lg border border-border bg-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-primary-border focus:bg-white"
        />

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-muted">Scope</span>
          <Segmented<AiScope>
            label="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'selection', label: 'Selection' },
              { value: 'section', label: 'Section' },
              { value: 'document', label: 'Document' },
            ]}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setInstruction(c)}
              className="rounded-full border border-border bg-panel px-2.5 py-1 text-[11px] text-ui hover:border-primary-border hover:text-primary"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="max-w-[320px] text-[10.5px] leading-snug text-muted">
            Changes are proposed as tracked redlines — nothing is applied until you accept.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!instruction.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            <Icon.sparkle size={13} />
            Generate
            <kbd className="rounded bg-white/20 px-1 text-[10px]">⌘↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
