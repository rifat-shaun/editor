/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { VariableDef, VariableValues } from '../types';

/**
 * Reactive source for variable rendering. The catalog feeds the `@` picker; the
 * values resolve each token's display. Both are consumer-provided props. This
 * context is read by the React NodeView (so tokens re-render when values change)
 * and by the picker. The non-React paths (plain-text clipboard, DOCX export)
 * read a mirror kept on `editor.storage.variable` — see VariablesSync.
 */
export interface VariablesContextValue {
  catalog: VariableDef[];
  values: VariableValues;
}

const VariablesContext = createContext<VariablesContextValue>({ catalog: [], values: {} });

export function VariablesProvider({
  catalog,
  values,
  children,
}: {
  catalog: VariableDef[];
  values: VariableValues;
  children: ReactNode;
}) {
  // Memoized on the props: a new `values`/`catalog` object (consumer-owned
  // identity) re-renders every token — the intended reactivity contract — while
  // an unrelated DocsEditor re-render does not.
  const value = useMemo(() => ({ catalog, values }), [catalog, values]);
  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>;
}

export function useVariables(): VariablesContextValue {
  return useContext(VariablesContext);
}
