/**
 * The typed menu declarations. Pure data — see `types.ts`. Each item's `id`
 * resolves in the command registry (`registry.ts`); unbuilt features are left
 * without a `run` there and render disabled.
 *
 * File-first: only File is declared for sign-off. The other six menus + Help
 * search will be added in the next pass.
 */
import type { MenuSpec } from './types';

const FILE: MenuSpec = {
  id: 'file',
  label: 'File',
  items: [
    { id: 'file.new', label: 'New document', shortcut: 'Mod-N' },
    {
      id: 'file.newFromTemplate',
      label: 'New from template',
      submenu: [
        { id: 'template.blank', label: 'Blank' },
        { id: 'template.letter', label: 'Letter' },
        { id: 'template.report', label: 'Report' },
      ],
    },
    { id: 'file.open', label: 'Open', shortcut: 'Mod-O' },
    { divider: true },
    { id: 'file.makeCopy', label: 'Make a copy' },
    { id: 'file.rename', label: 'Rename', shortcut: 'F2' },
    { id: 'file.moveToFolder', label: 'Move to folder' },
    { divider: true },
    { id: 'file.import', label: 'Import', hint: '.docx .md' },
    {
      id: 'file.download',
      label: 'Download',
      submenu: [
        { id: 'download.pdf', label: 'PDF' },
        { id: 'download.docx', label: 'DOCX' },
        { id: 'download.markdown', label: 'Markdown' },
        { id: 'download.html', label: 'HTML' },
      ],
    },
    { divider: true },
    { id: 'file.versionHistory', label: 'Version history' },
    { id: 'file.pageSetup', label: 'Page setup', shortcut: 'Mod-Shift-P' },
    { id: 'file.print', label: 'Print', shortcut: 'Mod-P' },
    { divider: true },
    { id: 'file.trash', label: 'Move to trash', destructive: true },
  ],
};

const EDIT: MenuSpec = {
  id: 'edit',
  label: 'Edit',
  items: [
    { id: 'edit.undo', label: 'Undo', shortcut: 'Mod-Z' },
    { id: 'edit.redo', label: 'Redo', shortcut: 'Mod-Shift-Z' },
    { divider: true },
    { id: 'edit.cut', label: 'Cut', shortcut: 'Mod-X' },
    { id: 'edit.copy', label: 'Copy', shortcut: 'Mod-C' },
    { id: 'edit.paste', label: 'Paste', shortcut: 'Mod-V' },
    { id: 'edit.pasteNoFormat', label: 'Paste without formatting', shortcut: 'Mod-Shift-V' },
    { divider: true },
    { id: 'edit.selectAll', label: 'Select all', shortcut: 'Mod-A' },
    { id: 'edit.findReplace', label: 'Find & replace', shortcut: 'Mod-F' },
  ],
};

const VIEW: MenuSpec = {
  id: 'view',
  label: 'View',
  items: [
    {
      id: 'view.mode',
      label: 'Mode',
      submenu: [
        { id: 'view.mode.editing', label: 'Editing', role: 'radio', radioGroup: 'mode' },
        { id: 'view.mode.suggesting', label: 'Suggesting', role: 'radio', radioGroup: 'mode' },
        { id: 'view.mode.viewing', label: 'Viewing', role: 'radio', radioGroup: 'mode' },
      ],
    },
    { divider: true },
    { id: 'view.showOutline', label: 'Show outline', role: 'checkbox' },
    { id: 'view.showRuler', label: 'Show ruler', role: 'checkbox' },
    { id: 'view.showNonPrinting', label: 'Show non-printing characters', role: 'checkbox' },
    { id: 'view.showSuggestedEdits', label: 'Show suggested edits', role: 'checkbox' },
    { divider: true },
    {
      id: 'view.zoom',
      label: 'Zoom',
      submenu: [
        { id: 'view.zoom.50', label: '50%', role: 'radio', radioGroup: 'zoom' },
        { id: 'view.zoom.75', label: '75%', role: 'radio', radioGroup: 'zoom' },
        { id: 'view.zoom.100', label: '100%', role: 'radio', radioGroup: 'zoom' },
        { id: 'view.zoom.125', label: '125%', role: 'radio', radioGroup: 'zoom' },
        { id: 'view.zoom.150', label: '150%', role: 'radio', radioGroup: 'zoom' },
        { id: 'view.zoom.200', label: '200%', role: 'radio', radioGroup: 'zoom' },
        { id: 'view.zoom.fitWidth', label: 'Fit width', role: 'radio', radioGroup: 'zoom' },
      ],
    },
    { id: 'view.fullScreen', label: 'Full screen', shortcut: 'Ctrl-Mod-F' },
    { id: 'view.present', label: 'Present' },
  ],
};

const INSERT: MenuSpec = {
  id: 'insert',
  label: 'Insert',
  items: [
    {
      id: 'insert.image',
      label: 'Image',
      submenu: [
        { id: 'insert.image.upload', label: 'Upload' },
        { id: 'insert.image.byUrl', label: 'By URL' },
      ],
    },
    { id: 'insert.table', label: 'Table' },
    { id: 'insert.link', label: 'Link', shortcut: 'Mod-K' },
    { id: 'insert.hr', label: 'Horizontal rule' },
    { divider: true },
    { id: 'insert.variable', label: 'Variable', glyph: '{ }', hint: '@' },
    { id: 'insert.comment', label: 'Comment' },
    { id: 'insert.aiDraft', label: 'AI draft', ai: true, shortcut: 'Mod-J' },
    { divider: true },
    { id: 'insert.pageBreak', label: 'Page break' },
    { id: 'insert.headersFooters', label: 'Headers & footers', submenu: [{ id: 'insert.hf.stub', label: 'Edit header' }] },
    { id: 'insert.pageNumbers', label: 'Page numbers' },
    { id: 'insert.toc', label: 'Table of contents' },
    { id: 'insert.specialChars', label: 'Special characters', hint: 'Ω' },
  ],
};

const FORMAT: MenuSpec = {
  id: 'format',
  label: 'Format',
  items: [
    {
      id: 'format.text',
      label: 'Text',
      hint: 'B I U',
      submenu: [
        { id: 'format.bold', label: 'Bold', role: 'checkbox', shortcut: 'Mod-B' },
        { id: 'format.italic', label: 'Italic', role: 'checkbox', shortcut: 'Mod-I' },
        { id: 'format.underline', label: 'Underline', role: 'checkbox', shortcut: 'Mod-U' },
        { id: 'format.strike', label: 'Strikethrough', role: 'checkbox' },
        { divider: true },
        { id: 'format.subscript', label: 'Subscript' },
        { id: 'format.superscript', label: 'Superscript' },
      ],
    },
    {
      id: 'format.paragraphStyles',
      label: 'Paragraph styles',
      submenu: [
        { id: 'style.body', label: 'Body text', role: 'radio', radioGroup: 'style' },
        { id: 'style.h1', label: 'Heading 1', role: 'radio', radioGroup: 'style' },
        { id: 'style.h2', label: 'Heading 2', role: 'radio', radioGroup: 'style' },
        { id: 'style.h3', label: 'Heading 3', role: 'radio', radioGroup: 'style' },
        { id: 'style.h4', label: 'Heading 4', role: 'radio', radioGroup: 'style' },
      ],
    },
    {
      id: 'format.alignIndent',
      label: 'Align & indent',
      submenu: [
        { id: 'align.left', label: 'Left', role: 'radio', radioGroup: 'align' },
        { id: 'align.center', label: 'Center', role: 'radio', radioGroup: 'align' },
        { id: 'align.right', label: 'Right', role: 'radio', radioGroup: 'align' },
        { id: 'align.justify', label: 'Justify', role: 'radio', radioGroup: 'align' },
        { divider: true },
        { id: 'align.indent', label: 'Increase indent' },
        { id: 'align.outdent', label: 'Decrease indent' },
      ],
    },
    {
      id: 'format.lineParagraphSpacing',
      label: 'Line & paragraph spacing',
      submenu: [
        { id: 'spacing.line.1', label: 'Single', role: 'radio', radioGroup: 'lh' },
        { id: 'spacing.line.1.15', label: '1.15', role: 'radio', radioGroup: 'lh' },
        { id: 'spacing.line.1.5', label: '1.5', role: 'radio', radioGroup: 'lh' },
        { id: 'spacing.line.2', label: 'Double', role: 'radio', radioGroup: 'lh' },
        { divider: true },
        { id: 'spacing.before', label: 'Add space before paragraph' },
        { id: 'spacing.after', label: 'Add space after paragraph' },
      ],
    },
    {
      id: 'format.lists',
      label: 'Lists',
      submenu: [
        { id: 'list.numbered', label: 'Numbered list', role: 'checkbox' },
        { id: 'list.bulleted', label: 'Bulleted list', role: 'checkbox' },
        { id: 'list.checklist', label: 'Checklist', role: 'checkbox' },
      ],
    },
    { divider: true },
    { id: 'format.columns', label: 'Columns', submenu: [{ id: 'format.columns.stub', label: 'Two columns' }] },
    {
      id: 'format.table',
      label: 'Table',
      submenu: [
        { id: 'table.insert', label: 'Insert table' },
        { divider: true },
        { id: 'table.addRow', label: 'Insert row below' },
        { id: 'table.deleteRow', label: 'Delete row' },
        { id: 'table.addColumn', label: 'Insert column right' },
        { id: 'table.deleteColumn', label: 'Delete column' },
        { divider: true },
        { id: 'table.delete', label: 'Delete table', destructive: true },
      ],
    },
    { id: 'format.pageColor', label: 'Page color' },
    { divider: true },
    { id: 'format.clearFormatting', label: 'Clear formatting', shortcut: 'Mod-\\' },
  ],
};

const TOOLS: MenuSpec = {
  id: 'tools',
  label: 'Tools',
  items: [
    { id: 'tools.aiEdit', label: 'AI edit', ai: true, shortcut: 'Mod-E' },
    { id: 'tools.reviewAi', label: 'Review AI edits', ai: true },
    { divider: true },
    { id: 'tools.spellingGrammar', label: 'Spelling & grammar', submenu: [{ id: 'tools.sg.stub', label: 'Check document' }] },
    { id: 'tools.wordCount', label: 'Word count', shortcut: 'Mod-Shift-C' },
    { divider: true },
    { id: 'tools.variables', label: 'Variables', glyph: '{ }' },
    { id: 'tools.compare', label: 'Compare documents' },
    { id: 'tools.citations', label: 'Citations' },
    { divider: true },
    { id: 'tools.preferences', label: 'Preferences' },
  ],
};

const HELP: MenuSpec = {
  id: 'help',
  label: 'Help',
  search: true,
  items: [
    { id: 'help.center', label: 'Help center' },
    { id: 'help.keyboardShortcuts', label: 'Keyboard shortcuts', shortcut: 'Mod-Shift-/' },
    { id: 'help.whatsNew', label: "What's new" },
    { divider: true },
    { id: 'help.report', label: 'Report a problem' },
    { id: 'help.privacy', label: 'Privacy policy' },
    { id: 'help.terms', label: 'Terms of service' },
  ],
};

export const MENUS: MenuSpec[] = [FILE, EDIT, VIEW, INSERT, FORMAT, TOOLS, HELP];
