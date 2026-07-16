import { PluginKey } from '@tiptap/pm/state';
import type { DecorationSet } from '@tiptap/pm/view';

export interface PaginationPluginState {
  /** Break positions (kept mapped between recomputes for cheap invalidation). */
  breaks: number[];
  /** The live decoration set rendered by the view. */
  decorations: DecorationSet;
}

export const paginationKey = new PluginKey<PaginationPluginState>('pagination');

export interface RecomputeMeta {
  type: 'recompute';
  breaks: number[];
  decorations: DecorationSet;
}
