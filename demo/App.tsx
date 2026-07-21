import { useState } from 'react';
import { DocsEditor } from '../src/DocsEditor';
import type { EditorMode, JSONContent } from '../src/types';
import { ndaContent } from './ndaContent';

export default function App() {
  const [title, setTitle] = useState('Mutual NDA — Acme × Northstar');
  const [, setSaved] = useState<JSONContent | null>(null);

  const mode: EditorMode = 'editing';

  return (
    <div className="h-screen w-screen">
      <DocsEditor
        initialContent={ndaContent}
        mode={mode}
        title={title}
        onTitleChange={setTitle}
        onSave={(content) => setSaved(content)}
      />
    </div>
  );
}
