/**
 * Unified serialization. ProseMirror JSON is the single source of truth
 * (lossless); HTML is the interchange view (near-lossless); Markdown is the
 * lightweight, lossy view. See README.md for the fidelity matrix.
 *
 * Directions: JSON serializes AND deserializes (canonical save/load, with a
 * version tag + migration + unknown-node repair). HTML and Markdown are
 * EXPORT-ONLY here (HTML can still be pasted into the editor natively).
 */
import type { Editor } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { serializeHTML, type HtmlOptions } from './html';
import { buildMarkdownSerializer, type MarkdownOptions } from './markdown';

export type Format = 'json' | 'html' | 'markdown';
export type SerializeOptions = HtmlOptions & MarkdownOptions;

/** Bump when the schema changes in a way older saved JSON must migrate across. */
export const SCHEMA_VERSION = 1;
const DOC_TYPE = 'acme-docs-editor';

interface JsonEnvelope {
  type: typeof DOC_TYPE;
  version: number;
  doc: unknown;
}

/** version N → N+1 transforms. Empty today; add as the schema evolves. */
const MIGRATIONS: Record<number, (doc: PMJson) => PMJson> = {};

type PMJson = { type: string; attrs?: Record<string, unknown>; content?: PMJson[]; marks?: { type: string }[]; text?: string };

/* ------------------------------ serialize ------------------------------ */

export function serialize(editor: Editor, format: Format, options: SerializeOptions = {}): string {
  switch (format) {
    case 'json':
      return JSON.stringify({ type: DOC_TYPE, version: SCHEMA_VERSION, doc: editor.getJSON() } satisfies JsonEnvelope, null, 2);
    case 'html':
      return serializeHTML(editor, options);
    case 'markdown':
      return buildMarkdownSerializer(editor.schema, options).serialize(editor.state.doc);
    default:
      throw new Error(`Unknown format: ${format as string}`);
  }
}

/* ----------------------------- deserialize ----------------------------- */

export function deserialize(editor: Editor, format: Format, content: string | object): void {
  if (format !== 'json') {
    throw new Error(
      `${format} import is not supported (export-only). JSON is the canonical load format; HTML can be pasted into the editor.`,
    );
  }
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  let doc: PMJson;
  let version = SCHEMA_VERSION;

  if (parsed && typeof parsed === 'object' && (parsed as JsonEnvelope).type === DOC_TYPE) {
    const env = parsed as JsonEnvelope;
    version = typeof env.version === 'number' ? env.version : 1;
    doc = env.doc as PMJson;
  } else {
    // Legacy: a bare ProseMirror doc (no envelope) → treat as version 1.
    doc = parsed as PMJson;
    version = 1;
  }

  doc = migrate(doc, version);
  doc = repair(doc, editor.schema);
  editor.commands.setContent(doc, true);
  // setContent replaces the doc's CONTENT but not the doc node's own attrs
  // (listDefs / bulletDefs / pageSetup). Apply them explicitly.
  const attrs = doc.attrs;
  if (attrs && Object.keys(attrs).length) {
    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch) for (const [k, v] of Object.entries(attrs)) tr.setDocAttribute(k, v);
      return true;
    });
  }
}

function migrate(doc: PMJson, fromVersion: number): PMJson {
  let v = fromVersion;
  let out = doc;
  while (v < SCHEMA_VERSION) {
    out = MIGRATIONS[v]?.(out) ?? out;
    v++;
  }
  return out;
}

/**
 * Repair unknown/foreign JSON against the live schema rather than throwing:
 * drop marks the schema doesn't know, keep only attrs the node spec declares,
 * and unwrap unknown node types (splice their children into the parent).
 */
function repair(doc: PMJson, schema: Schema): PMJson {
  const root = repairNode(doc, schema);
  // The top node must be the doc type; if repair unwrapped it, rewrap.
  return root && root.type === 'doc' ? root : { type: 'doc', content: root ? [root] : [] };
}

function repairChildren(children: PMJson[] | undefined, schema: Schema): PMJson[] {
  const out: PMJson[] = [];
  for (const child of children ?? []) {
    if (schema.nodes[child.type]) {
      const r = repairNode(child, schema);
      if (r) out.push(r);
    } else {
      // Unknown node → unwrap its (repaired) children into this level.
      out.push(...repairChildren(child.content, schema));
    }
  }
  return out;
}

function repairNode(node: PMJson, schema: Schema): PMJson | null {
  const spec = schema.nodes[node.type];
  if (!spec) return null;
  const out: PMJson = { type: node.type };
  if (node.text != null) out.text = node.text;

  if (node.attrs) {
    const allowed = spec.spec.attrs ?? {};
    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.attrs)) if (k in allowed) attrs[k] = v;
    if (Object.keys(attrs).length) out.attrs = attrs;
  }
  if (node.marks) {
    const marks = node.marks.filter((m) => schema.marks[m.type]);
    if (marks.length) out.marks = marks;
  }
  const content = repairChildren(node.content, schema);
  if (content.length) out.content = content;
  return out;
}

/* ------------------------------ download ------------------------------- */

const FILE_META: Record<Format, { mime: string; ext: string }> = {
  json: { mime: 'application/json', ext: 'json' },
  html: { mime: 'text/html', ext: 'html' },
  markdown: { mime: 'text/markdown', ext: 'md' },
};

function sanitizeFilename(name: string): string {
  return (name.trim() || 'document').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 120);
}

/** Blob + <a download>. */
export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Serialize + download with a title-based filename and correct MIME/extension. */
export function downloadAs(editor: Editor, format: Format, title: string, options: SerializeOptions = {}): void {
  const content = serialize(editor, format, options);
  const { mime, ext } = FILE_META[format];
  downloadFile(`${sanitizeFilename(title)}.${ext}`, mime, content);
}

export { serializeHTML } from './html';
export { buildMarkdownSerializer } from './markdown';
