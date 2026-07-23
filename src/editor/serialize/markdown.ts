/**
 * Markdown serialization (lightweight, inherently LOSSY). Built on
 * prosemirror-markdown's `MarkdownSerializer` (already present via
 * `@tiptap/pm/markdown`) with explicit rules for our custom nodes/marks.
 *
 * Flavor: GFM (task lists, strikethrough, pipe tables).
 *
 * Loss policy (see the fidelity matrix in README): unrepresentable content is
 * dropped/flattened in PURE mode, or preserved as inline raw HTML when
 * `htmlFallback` is on. Documented per node/mark below.
 */
import { MarkdownSerializer, type MarkdownSerializerState } from '@tiptap/pm/markdown';
import { DOMSerializer, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { variableBakedText, type VariableValues } from '../extensions/variable';

export interface MarkdownOptions {
  /** Embed raw HTML for content Markdown can't represent (merged tables, page
   *  breaks, colors…). Off → those are flattened/dropped. */
  htmlFallback?: boolean;
  /** Variable values, so tokens bake to their resolved value on export. */
  variableValues?: Record<string, string | null>;
  /** Unset variables → `{{name}}` placeholder (default) or omitted (false). */
  includeUnsetVariables?: boolean;
}

/** Render one node's subtree to an HTML string (for the raw-HTML fallback). */
function nodeToHTML(node: PMNode, schema: Schema): string {
  const dom = DOMSerializer.fromSchema(schema).serializeNode(node);
  const wrap = document.createElement('div');
  wrap.appendChild(dom);
  return wrap.innerHTML;
}

function hasMergedCells(table: PMNode): boolean {
  let merged = false;
  table.descendants((n) => {
    if ((n.attrs.colspan ?? 1) > 1 || (n.attrs.rowspan ?? 1) > 1) merged = true;
    return !merged;
  });
  return merged;
}

/** GFM pipe table (ignores merges/widths/colors — documented loss). */
function writeGfmTable(state: MarkdownSerializerState, table: PMNode) {
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(cell.textContent.replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()));
    rows.push(cells);
  });
  if (rows.length === 0) {
    state.closeBlock(table);
    return;
  }
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const c = [...r];
    while (c.length < cols) c.push('');
    return c;
  };
  state.write('| ' + pad(rows[0]!).join(' | ') + ' |');
  state.ensureNewLine();
  state.write('| ' + pad(rows[0]!).map(() => '---').join(' | ') + ' |');
  state.ensureNewLine();
  for (let i = 1; i < rows.length; i++) {
    state.write('| ' + pad(rows[i]!).join(' | ') + ' |');
    state.ensureNewLine();
  }
  state.closeBlock(table);
}

type Nodes = ConstructorParameters<typeof MarkdownSerializer>[0];
type Marks = ConstructorParameters<typeof MarkdownSerializer>[1];

export function buildMarkdownSerializer(schema: Schema, opts: MarkdownOptions): MarkdownSerializer {
  const html = !!opts.htmlFallback;

  const nodes: Nodes = {
    doc(state, node) {
      state.renderContent(node);
    },
    text(state, node) {
      state.text(node.text ?? '');
    },
    // Variables bake to their resolved value (or the {{name}} placeholder when
    // unset, unless unset variables are omitted).
    variable(state, node) {
      const text = variableBakedText((opts.variableValues ?? {}) as VariableValues, (node.attrs.name as string) ?? '', {
        includeUnset: opts.includeUnsetVariables ?? true,
      });
      if (text) state.text(text, false);
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write('#'.repeat((node.attrs.level as number) || 1) + ' ');
      state.renderInline(node);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    codeBlock(state, node) {
      state.write('```' + ((node.attrs.language as string) || '') + '\n');
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write('---');
      state.closeBlock(node);
    },
    // Composite 1.a.i numbering, per-level styles, custom bullets, restart →
    // all LOST; Markdown offers only `1.` / `-`.
    bulletList(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    orderedList(state, node) {
      const start = (node.attrs.start as number) || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = ' '.repeat(maxW + 2);
      state.renderList(node, space, (i) => {
        const n = String(start + i);
        return ' '.repeat(maxW - n.length) + n + '. ';
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    // Forced page break: no Markdown representation.
    pageBreak(state, node) {
      if (html) state.write('<div style="page-break-after:always"></div>');
      state.closeBlock(node);
    },
    // Merges/widths/cell colors can't survive GFM. Merged → raw HTML (fallback)
    // or flattened GFM (pure). Simple tables → GFM.
    table(state, node) {
      if (html && hasMergedCells(node)) {
        state.write(nodeToHTML(node, schema));
        state.closeBlock(node);
      } else {
        writeGfmTable(state, node);
      }
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n');
          return;
        }
      }
    },
    image(state, node) {
      state.write(
        `![${state.esc((node.attrs.alt as string) || '')}](${(node.attrs.src as string) || ''}${
          node.attrs.title ? ` "${(node.attrs.title as string).replace(/"/g, '\\"')}"` : ''
        })`,
      );
    },
  };

  // Marks with no Markdown equivalent: underline, font size/color (textStyle)
  // → raw HTML tags when htmlFallback, else dropped (content kept).
  const wrapMark = (tag: string, attrsToStyle?: (m: Record<string, unknown>) => string) =>
    html
      ? {
          open: (_s: MarkdownSerializerState, mark: { attrs: Record<string, unknown> }) => {
            const style = attrsToStyle?.(mark.attrs);
            return `<${tag}${style ? ` style="${style}"` : ''}>`;
          },
          close: `</${tag}>`,
          mixable: true,
          expelEnclosingWhitespace: true,
        }
      : { open: '', close: '', mixable: true, expelEnclosingWhitespace: true };

  const marks: Marks = {
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    italic: { open: '_', close: '_', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    code: {
      open(_state, _mark, parent, index) {
        return backticksFor(parent.child(index), -1);
      },
      close(_state, _mark, parent, index) {
        return backticksFor(parent.child(index - 1), 1);
      },
      escape: false,
    },
    link: {
      open() {
        return '[';
      },
      close(_state, mark) {
        const href = (mark.attrs.href as string) || '';
        return `](${href})`;
      },
    },
    underline: wrapMark('u'),
    textStyle: html
      ? {
          open: (_s, mark: { attrs: Record<string, unknown> }) => {
            const size = mark.attrs.fontSize as string | undefined;
            return size ? `<span style="font-size:${size}">` : '';
          },
          close: (_s, mark: { attrs: Record<string, unknown> }) => (mark.attrs.fontSize ? '</span>' : ''),
          mixable: true,
          expelEnclosingWhitespace: true,
        }
      : { open: '', close: '', mixable: true, expelEnclosingWhitespace: true },
  };

  return new MarkdownSerializer(nodes, marks);
}

// Mirrors prosemirror-markdown's inline-code backtick fencing.
function backticksFor(node: PMNode, side: number): string {
  const ticks = /`+/g;
  let m: RegExpExecArray | null;
  let len = 0;
  if (node.isText) while ((m = ticks.exec(node.text || ''))) len = Math.max(len, m[0].length);
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}
