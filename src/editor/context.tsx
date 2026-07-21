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
import { Pagination } from './pagination/extension';
import { useAiSession, type AiSession } from './useAiSession';
import type { AiProvider, EditorMode, JSONContent } from '../types';
import type { RulerUnit } from '../components/rulerUnits';

/** Persisted ruler preferences (first localStorage use — guarded for SSR/tests). */
const RULER_VISIBLE_KEY = 'docs-editor:ruler-visible';
const RULER_UNIT_KEY = 'docs-editor:ruler-unit';
function readPref<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : parse(raw);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore (private mode / SSR) */
  }
}

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
  /** Word-style ruler: visibility (View → Show ruler) + measurement unit. */
  showRuler: boolean;
  toggleRuler(): void;
  rulerUnit: RulerUnit;
  setRulerUnit(unit: RulerUnit): void;
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
  const [pageCount, setPageCount] = useState(1); // real count from the pagination engine
  const [showRuler, setShowRuler] = useState(() => readPref(RULER_VISIBLE_KEY, false, (r) => r === 'true'));
  const [rulerUnit, setRulerUnitState] = useState<RulerUnit>(() =>
    readPref<RulerUnit>(RULER_UNIT_KEY, 'in', (r) => (r === 'cm' ? 'cm' : 'in')),
  );
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

  const toggleRuler = () => {
    setShowRuler((v) => {
      const next = !v;
      writePref(RULER_VISIBLE_KEY, String(next));
      return next;
    });
  };
  const setRulerUnit = (unit: RulerUnit) => {
    setRulerUnitState(unit);
    writePref(RULER_UNIT_KEY, unit);
  };

  const toggleOutline = () => {
    outlineUserSet.current = true;
    setOutlineOpen((o) => !o);
  };

  const editor = useEditor({
    editable: initialMode !== 'viewing',
    content: initialContent,
    extensions: [
      ...buildExtensions(),
      // Pagination is a schema-neutral extension (no nodes/marks), so it is
      // added only to the live editor — buildExtensions() stays clean for
      // headless position-finding and unit tests.
      Pagination.configure({
        pageFormat: 'Letter', // 816×1056 — matches the editor's page width
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
        header: { text: props.title, align: 'left' },
        showPageNumbers: true, // footer renders "n / N" centered
      }),
    ],
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
      // The pagination engine writes the real page count to its storage on every
      // (debounced) recompute, which also fires a transaction — pick it up here.
      const pc = (editor.storage.pagination as { pageCount?: number } | undefined)?.pageCount;
      if (typeof pc === 'number') setPageCount((prev) => (prev === pc ? prev : pc));
    };
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(mode !== 'viewing');
  }, [editor, mode]);

  // Keep the running header in sync with the (renameable) document title.
  useEffect(() => {
    editor?.commands.updateHeader({ text: title, align: 'left' });
  }, [editor, title]);

  // Drive the pagination engine's (transform-based, measurement-safe) zoom
  // from the editor's zoom state. This is the single zoom mechanism now.
  useEffect(() => {
    editor?.commands.setZoom(zoom / 100);
  }, [editor, zoom]);

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
    // `doc.textContent` concatenates blocks with no separator (merging the last
    // word of one block with the first of the next), so count words from
    // `getText()` which joins blocks with newlines. Characters count inline
    // text (with spaces), excluding block breaks.
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
      wordCount: editor.getText().match(WORDS)?.length ?? 0,
      charCount: editor.state.doc.textContent.length,
      outline: items,
    };
    // Recompute whenever the document mutates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docVersion]);

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
      showRuler,
      toggleRuler,
      rulerUnit,
      setRulerUnit,
      ai,
    }),
    // setTitle / toggleOutline / toggleRuler intentionally excluded to avoid churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, mode, title, wordCount, charCount, pageCount, savedAt, outline, outlineOpen, zoom, showRuler, rulerUnit, ai],
  );

  return <EditorContext.Provider value={value}>{props.children}</EditorContext.Provider>;
}
