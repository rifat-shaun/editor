/**
 * Assemble the docx-js Document: fonts + spacing from the font theme (single
 * source of truth), the real page size/margins from the pagination engine,
 * optional running header (title) + footer (page-number field), the numbering
 * config gathered during conversion, and the converted body.
 */
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  LineRuleType,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';
import { ExportContext, convertBody, type ExportOptions, type PMNode } from './convert';
import { DEFAULT_FONT_THEME, bodySizeHalfPoints } from './fontTheme';
import { fontSizeToHalfPoints, pxToTwip } from './units';

export interface PageSetup {
  widthTwip: number;
  heightTwip: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface BuildOptions extends ExportOptions {
  title?: string;
  includeHeaderFooter?: boolean;
  /** Real page geometry from the pagination engine (twips). Defaults to Letter. */
  page?: PageSetup;
  /** A resolved Word font name to use for body (e.g. the editor's font choice). */
  bodyFontOverride?: string;
}

// US Letter, 1" margins — the fallback when no pagination settings are supplied.
const DEFAULT_PAGE: PageSetup = {
  widthTwip: 12240,
  heightTwip: 15840,
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
};

export function buildDocument(doc: PMNode, opts: BuildOptions = {}): Document {
  const theme = opts.fontTheme ?? DEFAULT_FONT_THEME;
  const bodyFont = opts.bodyFontOverride || theme.bodyFont;
  const ctx = new ExportContext(doc, opts);
  const body = convertBody(doc, ctx);
  if (body.length === 0) body.push(new Paragraph({}));

  const title = opts.title ?? 'Document';
  const wantHF = opts.includeHeaderFooter !== false;
  const page = opts.page ?? DEFAULT_PAGE;
  const hfColor = '8A939B';

  const header = wantHF
    ? new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: title, size: 18, color: hfColor, font: bodyFont })],
          }),
        ],
      })
    : undefined;

  const footer = wantHF
    ? new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: hfColor, font: bodyFont }),
              new TextRun({ text: ' / ', size: 18, color: hfColor, font: bodyFont }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: hfColor, font: bodyFont }),
            ],
          }),
        ],
      })
    : undefined;

  return new Document({
    creator: 'Docs Editor',
    title,
    features: { updateFields: wantHF, trackRevisions: ctx.hasRevisions },
    styles: {
      default: {
        document: {
          run: { font: bodyFont, size: bodySizeHalfPoints(theme), color: theme.textColor },
          paragraph: {
            spacing: {
              after: pxToTwip(theme.paraAfterPx),
              line: Math.round(theme.lineHeight * 240),
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Quote',
          name: 'Quote',
          basedOn: 'Normal',
          quickFormat: true,
          run: { italics: true, color: '3D4852', font: bodyFont },
          paragraph: { spacing: { after: pxToTwip(theme.paraAfterPx) } },
        },
        ...([1, 2, 3, 4, 5, 6] as const).map((lvl) => {
          const h = theme.headings[lvl];
          return {
            id: `Heading${lvl}`,
            name: `Heading ${lvl}`,
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: {
              font: theme.headingFont,
              size: fontSizeToHalfPoints(h.sizePt) ?? undefined,
              bold: h.bold,
              color: theme.textColor,
            },
            paragraph: { spacing: { before: 240, after: 120 } },
          };
        }),
      ],
    },
    numbering: { config: ctx.numbering.map((n) => ({ reference: n.reference, levels: n.levels })) },
    sections: [
      {
        properties: {
          page: {
            size: { width: page.widthTwip, height: page.heightTwip },
            margin: page.margin,
          },
        },
        headers: header ? { default: header } : undefined,
        footers: footer ? { default: footer } : undefined,
        children: body,
      },
    ],
  });
}
