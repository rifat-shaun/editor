/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { buildExtensions } from './extensionsList';
import { useAiSession, type AiSession } from './useAiSession';
import type { AiProvider, EditorMode, JSONContent } from '../types';

export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  pos: number;
}

export interface EditorStateValue {
  editor: Editor | null;
  mode: EditorMode;
  setMode(mode: EditorMode): void;
  title: string;
  setTitle(title: string): void;
  wordCount: number;
  charCount: number;
  pageCount: number;
  savedAt: number | null;
  outline: OutlineItem[];
  outlineOpen: boolean;
  toggleOutline(): void;
  zoom: number;
  setZoom(zoom: number): void;
  ai: AiSession;
}

const OUTLINE_BREAKPOINT = 1100;

const EditorContext = createContext<EditorStateValue | null>(null);

/** Public hook: read editor + AI review state from within a `<DocsEditor>`. */
export function useEditorState(): EditorStateValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorState must be used inside <DocsEditor>');
  return ctx;
}

const WORDS = /\S+/g;

export function EditorProvider(props: {
  initialContent: JSONContent;
  initialMode: EditorMode;
  aiProvider: AiProvider;
  onSave(content: JSONContent): void;
  title: string;
  onTitleChange?(title: string): void;
  children: ReactNode;
}) {
  const { initialContent, initialMode, aiProvider, onSave, onTitleChange } = props;

  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [title, setTitleState] = useState(props.title);
  const [zoom, setZoom] = useState(100);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [docVersion, setDocVersion] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= OUTLINE_BREAKPOINT,
  );
  const outlineUserSet = useRef(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-collapse the outline on narrow viewports until the user overrides it.
  useEffect(() => {
    const onResize = () => {
      if (!outlineUserSet.current) setOutlineOpen(window.innerWidth >= OUTLINE_BREAKPOINT);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleOutline = () => {
    outlineUserSet.current = true;
    setOutlineOpen((o) => !o);
  };

  const editor = useEditor({
    editable: initialMode !== 'viewing',
    content: initialContent,
    extensions: buildExtensions(),
    editorProps: {
      attributes: {
        class: 'docs-page-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document body',
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Debounced autosave.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSave(ed.getJSON());
        setSavedAt(Date.now());
      }, 800);
    },
  });

  const ai = useAiSession(editor ?? null, aiProvider);

  // Keep the registry's positions in sync with every document mutation, and
  // bump a version counter so derived views (outline, word count) recompute.
  const aiRef = useRef(ai);
  aiRef.current = ai;
  useEffect(() => {
    if (!editor) return;
    const handler = ({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      aiRef.current.onTransaction(transaction);
      if (transaction.docChanged) setDocVersion((v) => v + 1);
    };
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(mode !== 'viewing');
  }, [editor, mode]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const setTitle = (t: string) => {
    setTitleState(t);
    onTitleChange?.(t);
  };

  const { wordCount, charCount, outline } = useMemo(() => {
    if (!editor) return { wordCount: 0, charCount: 0, outline: [] as OutlineItem[] };
    const text = editor.state.doc.textContent;
    const items: OutlineItem[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const t = node.textContent.trim();
        if (t)
          items.push({
            id: `h-${pos}`,
            text: t,
            level: (node.attrs.level as number) ?? 1,
            pos,
          });
      }
      return true;
    });
    return {
      wordCount: text.match(WORDS)?.length ?? 0,
      charCount: text.length,
      outline: items,
    };
    // Recompute whenever the document mutates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docVersion]);

  const pageCount = Math.max(1, Math.ceil(wordCount / 500));

  const value = useMemo<EditorStateValue>(
    () => ({
      editor: editor ?? null,
      mode,
      setMode,
      title,
      setTitle,
      wordCount,
      charCount,
      pageCount,
      savedAt,
      outline,
      outlineOpen,
      toggleOutline,
      zoom,
      setZoom,
      ai,
    }),
    // setTitle / toggleOutline intentionally excluded to avoid churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, mode, title, wordCount, charCount, pageCount, savedAt, outline, outlineOpen, zoom, ai],
  );

  return <EditorContext.Provider value={value}>{props.children}</EditorContext.Provider>;
}
