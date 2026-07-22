import { useRef } from 'react';
import { EditorContent } from '@tiptap/react';
import { EditorProvider, useEditorState } from './editor/context';
import type { BrandLogo, DocsEditorProps } from './types';
import { TopBar } from './components/TopBar';
import { FormattingToolbar } from './components/FormattingToolbar';
import { OutlinePanel } from './components/OutlinePanel';
import { Ruler } from './components/Ruler';
import { ToolRail } from './components/ToolRail';
import { StatusBar } from './components/StatusBar';
import { TableMenu } from './components/TableMenu';
import { LinkLayer } from './components/LinkLayer';

function DocsEditorShell({ className, brandLogo }: { className?: string; brandLogo?: BrandLogo }) {
  const { editor } = useEditorState();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    // Scope anchor: the shipped stylesheet scopes every rule under
    // `[data-docs-editor-root]` so nothing leaks into the host app. It's a
    // transparent full-size wrapper (no utility classes of its own) so all
    // styled elements stay *descendants* of the anchor. The design tokens the
    // stylesheet defines on this element are inherited by everything inside.
    <div data-docs-editor-root style={{ height: '100%', width: '100%' }}>
      <div
        ref={rootRef}
        className={['flex h-full min-h-0 w-full flex-col bg-white text-ink', className ?? ''].join(' ')}
      >
        <TopBar brandLogo={brandLogo} />
      <FormattingToolbar />

      <div data-docs-body className="relative flex min-h-0 flex-1 overflow-hidden bg-desk">
        <OutlinePanel />

        <div className="flex min-w-0 flex-1 flex-col">
          <Ruler scrollerRef={scrollerRef} />
          <div ref={scrollerRef} data-docs-scroll className="relative flex-1 overflow-auto docs-scroll">
            {/* w-max + mx-auto centers the page yet still lets the user scroll
                to its left edge when the viewport is narrower than the content.
                The page frame + multi-page breaks are owned by the Pagination
                extension (it styles the ProseMirror element as `.pgn-paginated`),
                so there is no wrapper sheet here and zoom is applied by the
                engine's transform — see context.tsx. */}
            <div className="mx-auto flex w-max gap-4 px-4 py-3 lg:gap-6 lg:px-8 lg:py-6">
              <div className="shrink-0">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        </div>

        <ToolRail />
      </div>

      <StatusBar />
      <TableMenu />
      <LinkLayer />
      </div>
    </div>
  );
}

/**
 * Google-Docs-style document editor. Wrap-and-render: the provider owns the
 * Tiptap editor; the shell renders the full chrome.
 */
export function DocsEditor(props: DocsEditorProps) {
  return (
    <EditorProvider
      initialContent={props.initialContent}
      initialMode={props.mode}
      onSave={props.onSave}
      title={props.title ?? 'Untitled document'}
      onTitleChange={props.onTitleChange}
      theme={props.theme}
    >
      <DocsEditorShell className={props.className} brandLogo={props.brandLogo} />
    </EditorProvider>
  );
}
