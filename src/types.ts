import type { JSONContent } from '@tiptap/core';

export type { JSONContent };

export type EditorMode = 'editing' | 'viewing';

export interface DocsEditorProps {
  initialContent: JSONContent;
  mode: EditorMode;
  onSave(content: JSONContent): void;
  /** Optional document title shown in the top bar (inline-renameable). */
  title?: string;
  onTitleChange?(title: string): void;
  className?: string;
  /**
   * Optional brand logo shown at the top-left in place of the app-grid icon.
   * Provide image sources (URLs, data URIs, or bundler-imported asset paths);
   * the editor renders the variant matching the active theme and falls back to
   * the app-grid icon when omitted. The image is size-constrained to fit the
   * top bar — a wordmark simply makes the button wider. `dark` defaults to
   * `light` if not given.
   */
  brandLogo?: BrandLogo;
  /**
   * Controlled color theme. When provided, the editor follows the consumer's
   * value (light/dark is driven by the host app) instead of managing its own,
   * and the "Dark mode" toggle is hidden from the View menu. Omit to let the
   * editor own the theme (persisted, initialized from the system preference).
   */
  theme?: EditorTheme;
  /**
   * The variables (merge fields) the `@` picker and Insert→Variable menu can
   * insert. Each needs a technical `name` and a human `label`.
   */
  variableList?: VariableDef[];
  /**
   * Current values for variables, keyed by technical name. Passed reactively:
   * when this object changes, every variable token re-renders with the new
   * value. A `null`/absent entry renders the token as an unset chip.
   */
  variableValues?: VariableValues;
}

export type EditorTheme = 'light' | 'dark';

export interface VariableDef {
  /** Technical name stored in the document (e.g. `client_name`). */
  name: string;
  /** Human-readable label shown in the picker. */
  label: string;
  /** Optional grouping label for the picker. */
  group?: string;
}

/** Variable values keyed by technical name; `null`/absent = unset. */
export type VariableValues = Record<string, string | null>;

/**
 * Imperative handle exposed via `ref` on `<DocsEditor>`. Lets a consumer button
 * insert a variable at the current caret (the same command the `@` picker and
 * menu use) and focus the editor.
 */
export interface DocsEditorHandle {
  /** Insert a variable token at the current selection and focus the editor. */
  insertVariable(name: string): void;
  /** Focus the editor. */
  focus(): void;
}

export interface BrandLogo {
  /** Logo source for the light theme. */
  light: string;
  /** Logo source for the dark theme; defaults to `light` when omitted. */
  dark?: string;
  /** Accessible label / alt text. Defaults to "Home". */
  alt?: string;
}
