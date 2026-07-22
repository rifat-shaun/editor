import './styles.css';

export { DocsEditor } from './DocsEditor';
export { useEditorState } from './editor/context';
// DOCX export is heavy (docx-js); load it on demand to keep the main bundle
// lean: `const { downloadDocx } = await import('@acme/docs-editor/dist/…/export/docx')`
// or, within the app, `await import('./editor/export/docx')`.

export type { BrandLogo, DocsEditorProps, EditorMode, EditorTheme, JSONContent } from './types';
export type { EditorStateValue, OutlineItem } from './editor/context';
