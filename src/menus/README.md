# Menu bar (`src/menus`)

A reusable, data-driven WAI-ARIA menubar: `File Edit View Insert Format Tools Help`.

## Architecture

- **`MenuBar.tsx`** — the `role="menubar"`. Click opens; hovering another trigger
  while open switches menus; ←/→ move between menus, ↓/Enter open, F10 focuses
  the bar, ⌘/ opens Help search. Builds the command context (editor + UI state +
  host services) and the Help search index once, passes them down.
- **`Menu.tsx`** (`MenuPanel`) — the portaled panel + item rows. Roving focus,
  ↑↓ / Home / End, Enter/Space, typeahead, → open submenu / ← return, Escape,
  click-to-open submenus (→ also opens; hover only highlights), viewport flip (up/left), and the Help search
  header. Recursive: a submenu is a `MenuPanel` with `side="right"`.
- **`types.ts`** — `MenuSpec` / `MenuItemSpec` (pure data).
- **`menuData.ts`** — the `MenuSpec[]` declaring all 7 menus.
- **`registry.ts`** — `COMMANDS`: `commandId → { run?, isEnabled?, isChecked?, badge? }`.
- **`helpSearch.ts`** — flat command index built over the SAME `MenuSpec[]`.
- **`platform.ts`** — `formatShortcut("Mod-Shift-Z")` → `⌘⇧Z` (mac) / `Ctrl+Shift+Z`.
- **`WordCountDialog.tsx`** — Tools ▸ Word count.

## Add a menu or item

Edit **`menuData.ts`** only:

```ts
{ id: 'insert.foo', label: 'Foo', shortcut: 'Mod-Shift-F', hint: '@',
  role: 'checkbox' /* or 'radio' + radioGroup */, destructive: true, ai: true,
  submenu: [ /* nested MenuNode[] */ ] }
```

Then add the matching entry in **`registry.ts`**:

```ts
'insert.foo': {
  run: ({ editor, ui, svc }) => editor.chain().focus().doThing().run(),
  isEnabled: ({ editor }) => editor.can().doThing(),   // optional
  isChecked: ({ editor }) => editor.isActive('foo'),   // for checkbox/radio
  badge: ({ ui }) => (n > 0 ? { text: String(n), variant: 'teal' } : null),
}
```

The item + its shortcut automatically appear in Help search (same data source).

## How commandIds map to the registry

Every item's `id` resolves in `COMMANDS`. An item renders **disabled** when the
id has no entry, the entry has no `run`, or `isEnabled` returns false — so an
unbuilt feature is declared simply by omitting `run`; it can never silently
no-op. Dynamic values (enabled / checked / badge) are computed from live editor
state each render, never stored in the menu data.

## Stubbed pending features (render disabled)

These have **no `run`** until the feature exists:

- **File** — New document, New from template, Open, Make a copy, Move to folder,
  Import, Download ▸ PDF/Markdown/HTML, Version history, Page setup, Move to trash.
- **Edit** — Find & replace.
- **View** — Show ruler, Show non-printing characters, Show suggested edits, Present.
- **Insert** — Image (Upload / By URL), Variable, Comment, Headers & footers,
  Page numbers, Table of contents, Special characters.
- **Format** — Subscript, Superscript, Increase/Decrease indent, Columns.
- **Tools** — Spelling & grammar, Variables (amber badge stays hidden at 0),
  Compare documents, Citations, Preferences.
- **Help** — Help center, Keyboard shortcuts, What's new, Report a problem,
  Privacy policy, Terms of service.

## Wired to existing features

Undo/Redo · Cut/Copy/Paste/Paste-without-formatting (browser clipboard) · Select
all · Print · Download ▸ DOCX · Rename (title editor) · Mode radio
(editing/suggesting/viewing) · Show outline · Zoom radio + Fit width · Full
screen · Insert Table / Format ▸ Table ops · Link · Horizontal rule · Page break ·
AI draft / AI edit / Review AI edits (teal pending badge) · Bold/Italic/Underline/
Strike · Paragraph styles · Align · Line & paragraph spacing (line-height +
paragraph-spacing features) · Lists · Clear formatting · Word count · Help search.
