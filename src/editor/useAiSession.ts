import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import { Mapping } from '@tiptap/pm/transform';
import type { Transaction } from '@tiptap/pm/state';
import type {
  AiPhase,
  AiProvider,
  AiScope,
  AiSessionSummary,
  RegistryChange,
} from '../types';
import { ChangeRegistry } from './changeRegistry';
import { resolveScope } from '../lib/scope';
import { applyRedline, resolveRedline, stripRedline } from './redlineOps';

export interface VersionEntry {
  id: string;
  label: string;
  at: number;
  summary: AiSessionSummary;
}

export interface GenerationToast {
  sectionRef?: string;
  count: number;
}

export interface AiSession {
  phase: AiPhase;
  changes: RegistryChange[];
  counts: { pending: number; accepted: number; rejected: number; total: number };
  focusedChangeId: string | null;
  generation: GenerationToast | null;
  summary: AiSessionSummary | null;
  versions: VersionEntry[];
  canUndo: boolean;

  openPrompt(): void;
  cancelPrompt(): void;
  run(instruction: string, scope: AiScope): Promise<void>;
  stop(): void;
  accept(id: string): void;
  reject(id: string): void;
  acceptAllRemaining(): void;
  rejectAll(): void;
  undoLast(): void;
  focusChange(id: string | null): void;
  focusNext(): void;
  focusPrev(): void;
  dismissResolved(): void;
  /** Wire to the editor's `transaction` event to keep positions in sync. */
  onTransaction(tr: Transaction): void;
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function useAiSession(editor: Editor | null, provider: AiProvider): AiSession {
  const registryRef = useRef<ChangeRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new ChangeRegistry();
  const registry = registryRef.current;

  const [phase, setPhase] = useState<AiPhase>('idle');
  const [focusedChangeId, setFocusedChangeId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationToast | null>(null);
  const [summary, setSummary] = useState<AiSessionSummary | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);

  // Cross-transaction position bookkeeping for the in-flight generation.
  const genMappingRef = useRef<Mapping>(new Mapping());
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const runMetaRef = useRef<{ instruction: string; scope: AiScope }>({
    instruction: '',
    scope: 'selection',
  });

  // Subscribe React to the registry so cards re-render on every change.
  const changes = useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.all(),
    () => registry.all(),
  );
  const counts = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let rejected = 0;
    for (const c of changes) {
      if (c.status === 'pending') pending++;
      else if (c.status === 'accepted') accepted++;
      else rejected++;
    }
    return { pending, accepted, rejected, total: changes.length };
  }, [changes]);

  const focusChange = useCallback(
    (id: string | null) => {
      setFocusedChangeId(id);
      if (!editor) return;
      editor.commands.setSpotlight(id);
      if (id) {
        const c = registry.get(id);
        if (c) {
          const coords = editor.view.coordsAtPos(Math.min(c.live.from, editor.state.doc.content.size));
          const scroller = editor.view.dom.closest('[data-docs-scroll]') as HTMLElement | null;
          if (scroller) {
            const target =
              coords.top - scroller.getBoundingClientRect().top + scroller.scrollTop - 120;
            scroller.scrollTo({ top: target, behavior: 'smooth' });
          }
        }
      }
    },
    [editor, registry],
  );

  const onTransaction = useCallback(
    (tr: Transaction) => {
      if (!tr.docChanged) return;
      registry.remap(tr.mapping);
      // While generating, later anchors must account for earlier edits.
      genMappingRef.current.appendMapping(tr.mapping);
    },
    [registry],
  );

  const openPrompt = useCallback(() => setPhase('invoking'), []);
  const cancelPrompt = useCallback(() => setPhase('idle'), []);

  const finalizeIfDone = useCallback(() => {
    const c = registry.counts();
    if (c.total > 0 && c.pending === 0) {
      const sum: AiSessionSummary = {
        accepted: c.accepted,
        rejected: c.rejected,
        total: c.total,
        instruction: runMetaRef.current.instruction,
        scope: runMetaRef.current.scope,
      };
      setSummary(sum);
      setPhase('resolved');
      // Record the AI session as a named version.
      setVersions((prev) => [
        {
          id: uid('ver'),
          label: `AI edit — ${runMetaRef.current.instruction.slice(0, 40) || 'changes'}`,
          at: Date.now(),
          summary: sum,
        },
        ...prev,
      ]);
    }
  }, [registry]);

  const accept = useCallback(
    (id: string) => {
      const c = registry.get(id);
      if (!editor || !c || c.status !== 'pending') return;
      resolveRedline(editor, c, 'accept');
      registry.accept(id);
      if (focusedChangeId === id) editor.commands.setSpotlight(null);
      finalizeIfDone();
    },
    [editor, registry, focusedChangeId, finalizeIfDone],
  );

  const reject = useCallback(
    (id: string) => {
      const c = registry.get(id);
      if (!editor || !c || c.status !== 'pending') return;
      resolveRedline(editor, c, 'reject');
      registry.reject(id);
      if (focusedChangeId === id) editor.commands.setSpotlight(null);
      finalizeIfDone();
    },
    [editor, registry, focusedChangeId, finalizeIfDone],
  );

  const acceptAllRemaining = useCallback(() => {
    if (!editor) return;
    for (const c of registry.pending()) resolveRedline(editor, c, 'accept');
    registry.acceptAll();
    editor.commands.setSpotlight(null);
    finalizeIfDone();
  }, [editor, registry, finalizeIfDone]);

  const rejectAll = useCallback(() => {
    if (!editor) return;
    for (const c of registry.pending()) resolveRedline(editor, c, 'reject');
    registry.rejectAll();
    editor.commands.setSpotlight(null);
    finalizeIfDone();
  }, [editor, registry, finalizeIfDone]);

  const undoLast = useCallback(() => {
    if (!editor) return;
    const id = registry.undo();
    if (id) {
      editor.chain().focus().undo().run();
      if (phase === 'resolved') {
        setPhase('reviewing');
        setSummary(null);
      }
    }
  }, [editor, registry, phase]);

  const focusNext = useCallback(() => {
    const id = registry.nextPending(focusedChangeId);
    focusChange(id);
  }, [registry, focusedChangeId, focusChange]);

  const focusPrev = useCallback(() => {
    const id = registry.prevPending(focusedChangeId);
    focusChange(id);
  }, [registry, focusedChangeId, focusChange]);

  const stop = useCallback(() => {
    abortRef.current.cancelled = true;
    setGeneration(null);
    if (registry.counts().total > 0) setPhase('reviewing');
    else setPhase('idle');
  }, [registry]);

  const dismissResolved = useCallback(() => {
    // Clean up any leftover marks and reset the session.
    if (editor) {
      for (const c of registry.all()) stripRedline(editor, c.id);
      editor.commands.setSpotlight(null);
    }
    registry.clear();
    setSummary(null);
    setFocusedChangeId(null);
    setPhase('idle');
  }, [editor, registry]);

  const run = useCallback(
    async (instruction: string, scope: AiScope) => {
      if (!editor) return;
      runMetaRef.current = { instruction, scope };
      abortRef.current = { cancelled: false };
      genMappingRef.current = new Mapping();
      registry.clear();
      setSummary(null);
      setFocusedChangeId(null);
      setPhase('generating');
      setGeneration({ count: 0 });

      const resolved = resolveScope(editor.state, scope);
      let count = 0;

      try {
        for await (const change of provider.proposeEdits({
          scope,
          instruction,
          text: resolved.text,
        })) {
          if (abortRef.current.cancelled) break;

          // Map the provider's original anchor into the live document.
          const from = genMappingRef.current.map(change.anchor.from, -1);
          const to = genMappingRef.current.map(change.anchor.to, 1);

          const live = applyRedline(editor, {
            changeId: change.id,
            from,
            to,
            deletion: change.deletion,
            insertion: change.insertion,
          });

          const entry = registry.add(change);
          entry.live = live;

          count += 1;
          setGeneration({ sectionRef: change.sectionRef, count });
        }
      } finally {
        setGeneration(null);
        if (!abortRef.current.cancelled) {
          if (registry.counts().total > 0) setPhase('reviewing');
          else setPhase('idle');
        }
      }
    },
    [editor, provider, registry],
  );

  return useMemo<AiSession>(
    () => ({
      phase,
      changes,
      counts,
      focusedChangeId,
      generation,
      summary,
      versions,
      canUndo: registry.canUndo(),
      openPrompt,
      cancelPrompt,
      run,
      stop,
      accept,
      reject,
      acceptAllRemaining,
      rejectAll,
      undoLast,
      focusChange,
      focusNext,
      focusPrev,
      dismissResolved,
      onTransaction,
    }),
    [
      phase,
      changes,
      counts,
      focusedChangeId,
      generation,
      summary,
      versions,
      registry,
      openPrompt,
      cancelPrompt,
      run,
      stop,
      accept,
      reject,
      acceptAllRemaining,
      rejectAll,
      undoLast,
      focusChange,
      focusNext,
      focusPrev,
      dismissResolved,
      onTransaction,
    ],
  );
}
