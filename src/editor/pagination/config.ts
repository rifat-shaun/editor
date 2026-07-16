/**
 * Pure configuration + geometry. No DOM access — safe to import on the server
 * and trivially unit-testable.
 */

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HeaderFooterConfig {
  text: string;
  align?: 'left' | 'center' | 'right';
}

export type HeaderFooter = string | HeaderFooterConfig;

export type PageFormatName = 'A4' | 'Letter' | 'Legal';

export interface PageSize {
  width: number;
  height: number;
}

export type PageFormat = PageFormatName | PageSize;

export interface PaginationOptions {
  pageFormat: PageFormat;
  margins: Margins;
  header?: HeaderFooter;
  footer?: HeaderFooter;
  showPageNumbers: boolean;
  pageGap: number;
  zoom: number;
  debounceMs: number;
}

/** Named formats in CSS px @96dpi. */
export const PAGE_FORMATS: Record<PageFormatName, PageSize> = {
  A4: { width: 794, height: 1123 }, // 210×297 mm
  Letter: { width: 816, height: 1056 }, // 8.5×11 in
  Legal: { width: 816, height: 1344 }, // 8.5×14 in
};

export const DEFAULT_OPTIONS: PaginationOptions = {
  pageFormat: 'A4',
  // 1in top/bottom, 0.75in left/right — sensible word-processor defaults.
  margins: { top: 96, right: 72, bottom: 96, left: 72 },
  header: undefined,
  footer: undefined,
  showPageNumbers: false,
  pageGap: 24,
  zoom: 1,
  debounceMs: 200,
};

export interface Dimensions {
  pageWidth: number;
  pageHeight: number;
  mt: number;
  mr: number;
  mb: number;
  ml: number;
  gap: number;
  zoom: number;
  /**
   * The usable content height on a page: page height minus top and bottom
   * margins. Header/footer live *inside* the margin bands (Bar A), so they do
   * not further reduce this — a documented simplification.
   */
  contentHeight: number;
}

export function resolvePageSize(format: PageFormat): PageSize {
  if (typeof format === 'string') return PAGE_FORMATS[format];
  return format;
}

export function toDimensions(opts: PaginationOptions): Dimensions {
  const size = resolvePageSize(opts.pageFormat);
  const { top, right, bottom, left } = opts.margins;
  return {
    pageWidth: size.width,
    pageHeight: size.height,
    mt: top,
    mr: right,
    mb: bottom,
    ml: left,
    gap: opts.pageGap,
    zoom: opts.zoom,
    contentHeight: Math.max(0, size.height - top - bottom),
  };
}

export function normalizeHeaderFooter(hf: HeaderFooter | undefined): HeaderFooterConfig | null {
  if (hf == null) return null;
  if (typeof hf === 'string') return hf.length ? { text: hf, align: 'center' } : null;
  return { text: hf.text, align: hf.align ?? 'center' };
}

/**
 * Resolve `{page}` / `{total}` tokens. If page numbers are enabled but the
 * template has no explicit token, append a compact "n / N".
 */
export function formatTemplate(
  template: string,
  page: number,
  total: number,
  showPageNumbers: boolean,
): string {
  const hasToken = /\{page\}|\{total\}/.test(template);
  let out = template.replace(/\{page\}/g, String(page)).replace(/\{total\}/g, String(total));
  if (showPageNumbers && !hasToken) {
    out = out ? `${out}  ·  ${page} / ${total}` : `${page} / ${total}`;
  }
  return out;
}
