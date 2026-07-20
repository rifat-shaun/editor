/**
 * ProseMirror JSON → docx-js elements. Modular: `MARK_RUN` maps marks onto run
 * options, `NODE_CONVERTERS` maps block node types to docx elements, and custom
 * nodes register a converter here. Everything flows from editor.getJSON() (never
 * the DOM) so custom-node attributes survive.
 */
import {
  AlignmentType,
  BorderStyle,
  DeletedTextRun,
  ExternalHyperlink,
  HeadingLevel,
  type ILevelsOptions,
  InsertedTextRun,
  PageBreak as DocxPageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from 'docx';
import { PRESETS, extendDefinition, type ListDefinition } from '../../extensions/listNumbering/model';
import {
  BULLET_PRESETS,
  extendBulletDefinition,
  type BulletDefinition,
} from '../../extensions/bulletList/model';
import { orderedLevels, bulletLevels } from './numbering';
import { lineHeightToSpacing, spacePtToTwips } from './lineSpacing';
import { fontSizeToHalfPoints, pxToTwip, toHex } from './units';
import { DEFAULT_FONT_THEME, resolveWordFont, type DocxFontTheme } from './fontTheme';

/* ------------------------------ JSON types ------------------------------ */

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

export interface NumberingInstance {
  reference: string;
  levels: ILevelsOptions[];
}

export interface ExportOptions {
  /** Author label for tracked-change (redline) revisions. */
  revisionAuthor?: string;
  /** Timestamp for revisions (Date). Injected for determinism in tests. */
  revisionDate?: Date;
  /** Font theme (single source of truth). Defaults to DEFAULT_FONT_THEME. */
  fontTheme?: DocxFontTheme;
}

export class ExportContext {
  listDefs: Record<string, ListDefinition>;
  bulletDefs: Record<string, BulletDefinition>;
  numbering: NumberingInstance[] = [];
  private refSeq = 0;
  private revSeq = 0;
  readonly author: string;
  readonly date: Date;
  readonly theme: DocxFontTheme;

  constructor(doc: PMNode, opts: ExportOptions = {}) {
    this.listDefs = (doc.attrs?.listDefs as Record<string, ListDefinition>) ?? {};
    this.bulletDefs = (doc.attrs?.bulletDefs as Record<string, BulletDefinition>) ?? {};
    this.author = opts.revisionAuthor ?? 'AI review';
    this.date = opts.revisionDate ?? new Date();
    this.theme = opts.fontTheme ?? DEFAULT_FONT_THEME;
  }

  nextRef(): string {
    return `num-${++this.refSeq}`;
  }
  nextRevisionId(): number {
    return ++this.revSeq;
  }
  /** True once any tracked-change (redline) run has been emitted. */
  get hasRevisions(): boolean {
    return this.revSeq > 0;
  }
}

/* -------------------------------- marks --------------------------------- */

interface RunOpts {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: Record<string, never>;
  font?: string;
  size?: number;
  color?: string;
}

/** Fold a text node's marks into run options (excluding link + redline). */
function runOptionsFromMarks(marks: PMMark[], theme: DocxFontTheme): RunOpts {
  const opts: RunOpts = {};
  for (const m of marks) {
    switch (m.type) {
      case 'bold': opts.bold = true; break;
      case 'italic': opts.italics = true; break;
      case 'strike': opts.strike = true; break;
      case 'underline': opts.underline = {}; break;
      case 'code': opts.font = theme.monoFont; break;
      case 'textStyle': {
        const size = fontSizeToHalfPoints(m.attrs?.fontSize as string | undefined);
        if (size) opts.size = size;
        const color = toHex(m.attrs?.color as string | undefined);
        if (color) opts.color = color;
        // No FontFamily mark in this schema today; resolve one if ever added.
        const family = resolveWordFont(m.attrs?.fontFamily as string | undefined, theme);
        if (family) opts.font = family;
        break;
      }
    }
  }
  return opts;
}

/** A text node → a docx run, honouring tracked-change (insertion/deletion) marks. */
function textToRun(node: PMNode, ctx: ExportContext): TextRun | InsertedTextRun | DeletedTextRun {
  const marks = node.marks ?? [];
  const base = { ...runOptionsFromMarks(marks, ctx.theme), text: node.text ?? '' };
  const has = (t: string) => marks.some((m) => m.type === t);
  const iso = ctx.date.toISOString();
  if (has('insertion')) {
    return new InsertedTextRun({ ...base, id: ctx.nextRevisionId(), author: ctx.author, date: iso });
  }
  if (has('deletion')) {
    return new DeletedTextRun({ ...base, id: ctx.nextRevisionId(), author: ctx.author, date: iso });
  }
  return new TextRun(base);
}

type InlineChild = TextRun | InsertedTextRun | DeletedTextRun | ExternalHyperlink;

/** Convert a block's inline content to runs, wrapping linked text in hyperlinks. */
function convertInline(content: PMNode[] | undefined, ctx: ExportContext): InlineChild[] {
  const out: InlineChild[] = [];
  for (const child of content ?? []) {
    if (child.type === 'text') {
      const run = textToRun(child, ctx);
      const link = child.marks?.find((m) => m.type === 'link');
      const href = link?.attrs?.href as string | undefined;
      out.push(href ? new ExternalHyperlink({ children: [run], link: href }) : run);
    } else if (child.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
    }
  }
  return out;
}

/* -------------------------------- helpers ------------------------------- */

function alignmentFor(attrs: Record<string, unknown> | undefined) {
  switch (attrs?.textAlign) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFIED;
    default: return undefined;
  }
}

/**
 * Word paragraph `spacing` for a block's line height + space-before/after
 * attrs, or undefined when none are set. Per-node before/after (twips) override
 * the style-level default; line height maps to line/lineRule.
 */
function spacingFor(attrs: Record<string, unknown> | undefined) {
  const line = lineHeightToSpacing(attrs?.lineHeight as string | undefined);
  const before = spacePtToTwips(attrs?.spaceBefore as string | undefined);
  const after = spacePtToTwips(attrs?.spaceAfter as string | undefined);
  if (!line && before == null && after == null) return undefined;
  return {
    ...(line ?? {}),
    ...(before != null ? { before } : {}),
    ...(after != null ? { after } : {}),
  };
}

/* -------------------------------- lists --------------------------------- */

function orderedDefFor(node: PMNode, ctx: ExportContext): ListDefinition {
  const id = node.attrs?.listDefId as string | undefined;
  return (id && ctx.listDefs[id]) || extendDefinition(PRESETS[0]!.levels);
}
function bulletDefFor(node: PMNode, ctx: ExportContext): BulletDefinition {
  const id = node.attrs?.bulletDefId as string | undefined;
  return (id && ctx.bulletDefs[id]) || extendBulletDefinition(BULLET_PRESETS[0]!.levels);
}

/**
 * Flatten a (possibly nested) list into Word-numbered paragraphs. A reference is
 * allocated for the top list; same-type descendants reuse it at deeper `level`;
 * a nested list of the OTHER type gets its own reference.
 */
function convertList(
  node: PMNode,
  ctx: ExportContext,
  depth: number,
  reference: string | null,
): Paragraph[] {
  const isOrdered = node.type === 'orderedList';
  let ref = reference;
  if (!ref) {
    ref = ctx.nextRef();
    const levels = isOrdered
      ? orderedLevels(orderedDefFor(node, ctx))
      : bulletLevels(bulletDefFor(node, ctx));
    // Honor an explicit `start` on the ordered list (the Restart-numbering /
    // continue commands set it) — override level-0's start so Word matches.
    const start = node.attrs?.start as number | undefined;
    if (isOrdered && typeof start === 'number' && start > 0 && levels[0]) {
      levels[0] = { ...levels[0], start };
    }
    ctx.numbering.push({ reference: ref, levels });
  }
  const out: Paragraph[] = [];
  for (const item of node.content ?? []) {
    convertListItem(item, ctx, depth, ref, node.type, out);
  }
  return out;
}

function convertListItem(
  item: PMNode,
  ctx: ExportContext,
  depth: number,
  ref: string,
  listType: string,
  out: Paragraph[],
): void {
  const checked = item.type === 'taskItem' ? Boolean(item.attrs?.checked) : null;
  let first = true;
  for (const block of item.content ?? []) {
    if (block.type === 'orderedList' || block.type === 'bulletList') {
      const sameType = block.type === listType;
      out.push(...convertList(block, ctx, depth + 1, sameType ? ref : null));
    } else if (block.type === 'paragraph' || block.type === 'heading') {
      const children = convertInline(block.content, ctx);
      if (checked !== null && first) {
        children.unshift(new TextRun({ text: checked ? '☑ ' : '☐ ' }));
      }
      out.push(
        new Paragraph({
          children,
          alignment: alignmentFor(block.attrs),
          spacing: spacingFor(block.attrs),
          // Task items aren't Word-numbered; ordinary list items number their
          // FIRST paragraph only (extra paragraphs are indented continuations).
          numbering: checked === null && first ? { reference: ref, level: depth } : undefined,
          indent: (checked !== null || !first) ? { left: 720 * (depth + 1) } : undefined,
        }),
      );
      first = false;
    } else {
      for (const el of convertBlock(block, ctx)) if (el instanceof Paragraph) out.push(el);
    }
  }
}

/* -------------------------------- tables -------------------------------- */

interface Carry {
  colspan: number;
  remaining: number;
}

function convertTable(node: PMNode, ctx: ExportContext): Table {
  const rows = (node.content ?? []).filter((r) => r.type === 'tableRow');
  // Grid width + per-column px widths from the first row's cells.
  const first = rows[0]?.content ?? [];
  const colWidthsPx: number[] = [];
  let gridWidth = 0;
  for (const cell of first) {
    const span = (cell.attrs?.colspan as number) || 1;
    const cw = (cell.attrs?.colwidth as (number | null)[] | null) ?? [];
    for (let i = 0; i < span; i++) colWidthsPx.push(cw[i] ?? 0);
    gridWidth += span;
  }
  const columnWidths = colWidthsPx.map((px) => (px > 0 ? pxToTwip(px) : Math.round(9360 / gridWidth)));

  const carry = new Map<number, Carry>(); // colIndex → ongoing rowspan
  const docxRows: TableRow[] = [];

  for (const row of rows) {
    const cells: TableCell[] = [];
    const queue = [...(row.content ?? [])];
    let col = 0;
    let allHeader = queue.length > 0;
    while (col < gridWidth) {
      const carried = carry.get(col);
      if (carried && carried.remaining > 0) {
        cells.push(
          new TableCell({
            children: [new Paragraph({})],
            columnSpan: carried.colspan,
            verticalMerge: VerticalMergeType.CONTINUE,
          }),
        );
        carried.remaining -= 1;
        if (carried.remaining === 0) carry.delete(col);
        col += carried.colspan;
        continue;
      }
      const cell = queue.shift();
      if (!cell) break;
      if (cell.type !== 'tableHeader') allHeader = false;
      const colspan = (cell.attrs?.colspan as number) || 1;
      const rowspan = (cell.attrs?.rowspan as number) || 1;
      const bg = toHex(cell.attrs?.backgroundColor as string | undefined);
      const vAlign = cell.attrs?.verticalAlign as string | undefined;
      cells.push(
        new TableCell({
          children: convertCellContent(cell, ctx),
          columnSpan: colspan,
          verticalMerge: rowspan > 1 ? VerticalMergeType.RESTART : undefined,
          shading: bg ? { type: ShadingType.CLEAR, color: 'auto', fill: bg } : undefined,
          verticalAlign:
            vAlign === 'middle' ? VerticalAlign.CENTER : vAlign === 'bottom' ? VerticalAlign.BOTTOM : undefined,
        }),
      );
      if (rowspan > 1) carry.set(col, { colspan, remaining: rowspan - 1 });
      col += colspan;
    }
    docxRows.push(new TableRow({ children: cells, tableHeader: allHeader || undefined }));
  }

  return new Table({
    rows: docxRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
  });
}

function convertCellContent(cell: PMNode, ctx: ExportContext): Paragraph[] {
  const out: Paragraph[] = [];
  for (const block of cell.content ?? []) {
    for (const el of convertBlock(block, ctx)) if (el instanceof Paragraph) out.push(el);
  }
  return out.length ? out : [new Paragraph({})];
}

/* ------------------------------ block nodes ----------------------------- */

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

export type BlockElement = Paragraph | Table;
export type NodeConverter = (node: PMNode, ctx: ExportContext) => BlockElement[];

export const NODE_CONVERTERS: Record<string, NodeConverter> = {
  paragraph: (n, ctx) => [
    new Paragraph({ children: convertInline(n.content, ctx), alignment: alignmentFor(n.attrs), spacing: spacingFor(n.attrs) }),
  ],
  heading: (n, ctx) => {
    const level = Math.min(Math.max((n.attrs?.level as number) || 1, 1), 6);
    // The editor centers h1 via CSS (not a textAlign attr), so default h1 to
    // center in the export unless the node carries an EXPLICIT alignment.
    const explicit = n.attrs?.textAlign as string | undefined;
    const alignment = explicit
      ? alignmentFor(n.attrs)
      : level === 1
        ? AlignmentType.CENTER
        : undefined;
    return [
      new Paragraph({
        heading: HEADING_LEVELS[level - 1],
        children: convertInline(n.content, ctx),
        alignment,
        spacing: spacingFor(n.attrs),
      }),
    ];
  },
  blockquote: (n, ctx) =>
    (n.content ?? []).flatMap((child) =>
      child.type === 'paragraph'
        ? [
            new Paragraph({
              children: convertInline(child.content, ctx),
              style: 'Quote',
              indent: { left: 720 },
              border: { left: { style: BorderStyle.SINGLE, size: 18, space: 12, color: 'A5E8F2' } },
              spacing: spacingFor(child.attrs),
            }),
          ]
        : NODE_CONVERTERS[child.type]?.(child, ctx) ?? [],
    ),
  codeBlock: (n, ctx) => {
    const text = (n.content ?? []).map((t) => t.text ?? '').join('');
    const lines = text.split('\n');
    return [
      new Paragraph({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F4F5' },
        children: lines.flatMap((line, i) => [
          ...(i > 0 ? [new TextRun({ break: 1 })] : []),
          new TextRun({ text: line, font: ctx.theme.monoFont, size: 20 }),
        ]),
      }),
    ];
  },
  horizontalRule: () => [
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: 'CFD6DB' } } }),
  ],
  orderedList: (n, ctx) => convertList(n, ctx, 0, null),
  bulletList: (n, ctx) => convertList(n, ctx, 0, null),
  taskList: (n, ctx) => {
    const out: Paragraph[] = [];
    for (const item of n.content ?? []) convertListItem(item, ctx, 0, '', 'taskList', out);
    return out;
  },
  table: (n, ctx) => [convertTable(n, ctx)],
  pageBreak: () => [new Paragraph({ children: [new DocxPageBreak()] })],
};

/** Convert one block node → docx elements (via the registry; unknown → []). */
export function convertBlock(node: PMNode, ctx: ExportContext): BlockElement[] {
  const conv = NODE_CONVERTERS[node.type];
  if (!conv) return [];
  return conv(node, ctx);
}

/** Convert a whole document body → block elements. */
export function convertBody(doc: PMNode, ctx: ExportContext): BlockElement[] {
  return (doc.content ?? []).flatMap((node) => convertBlock(node, ctx));
}
