import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEditor, EditorContent } from '@tiptap/react';
import { buildExtensions } from '../src/editor/extensionsList';
import { VariablesProvider } from '../src/editor/variablesContext';
import type { VariableDef, VariableValues } from '../src/types';

const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'variable', attrs: { name: 'client_name' } }] }],
};

// A minimal editor mount (no chrome/pagination) exercising the real reactivity
// path: VariablesProvider → EditorContent → the variable React NodeView.
function Harness({ catalog, values }: { catalog: VariableDef[]; values: VariableValues }) {
  const editor = useEditor({ extensions: buildExtensions(), content: DOC });
  return (
    <VariablesProvider catalog={catalog} values={values}>
      <EditorContent editor={editor} />
    </VariablesProvider>
  );
}

const CATALOG: VariableDef[] = [{ name: 'client_name', label: 'Client name' }];

describe('variable reactivity to prop changes', () => {
  it('re-renders the in-document token when variableValues changes (new reference)', async () => {
    const { rerender } = render(<Harness catalog={CATALOG} values={{ client_name: null }} />);

    // Unset → the {{name}} chip.
    await screen.findByText('{{client_name}}');

    // A new values object flips the same token to the resolved value.
    rerender(<Harness catalog={CATALOG} values={{ client_name: 'Acme Corp' }} />);
    await screen.findByText('Acme Corp');
    expect(screen.queryByText('{{client_name}}')).toBeNull();

    // And back to unset.
    rerender(<Harness catalog={CATALOG} values={{ client_name: null }} />);
    await waitFor(() => expect(screen.queryByText('Acme Corp')).toBeNull());
    await screen.findByText('{{client_name}}');
  });
});
