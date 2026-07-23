import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useVariables } from '../editor/variablesContext';
import { resolveVariable } from '../editor/extensions/variable';

/**
 * Renders a variable token's current value (set) or its technical name as a
 * teal-dashed chip (unset). Content is non-editable. The token re-renders when
 * `variableValues` changes (via VariablesContext). All visual states — the
 * highlight tint + dotted underline (toggle on), the hover/selected reveal
 * (toggle off), and the unset chip — are CSS keyed off `.docs-var`, the root
 * `.docs-highlight-variables` class, and the `data-var-unset` attribute; the
 * view itself stays dumb.
 */
export function VariableNodeView({ node, selected }: NodeViewProps) {
  const { values } = useVariables();
  const name = node.attrs.name as string;
  const { display, unset } = resolveVariable(values, name);

  return (
    <NodeViewWrapper
      as="span"
      className={['docs-var', selected ? 'is-selected' : ''].join(' ').trim()}
      data-var-name={name}
      data-var-unset={unset ? '' : undefined}
      contentEditable={false}
    >
      {unset ? `{{${display}}}` : display}
    </NodeViewWrapper>
  );
}
