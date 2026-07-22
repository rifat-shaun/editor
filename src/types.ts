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
}

export type EditorTheme = 'light' | 'dark';

export interface BrandLogo {
  /** Logo source for the light theme. */
  light: string;
  /** Logo source for the dark theme; defaults to `light` when omitted. */
  dark?: string;
  /** Accessible label / alt text. Defaults to "Home". */
  alt?: string;
}
