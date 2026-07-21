import { useEffect, useRef } from 'react';
import { EditorContent } from '@tiptap/react';
import { EditorProvider, useEditorState } from './editor/context';
import type { DocsEditorProps } from './types';
import { TopBar } from './components/TopBar';
import { FormattingToolbar } from './components/FormattingToolbar';
import { OutlinePanel } from './components/OutlinePanel';
import { Ruler } from './components/Ruler';
import { ToolRail } from './components/ToolRail';
import { StatusBar } from './components/StatusBar';
import { SuggestionColumn } from './components/SuggestionColumn';
import { AIPromptPopover } from './components/AIPromptPopover';
import { FloatingToolbar } from './components/FloatingToolbar';
import { TableMenu } from './components/TableMenu';
import { Toasts } from './components/Toasts';

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest('.docs-page-content')) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

function DocsEditorShell({ className }: { className?: string }) {
  const { editor, ai } = useEditorState();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keyboard model.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ai.openPrompt();
        return;
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        // Undo AI accept/reject before falling back to editor history.
        if (ai.canUndo) {
          e.preventDefault();
          ai.undoLast();
        }
        return;
      }
      const active = document.activeElement;
      const typing = isTypingTarget(active);
      if (ai.phase === 'reviewing' && ai.focusedChangeId) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          ai.focusNext();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          ai.focusPrev();
        } else if (!typing && e.key === 'Enter') {
          e.preventDefault();
          ai.accept(ai.focusedChangeId);
        } else if (!typing && (e.key === 'Backspace' || e.key === 'Delete')) {
          e.preventDefault();
          ai.reject(ai.focusedChangeId);
        }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [ai]);

  return (
    <div
      ref={rootRef}
      data-docs-editor-root
      className={['flex h-full min-h-0 w-full flex-col bg-white text-ink', className ?? ''].join(
        ' ',
      )}
    >
      <TopBar />
      <FormattingToolbar />

      <div data-docs-body className="relative flex min-h-0 flex-1 overflow-hidden bg-desk">
        <OutlinePanel />

        <div className="flex min-w-0 flex-1 flex-col">
          <Ruler scrollerRef={scrollerRef} />
          <div ref={scrollerRef} data-docs-scroll className="relative flex-1 overflow-auto docs-scroll">
            {/* w-max + mx-auto centers the page yet still lets the user scroll
                to its left edge when the viewport is narrower than the content
                (plain flex justify-center would clip the left, unreachable).
                The page frame + multi-page breaks are owned by the Pagination
                extension (it styles the ProseMirror element as `.pgn-paginated`),
                so there is no wrapper sheet here and zoom is applied by the
                engine's transform — see context.tsx. */}
            <div className="mx-auto flex w-max gap-4 px-4 py-3 lg:gap-6 lg:px-8 lg:py-6">
              <div className="shrink-0">
                <EditorContent editor={editor} />
              </div>
              <SuggestionColumn scrollerRef={scrollerRef} />
            </div>
          </div>
        </div>

        <ToolRail />
      </div>

      <StatusBar />

      <FloatingToolbar />
      <TableMenu />
      <AIPromptPopover />
      <Toasts />
    </div>
  );
}

/**
 * Google-Docs-style document editor with AI tracked-redline edits.
 * Wrap-and-render: the provider owns the Tiptap editor and AI review session;
 * the shell renders the full chrome.
 */
export function DocsEditor(props: DocsEditorProps) {
  return (
    <EditorProvider
      initialContent={props.initialContent}
      initialMode={props.mode}
      aiProvider={props.aiProvider}
      onSave={props.onSave}
      title={props.title ?? 'Untitled document'}
      onTitleChange={props.onTitleChange}
    >
      <DocsEditorShell className={props.className} />
    </EditorProvider>
  );
}
