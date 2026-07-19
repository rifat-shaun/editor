import './styles.css';

export { DocsEditor } from './DocsEditor';
export { useEditorState } from './editor/context';
export { ChangeRegistry } from './editor/changeRegistry';
export { resolveScope, findSectionRange } from './lib/scope';
// DOCX export is heavy (docx-js); load it on demand to keep the main bundle
// lean: `const { downloadDocx } = await import('@acme/docs-editor/dist/…/export/docx')`
// or, within the app, `await import('./editor/export/docx')`.

export type {
  DocsEditorProps,
  EditorMode,
  AiScope,
  AiProvider,
  ProposedChange,
  RegistryChange,
  ChangeStatus,
  ChangeKind,
  AiPhase,
  AiSessionSummary,
  JSONContent,
} from './types';
export type { EditorStateValue, OutlineItem } from './editor/context';
export type { AiSession, VersionEntry } from './editor/useAiSession';
