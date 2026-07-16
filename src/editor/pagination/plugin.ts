/**
 * The ProseMirror plugin: owns pagination state, and a plugin-view that owns
 * all recompute triggers (doc change, resize, font load, media load, manual
 * command) with a debounced/rAF-batched pipeline.
 */
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { DecorationSet } from '@tiptap/pm/view';
import { paginationKey, type PaginationPluginState, type RecomputeMeta } from './paginationKey';
import { measureBlocks, findUnsettledMedia } from './measure';
import { computeBreaks } from './computeBreaks';
import { buildDecorations } from './decorations';
import { toDimensions, normalizeHeaderFooter, type Dimensions, type PaginationOptions } from './config';
// NOTE: page-frame CSS lives in the editor's shared styles.css (`.pgn-*`
// classes), so there is no runtime style injection here.

export interface PaginationStorage {
  /** Set by the plugin view; commands call it to force a recompute. */
  recompute: ((immediate?: boolean) => void) | null;
  /** Last computed page count (read-only for consumers). */
  pageCount: number;
}

/** Push page geometry into CSS custom properties. Runs BEFORE measuring. */
function applyDomStyles(view: EditorView, dims: Dimensions): void {
  const dom = view.dom as HTMLElement;
  dom.classList.add('pgn-paginated');
  const s = dom.style;
  s.setProperty('--pgn-page-width', `${dims.pageWidth}px`);
  s.setProperty('--pgn-mt', `${dims.mt}px`);
  s.setProperty('--pgn-mr', `${dims.mr}px`);
  s.setProperty('--pgn-mb', `${dims.mb}px`);
  s.setProperty('--pgn-ml', `${dims.ml}px`);
  s.setProperty('--pgn-gap', `${dims.gap}px`);
  s.setProperty('--pgn-zoom', String(dims.zoom));
}

/**
 * A CSS `transform: scale()` does not reflow, so the scrollable parent won't
 * reserve the scaled height. Reserve it explicitly (only when zoomed).
 * Documented limitation: relies on the editor sitting in a block parent.
 */
function reserveZoomSpace(view: EditorView, dims: Dimensions): void {
  const parent = view.dom.parentElement;
  if (!parent) return;
  if (dims.zoom === 1) {
    parent.style.height = '';
    return;
  }
  parent.style.height = `${view.dom.offsetHeight * dims.zoom}px`;
}

class PaginationView {
  private destroyed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private rafId = 0;
  private ro: ResizeObserver | undefined;
  private lastWidth = -1;
  private mediaSeen = new WeakSet<HTMLElement>();

  constructor(
    private view: EditorView,
    private getOptions: () => PaginationOptions,
    private storage: PaginationStorage,
  ) {
    storage.recompute = (immediate?: boolean) => this.schedule(!!immediate);

    if (typeof window !== 'undefined') {
      this.setupResizeObserver();
      this.waitForFonts();
    }
    // Initial pass (also re-runs once fonts settle — see waitForFonts).
    this.schedule(true);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const target = this.view.dom.parentElement ?? this.view.dom;
    this.ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      // React only to WIDTH changes (width → line wrapping → height). Ignoring
      // height avoids a feedback loop: our own decorations change height.
      if (w !== this.lastWidth) {
        this.lastWidth = w;
        this.schedule(false);
      }
    });
    this.ro.observe(target);
  }

  private waitForFonts(): void {
    // Heights measured before web fonts load are wrong. Recompute once ready.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts && 'ready' in fonts) {
      fonts.ready.then(() => !this.destroyed && this.schedule(true)).catch(() => {});
    }
  }

  private attachMediaHandlers(): void {
    // Media without intrinsic size changes height when it loads → recompute.
    for (const el of findUnsettledMedia(this.view)) {
      if (this.mediaSeen.has(el)) continue;
      this.mediaSeen.add(el);
      const handler = () => !this.destroyed && this.schedule(false);
      el.addEventListener('load', handler, { once: true });
      el.addEventListener('loadedmetadata', handler, { once: true });
      el.addEventListener('error', handler, { once: true });
    }
  }

  /** Debounced (trailing) unless `immediate`; always batched into a rAF. */
  private schedule(immediate: boolean): void {
    if (this.destroyed) return;
    clearTimeout(this.debounceTimer);
    const kick = () => {
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => this.run());
    };
    if (immediate) kick();
    else this.debounceTimer = setTimeout(kick, this.getOptions().debounceMs);
  }

  private run(): void {
    if (this.destroyed) return;
    const view = this.view;
    const opts = this.getOptions();
    const dims = toDimensions(opts);

    applyDomStyles(view, dims); // must precede measurement
    this.attachMediaHandlers();

    const blocks = measureBlocks(view);
    const { breaks, pageCount, lastPageFiller } = computeBreaks(blocks, dims.contentHeight);
    this.storage.pageCount = pageCount;

    const decorations = buildDecorations(view.state.doc, breaks, {
      dims,
      header: normalizeHeaderFooter(opts.header),
      footer: normalizeHeaderFooter(opts.footer),
      showPageNumbers: opts.showPageNumbers,
      pageCount,
      lastPageFiller,
    });

    // Commit as a meta transaction: the document is NOT touched, so this never
    // enters undo history or Yjs. `addToHistory:false` is a belt-and-braces
    // guard in case a downstream plugin inspects it.
    const meta: RecomputeMeta = { type: 'recompute', breaks: breaks.map((b) => b.pos), decorations };
    const tr = view.state.tr.setMeta(paginationKey, meta);
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);

    reserveZoomSpace(view, dims);
  }

  update(_view: EditorView, prevState: EditorView['state']): void {
    // Only doc changes trigger a (debounced) recompute here. Our own recompute
    // transaction leaves the doc unchanged, so it does not re-trigger.
    if (prevState.doc !== this.view.state.doc) this.schedule(false);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.debounceTimer);
    cancelAnimationFrame(this.rafId);
    this.ro?.disconnect();
    this.storage.recompute = null;
  }
}

export function createPaginationPlugin(
  getOptions: () => PaginationOptions,
  storage: PaginationStorage,
): Plugin<PaginationPluginState> {
  return new Plugin<PaginationPluginState>({
    key: paginationKey,
    state: {
      init: () => ({ breaks: [], decorations: DecorationSet.empty }),
      apply(tr, value) {
        const meta = tr.getMeta(paginationKey) as RecomputeMeta | undefined;
        if (meta?.type === 'recompute') {
          return { breaks: meta.breaks, decorations: meta.decorations };
        }
        if (tr.docChanged) {
          // Never reuse stale positions verbatim: map both the decoration set
          // and the break positions through the change so they stay attached
          // until the debounced recompute rebuilds an exact set.
          return {
            breaks: value.breaks.map((p) => tr.mapping.map(p)),
            decorations: value.decorations.map(tr.mapping, tr.doc),
          };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        return paginationKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(view) {
      return new PaginationView(view, getOptions, storage);
    },
  });
}
