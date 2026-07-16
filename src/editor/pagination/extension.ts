import { Extension } from '@tiptap/core';
import {
  DEFAULT_OPTIONS,
  type HeaderFooter,
  type Margins,
  type PageFormat,
  type PaginationOptions,
} from './config';
import { createPaginationPlugin, type PaginationStorage } from './plugin';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pagination: {
      /** Switch page format ('A4' | 'Letter' | 'Legal' | {width,height}). */
      setPageFormat: (format: PageFormat) => ReturnType;
      /** Merge-update the page margins. */
      updateMargins: (margins: Partial<Margins>) => ReturnType;
      /** Set/clear the running header. */
      updateHeader: (header?: HeaderFooter) => ReturnType;
      /** Set/clear the running footer. */
      updateFooter: (footer?: HeaderFooter) => ReturnType;
      /** Toggle automatic page numbers. */
      setShowPageNumbers: (value: boolean) => ReturnType;
      /** Set the on-screen zoom factor (visual only). */
      setZoom: (zoom: number) => ReturnType;
      /** Force an immediate recompute (e.g. after external layout changes). */
      recalculatePagination: () => ReturnType;
    };
  }
}

/**
 * Bar A pagination: visual, decoration-only page breaks between top-level
 * blocks. Never mutates the document model.
 */
export const Pagination = Extension.create<PaginationOptions, PaginationStorage>({
  name: 'pagination',

  addOptions() {
    return { ...DEFAULT_OPTIONS };
  },

  addStorage() {
    return { recompute: null, pageCount: 1 };
  },

  addProseMirrorPlugins() {
    // `this.options` is a stable object; commands mutate its fields in place,
    // so this getter always returns the current config.
    const getOptions = () => this.options;
    return [createPaginationPlugin(getOptions, this.storage)];
  },

  addCommands() {
    // Structural changes recompute IMMEDIATELY (no debounce), per the spec.
    const kick = () => {
      this.storage.recompute?.(true);
      return true;
    };
    return {
      setPageFormat:
        (format) =>
        () => {
          this.options.pageFormat = format;
          return kick();
        },
      updateMargins:
        (margins) =>
        () => {
          this.options.margins = { ...this.options.margins, ...margins };
          return kick();
        },
      updateHeader:
        (header) =>
        () => {
          this.options.header = header;
          return kick();
        },
      updateFooter:
        (footer) =>
        () => {
          this.options.footer = footer;
          return kick();
        },
      setShowPageNumbers:
        (value) =>
        () => {
          this.options.showPageNumbers = value;
          return kick();
        },
      setZoom:
        (zoom) =>
        () => {
          this.options.zoom = zoom;
          return kick();
        },
      recalculatePagination: () => () => kick(),
    };
  },
});
