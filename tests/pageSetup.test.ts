import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import {
  DEFAULT_PAGE_SETUP,
  MARGIN_PRESETS,
  pagePx,
  marginsPx,
  matchMarginPreset,
  maxMargin,
  captionLines,
  resolveGeometry,
  type PageSetup,
} from '../src/menus/pageSetup';

describe('pageSetup geometry', () => {
  it('resolves paper size in px and swaps for landscape', () => {
    const portrait: PageSetup = { ...DEFAULT_PAGE_SETUP };
    expect(pagePx(portrait)).toEqual({ width: 816, height: 1056 }); // Letter
    expect(pagePx({ ...portrait, orientation: 'landscape' })).toEqual({ width: 1056, height: 816 });
  });

  it('converts margins (inches) to px', () => {
    expect(marginsPx(DEFAULT_PAGE_SETUP)).toEqual({ top: 96, right: 96, bottom: 96, left: 96 });
    expect(marginsPx({ ...DEFAULT_PAGE_SETUP, margins: MARGIN_PRESETS.moderate })).toEqual({ top: 96, right: 72, bottom: 96, left: 72 });
  });

  it('matches margin presets and returns null for custom', () => {
    expect(matchMarginPreset(MARGIN_PRESETS.narrow)).toBe('narrow');
    expect(matchMarginPreset(MARGIN_PRESETS.wide)).toBe('wide');
    expect(matchMarginPreset({ top: 1, right: 0.3, bottom: 1, left: 1 })).toBeNull();
  });

  it('max margin = half the relevant page dimension (inches)', () => {
    // Letter portrait: height 11" → top/bottom max 5.5; width 8.5" → left/right max 4.25→4.3 rounded
    expect(maxMargin(DEFAULT_PAGE_SETUP, 'top')).toBe(5.5);
    expect(maxMargin(DEFAULT_PAGE_SETUP, 'left')).toBeCloseTo(4.3, 1);
  });

  it('caption lines: paper · orientation / margins summary', () => {
    expect(captionLines(DEFAULT_PAGE_SETUP)).toEqual(['Letter · Portrait', '1.0" margins']);
    expect(captionLines({ ...DEFAULT_PAGE_SETUP, margins: MARGIN_PRESETS.moderate })[1]).toBe('Custom margins');
    expect(captionLines({ ...DEFAULT_PAGE_SETUP, orientation: 'landscape', paperSize: 'a4' })[0]).toBe('A4 · Landscape');
  });

  it('resolveGeometry bundles format + margins for the engine', () => {
    expect(resolveGeometry(DEFAULT_PAGE_SETUP)).toEqual({
      pageFormat: { width: 816, height: 1056 },
      margins: { top: 96, right: 96, bottom: 96, left: 96 },
    });
  });
});

describe('setPageSetup command (undoable doc attr)', () => {
  const setup: PageSetup = {
    orientation: 'landscape',
    paperSize: 'a4',
    margins: MARGIN_PRESETS.narrow,
    marginPreset: 'narrow',
  };

  it('writes the pageSetup doc attribute and round-trips via JSON', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setPageSetup(setup);
    expect(editor.state.doc.attrs.pageSetup).toEqual(setup);
    // Persists in serialized JSON.
    expect((editor.getJSON() as { attrs?: { pageSetup?: unknown } }).attrs?.pageSetup).toEqual(setup);
    editor.destroy();
  });

  it('is a single undoable step', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setPageSetup(setup);
    expect(editor.state.doc.attrs.pageSetup).toEqual(setup);
    editor.commands.undo();
    expect(editor.state.doc.attrs.pageSetup).toBeNull();
    editor.commands.redo();
    expect(editor.state.doc.attrs.pageSetup).toEqual(setup);
    editor.destroy();
  });
});
