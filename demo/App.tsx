import { useMemo, useState } from 'react';
import { DocsEditor } from '../src/DocsEditor';
import type { EditorMode, JSONContent } from '../src/types';
import { createMockAiProvider } from './mockAiProvider';
import { ndaContent } from './ndaContent';

export default function App() {
  const aiProvider = useMemo(() => createMockAiProvider(ndaContent), []);
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
        aiProvider={aiProvider}
      />
    </div>
  );
}
