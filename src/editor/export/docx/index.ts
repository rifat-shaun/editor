/**
 * DOCX export entry points.
 *
 *  - exportDocxBlob(json, opts)  → Blob (browser; via Packer.toBlob)
 *  - exportDocxBuffer(json, opts)→ Buffer (server/tests; via Packer.toBuffer)
 *  - downloadDocx(editor, name)  → builds + triggers a browser download
 *
 * Everything is driven by ProseMirror JSON (editor.getJSON()), never the DOM.
 * Any async work (e.g. remote images, once an image node exists) must resolve
 * before Packer runs — the converters are sync today, so this is a single await.
 */
import { Packer } from 'docx';
import type { Editor } from '@tiptap/core';
import { buildDocument, type BuildOptions, type PageSetup } from './documentBuild';
import type { PMNode } from './convert';
import { resolveWordFont } from './fontTheme';
import { pxToTwip } from './units';
import { resolvePageSize, type Margins, type PaginationOptions } from '../../pagination/config';

export type { BuildOptions } from './documentBuild';
export { buildDocument } from './documentBuild';

/** Read the live page geometry + font choice the exporter can't see in JSON. */
export function readEditorExportSettings(editor: Editor): {
  page?: PageSetup;
  bodyFontOverride?: string;
  variableValues?: Record<string, string | null>;
} {
  const out: { page?: PageSetup; bodyFontOverride?: string; variableValues?: Record<string, string | null> } = {};

  // Variable values live on editor storage (mirrored from the consumer prop) so
  // export can bake resolved values — they aren't in the document JSON.
  out.variableValues = (editor.storage.variable as { values?: Record<string, string | null> } | undefined)?.values;

  // Page size + margins from the pagination engine's (mutable) options.
  const pag = editor.extensionManager.extensions.find((e) => e.name === 'pagination');
  const opts = pag?.options as PaginationOptions | undefined;
  if (opts?.pageFormat && opts?.margins) {
    const size = resolvePageSize(opts.pageFormat);
    const m = opts.margins as Margins;
    out.page = {
      widthTwip: pxToTwip(size.width),
      heightTwip: pxToTwip(size.height),
      margin: {
        top: pxToTwip(m.top),
        right: pxToTwip(m.right),
        bottom: pxToTwip(m.bottom),
        left: pxToTwip(m.left),
      },
    };
  }

  // The Font <select> sets the whole-editor font via a DOM style (not in JSON).
  const domFont = (editor.view.dom as HTMLElement).style.fontFamily;
  const resolved = resolveWordFont(domFont);
  if (resolved) out.bodyFontOverride = resolved;

  return out;
}

export async function exportDocxBlob(doc: PMNode, opts: BuildOptions = {}): Promise<Blob> {
  return Packer.toBlob(buildDocument(doc, opts));
}

export async function exportDocxBuffer(doc: PMNode, opts: BuildOptions = {}): Promise<Buffer> {
  return Packer.toBuffer(buildDocument(doc, opts));
}

function sanitizeFilename(name: string): string {
  const base = (name || 'document').replace(/[\\/:*?"<>|]+/g, '').trim() || 'document';
  return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`;
}

/** Build the .docx from the editor's current content and trigger a download. */
export async function downloadDocx(
  editor: Editor,
  filename: string,
  opts: BuildOptions = {},
): Promise<void> {
  const json = editor.getJSON() as unknown as PMNode;
  const settings = readEditorExportSettings(editor);
  const blob = await exportDocxBlob(json, { title: filename, ...settings, ...opts });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke on the next tick so the click has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
