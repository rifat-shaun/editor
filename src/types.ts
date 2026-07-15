import type { JSONContent } from '@tiptap/core';

export type { JSONContent };

export type EditorMode = 'editing' | 'suggesting' | 'viewing';

export type AiScope = 'selection' | 'section' | 'document';

/**
 * A single change proposed by the AI provider. Positions are ProseMirror
 * document positions captured at the time the scope text was extracted.
 */
export interface ProposedChange {
  id: string;
  anchor: { from: number; to: number };
  /** Text being removed (rendered as a strikethrough deletion). */
  deletion?: string;
  /** Text being added (rendered as an underlined insertion). */
  insertion?: string;
  rationale: string;
  /** e.g. "§3.3" — used as the card's section reference. */
  sectionRef?: string;
}

export interface AiProvider {
  proposeEdits(input: {
    scope: AiScope;
    instruction: string;
    text: string;
  }): AsyncIterable<ProposedChange>;
}

export interface DocsEditorProps {
  initialContent: JSONContent;
  mode: EditorMode;
  onSave(content: JSONContent): void;
  aiProvider: AiProvider;
  /** Optional document title shown in the top bar (inline-renameable). */
  title?: string;
  onTitleChange?(title: string): void;
  className?: string;
}

/* --------------------------------------------------------------- *
 * Internal change-registry model
 * --------------------------------------------------------------- */

export type ChangeStatus = 'pending' | 'accepted' | 'rejected';

export type ChangeKind = 'insertion' | 'deletion' | 'replacement';

/**
 * A ProposedChange enriched with live registry state. `anchor` is remapped
 * as the document mutates so cards and spotlights stay attached.
 */
export interface RegistryChange extends ProposedChange {
  kind: ChangeKind;
  status: ChangeStatus;
  /** Live-remapped position; diverges from `anchor` after edits. */
  live: { from: number; to: number };
}

/** AI edit lifecycle. */
export type AiPhase = 'idle' | 'invoking' | 'generating' | 'reviewing' | 'resolved';

export interface AiSessionSummary {
  accepted: number;
  rejected: number;
  total: number;
  instruction: string;
  scope: AiScope;
}
