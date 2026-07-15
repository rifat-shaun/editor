import { forwardRef } from 'react';
import type { RegistryChange } from '../types';
import { Icon } from './icons';

export interface SuggestionCardProps {
  change: RegistryChange;
  selected: boolean;
  focused: boolean;
  onSelect(): void;
  onAccept(): void;
  onReject(): void;
}

const STATUS_TAG: Record<string, { text: string; cls: string } | null> = {
  pending: null,
  accepted: { text: '✓ ACCEPTED', cls: 'text-ins bg-ins-bg' },
  rejected: { text: '✕ REJECTED', cls: 'text-del bg-del-bg' },
};

export const SuggestionCard = forwardRef<HTMLDivElement, SuggestionCardProps>(function SuggestionCard(
  { change, selected, focused, onSelect, onAccept, onReject },
  ref,
) {
  const tag = STATUS_TAG[change.status];
  const resolved = change.status !== 'pending';

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`AI suggestion ${change.sectionRef ?? ''}`.trim()}
      tabIndex={0}
      onClick={onSelect}
      onFocus={onSelect}
      className={[
        'w-full cursor-pointer rounded-[10px] border bg-white p-3 shadow-sm outline-none transition-all',
        selected || focused
          ? 'border-primary-border bg-[#f2fcfd] ring-1 ring-primary-border'
          : 'border-border hover:border-[#cfd6db]',
        focused ? '!border-spotlight-border ring-2 ring-spotlight-border' : '',
        resolved ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
          <Icon.sparkle size={10} />
        </span>
        <span className="text-[11px] font-semibold text-primary">AI suggestion</span>
        {change.sectionRef && (
          <span className="text-[10.5px] text-muted">· {change.sectionRef}</span>
        )}
        {tag && (
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold ${tag.cls}`}>
            {tag.text}
          </span>
        )}
      </div>

      <p className="mb-2 text-[11.5px] leading-[1.5] text-[#3d4852]">{change.rationale}</p>

      <div className="mb-2.5 space-y-1 rounded-md bg-panel p-2 text-[11px] leading-snug">
        {change.deletion && (
          <div>
            <span className="rounded bg-del-bg px-1 text-del line-through">{change.deletion}</span>
          </div>
        )}
        {change.insertion && (
          <div>
            <span className="rounded bg-ins-bg px-1 text-ins underline decoration-ins-border decoration-2">
              {change.insertion}
            </span>
          </div>
        )}
      </div>

      {!resolved && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAccept();
            }}
            className="inline-flex items-center gap-1 rounded-[5px] bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-white hover:brightness-110"
          >
            <Icon.check size={12} />
            Accept
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReject();
            }}
            className="inline-flex items-center gap-1 rounded-[5px] border border-[#d7dde1] px-2.5 py-1 text-[11.5px] font-medium text-ui hover:bg-[#eef1f3]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title={change.rationale}
            className="ml-auto text-[11px] text-primary underline decoration-dotted"
          >
            Why?
          </button>
        </div>
      )}
    </div>
  );
});

export interface CommentCardData {
  id: string;
  author: string;
  color: string;
  text: string;
  pos: number;
}

export const CommentCard = forwardRef<
  HTMLDivElement,
  { comment: CommentCardData; selected: boolean; onSelect(): void }
>(function CommentCard({ comment, selected, onSelect }, ref) {
  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={[
        'w-full cursor-pointer rounded-[10px] border bg-white p-3 shadow-sm transition-all',
        selected ? 'border-spotlight-border ring-1 ring-spotlight-border' : 'border-border',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          style={{ background: comment.color }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        >
          {comment.author
            .split(' ')
            .map((p) => p[0])
            .join('')}
        </span>
        <span className="text-[11.5px] font-semibold text-ink">{comment.author}</span>
      </div>
      <p className="text-[11.5px] leading-[1.5] text-[#3d4852]">{comment.text}</p>
    </div>
  );
});
