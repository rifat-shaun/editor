/**
 * List-numbering engine — Tiptap v2 extensions + ProseMirror plugin.
 *
 * Pieces:
 *  - CustomDocument: adds the `listDefs` registry attribute to the doc node.
 *    It serializes through `getJSON()` and updates via undoable
 *    `tr.setDocAttribute`.
 *  - CustomOrderedList: adds `listDefId` (+ `restart`) node attributes, with
 *    parse/renderHTML so the id round-trips into exported HTML.
 *  - listNumberingPlugin: (1) node decorations that stamp each `<ol>` with its
 *    effective `data-list-def` (inherited from the nearest assigned ancestor)
 *    and `data-list-level` (ordered-list depth) — never touching the doc/history;
 *    (2) a <style> element rebuilt from the registry whenever it changes.
 *  - Commands: applyListPreset / setLevel* / addListLevel / resetListLevel /
 *    restartNumbering, all no-ops (→ can() false) outside an ordered list.
 *  - getActiveListInfo: lets the UI read the list at the cursor.
 */
import Document from '@tiptap/extension-document';
import OrderedList from '@tiptap/extension-ordered-list';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import {
  defaultLevelConfig,
  definitionId,
  extendDefinition,
  getPreset,
  PRESETS,
  type ListDefinition,
  type ListDefRegistry,
  type ListLevelConfig,
  type NumberStyle,
  type Separator,
} from './model';
import { generateRegistryCss } from './counterCss';
import { generateBulletRegistryCss } from '../bulletList/bulletCss';
import type { BulletDefinition, BulletDefRegistry } from '../bulletList/model';

/* ----------------------------- doc + node ------------------------------ */

export const CustomDocument = Document.extend({
  addAttributes() {
    return {
      // The ordered numbering registry (id → definition). Persists via getJSON;
      // not rendered to DOM — JSON is the persistence format, enough to round-trip.
      listDefs: { default: {} as ListDefRegistry, rendered: false },
      // The bullet-marker registry, stored the same way.
      bulletDefs: { default: {} as BulletDefRegistry, rendered: false },
      // Page geometry (orientation / paper / margins) from the Page setup
      // dialog. null → use the pagination extension's configured defaults.
      // Persists via getJSON; a bridge syncs it to the pagination engine.
      pageSetup: { default: null, rendered: false },
    };
  },
  // The shared list plugin lives on the Document (always present) and renders
  // BOTH ordered and bullet lists — decorations + the injected <style>.
  addProseMirrorPlugins() {
    return [listNumberingPlugin()];
  },
});

export const CustomOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listDefId: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-list-def-id') || el.getAttribute('data-list-def') || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.listDefId
            ? { 'data-list-def-id': attrs.listDefId as string, 'data-list-def': attrs.listDefId as string }
            : {},
      },
      restart: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-list-restart') === 'true',
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.restart ? { 'data-list-restart': 'true' } : {},
      },
      // Transient: a definition inferred from PASTED markers, carried on the
      // node only until `appendTransaction` promotes it into the doc registry
      // and clears it. Not rendered to HTML (it never needs to round-trip).
      pastedDefConfig: {
        default: null as ListDefinition | null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-list-def-config');
          if (!raw) return null;
          try {
            return JSON.parse(raw) as ListDefinition;
          } catch {
            return null;
          }
        },
        renderHTML: () => ({}),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      applyListPreset:
        (presetId: string) =>
        ({ state, dispatch }) => {
          const preset = getPreset(presetId);
          if (!preset) return false;
          return commitDefinition(state, dispatch, extendDefinition(preset.levels));
        },
      // Commit an entire (draft) definition at once — used by the customize
      // dialog's Apply so all level edits land in a single undoable step.
      applyListDefinition:
        (def: ListDefinition) =>
        ({ state, dispatch }) => commitDefinition(state, dispatch, def.map((l) => ({ ...l }))),
      setLevelNumberStyle:
        (level: number, style: NumberStyle) =>
        ({ state, dispatch }) => editLevel(state, dispatch, level, { style }),
      setLevelSeparator:
        (level: number, separator: Separator) =>
        ({ state, dispatch }) => editLevel(state, dispatch, level, { separator }),
      setLevelStartAt:
        (level: number, startAt: number) =>
        ({ state, dispatch }) => editLevel(state, dispatch, level, { startAt: Math.max(1, startAt) }),
      setLevelIncludeParent:
        (level: number, includeParent: boolean) =>
        ({ state, dispatch }) => editLevel(state, dispatch, level, { includeParent }),
      addListLevel:
        () =>
        ({ state, dispatch }) => {
          const ctx = findOrderedListContext(state);
          if (!ctx) return false;
          const def = currentDefinition(state, ctx);
          const next = def.slice();
          next.push(defaultLevelConfig(next.length + 1));
          return commitDefinition(state, dispatch, next);
        },
      resetListLevel:
        (level: number) =>
        ({ state, dispatch }) => editLevel(state, dispatch, level, defaultLevelConfig(level)),
      restartNumbering:
        () =>
        ({ state, dispatch }) => {
          const ctx = findOrderedListContext(state);
          if (!ctx) return false;
          if (dispatch) {
            const def = currentDefinition(state, ctx);
            const tr = state.tr.setNodeMarkup(ctx.outer.pos, undefined, {
              ...ctx.outer.node.attrs,
              restart: true,
              start: def[0]?.startAt ?? 1,
            });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

/* --------------------------- context + edits --------------------------- */

interface OlRef {
  node: PMNode;
  pos: number;
}
interface OlContext {
  nearest: OlRef; // innermost ordered list at the cursor
  outer: OlRef; // outermost ordered list at the cursor
  level: number; // ordered-list nesting depth of the cursor (1-based)
}

/** Ordered-list ancestors of the selection (innermost first). */
export function findOrderedListContext(state: EditorState): OlContext | null {
  const { $from } = state.selection;
  const ols: OlRef[] = [];
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    if (node.type.name === 'orderedList') ols.push({ node, pos: $from.before(d) });
  }
  if (!ols.length) return null;
  return { nearest: ols[0]!, outer: ols[ols.length - 1]!, level: ols.length };
}

function registryOf(state: EditorState): ListDefRegistry {
  return (state.doc.attrs.listDefs as ListDefRegistry) ?? {};
}

/** The definition currently applied to the list at the cursor (or the default). */
function currentDefinition(state: EditorState, ctx: OlContext): ListDefinition {
  const reg = registryOf(state);
  const id = ctx.nearest.node.attrs.listDefId as string | null;
  const def = id ? reg[id] : undefined;
  return def ? def.slice() : extendDefinition(PRESETS[0]!.levels);
}

/** Copy-on-write a single level of the current list's definition, then commit. */
function editLevel(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  level: number,
  patch: Partial<ListLevelConfig>,
): boolean {
  const ctx = findOrderedListContext(state);
  if (!ctx) return false;
  const def = extendDefinition(currentDefinition(state, ctx), Math.max(level, 1));
  const next = def.map((l, i) => (i === level - 1 ? { ...l, ...patch } : { ...l }));
  return commitDefinition(state, dispatch, next);
}

/**
 * Register `def` (dedup by content hash) and point every ordered list within
 * the cursor's outermost list at it — one atomic, undoable transaction.
 */
function commitDefinition(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  def: ListDefinition,
): boolean {
  const ctx = findOrderedListContext(state);
  if (!ctx) return false;
  if (dispatch) {
    const id = definitionId(def);
    const reg = { ...registryOf(state), [id]: def };
    const tr = state.tr;
    tr.setDocAttribute('listDefs', reg);
    // Assign the id to every ordered list inside the outermost list (so nested
    // levels share the definition). Positions are stable (setNodeMarkup keeps
    // node size), so we can collect then apply.
    const targets: { pos: number; node: PMNode }[] = [];
    const from = ctx.outer.pos;
    const to = ctx.outer.pos + ctx.outer.node.nodeSize;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'orderedList') targets.push({ pos, node });
      return true;
    });
    for (const t of targets) tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, listDefId: id });
    dispatch(tr);
  }
  return true;
}

/* ------------------------------ the plugin ----------------------------- */

const listNumberingKey = new PluginKey('list-numbering');
let styleSeq = 0;

/**
 * Font size of a list item's OWN first line (its head block's first text run),
 * ignoring any nested list. Used so the marker matches the content's size.
 */
function itemMarkerSize(li: PMNode): string | null {
  const head = li.firstChild;
  if (!head || head.type.name === 'orderedList' || head.type.name === 'bulletList') return null;
  let size: string | null = null;
  head.descendants((n) => {
    if (size) return false;
    if (n.isText) {
      for (const m of n.marks) {
        if (m.type.name === 'textStyle' && m.attrs.fontSize) {
          size = m.attrs.fontSize as string;
          return false;
        }
      }
    }
    return true;
  });
  return size;
}

/**
 * Walk the doc, tagging every ordered list with `data-list-def`/`data-list-level`
 * and every bullet list with `data-bullet-def`/`data-bullet-level` (each depth
 * counted within its own list type, so mixed nesting stays correct). Ids inherit
 * from the nearest assigned ancestor so items indented into a deeper level pick
 * up the definition automatically.
 */
function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  const walk = (
    node: PMNode,
    pos: number,
    olDepth: number,
    olId: string,
    ulDepth: number,
    ulId: string,
  ) => {
    let childPos = pos + 1; // first child position (inside `node`)
    node.forEach((child) => {
      const name = child.type.name;
      const isOl = name === 'orderedList';
      const isUl = name === 'bulletList';
      const nextOlDepth = isOl ? olDepth + 1 : olDepth;
      const nextUlDepth = isUl ? ulDepth + 1 : ulDepth;
      const nextOlId = isOl ? (child.attrs.listDefId as string | null) || olId : olId;
      const nextUlId = isUl ? (child.attrs.bulletDefId as string | null) || ulId : ulId;
      if (isOl) {
        decos.push(
          Decoration.node(childPos, childPos + child.nodeSize, {
            'data-list-def': nextOlId || '',
            'data-list-level': String(nextOlDepth),
          }),
        );
      }
      if (isUl) {
        decos.push(
          Decoration.node(childPos, childPos + child.nodeSize, {
            'data-bullet-def': nextUlId || '',
            'data-bullet-level': String(nextUlDepth),
          }),
        );
      }
      // Marker follows the item's own font size: expose it as a CSS var the
      // marker (::before / ::marker) reads, without changing the content itself.
      if (name === 'listItem') {
        const size = itemMarkerSize(child);
        if (size) {
          decos.push(
            Decoration.node(childPos, childPos + child.nodeSize, {
              style: `--pgn-marker-size: ${size}`,
            }),
          );
        }
      }
      walk(child, childPos, nextOlDepth, nextOlId, nextUlDepth, nextUlId);
      childPos += child.nodeSize;
    });
  };
  walk(doc, -1, 0, '', 0, '');
  return DecorationSet.create(doc, decos);
}

/** Bullet definitions actually referenced by bullet-list nodes. */
function collectUsedBulletDefs(state: EditorState): Record<string, BulletDefinition> {
  const reg = (state.doc.attrs.bulletDefs as BulletDefRegistry) ?? {};
  const used: Record<string, BulletDefinition> = {};
  state.doc.descendants((node) => {
    if (node.type.name === 'bulletList') {
      const id = node.attrs.bulletDefId as string | null;
      if (id && reg[id]) used[id] = reg[id]!;
    }
    return true;
  });
  return used;
}

/** Definitions actually referenced by ordered-list nodes (for CSS generation). */
function collectUsedDefs(state: EditorState): Record<string, ListDefinition> {
  const reg = registryOf(state);
  const used: Record<string, ListDefinition> = {};
  state.doc.descendants((node) => {
    if (node.type.name === 'orderedList') {
      const id = node.attrs.listDefId as string | null;
      if (id && reg[id]) used[id] = reg[id]!;
    }
    return true;
  });
  return used;
}

/**
 * Promote any `pastedDefConfig` (a definition inferred from pasted markers) into
 * the doc registry: register it under a content-hash id, stamp that id onto the
 * pasted list AND its nested ordered lists, and clear the transient attr. This
 * is how a pasted list keeps its per-level scheme and numbers continuously.
 */
function promotePastedDefs(newState: EditorState): Transaction | null {
  const tops: { pos: number; node: PMNode; def: ListDefinition }[] = [];
  newState.doc.descendants((node, pos) => {
    if (node.type.name === 'orderedList' && node.attrs.pastedDefConfig) {
      tops.push({ pos, node, def: node.attrs.pastedDefConfig as ListDefinition });
    }
    return true;
  });
  if (!tops.length) return null;

  const tr = newState.tr;
  const reg: ListDefRegistry = { ...registryFromDoc(newState) };
  for (const top of tops) {
    const id = definitionId(top.def);
    reg[id] = top.def;
    const from = top.pos;
    const to = top.pos + top.node.nodeSize;
    newState.doc.nodesBetween(from, to, (n, p) => {
      if (n.type.name === 'orderedList') {
        tr.setNodeMarkup(p, undefined, { ...n.attrs, listDefId: id, pastedDefConfig: null });
      }
      return true;
    });
  }
  tr.setDocAttribute('listDefs', reg);
  return tr;
}

function registryFromDoc(state: EditorState): ListDefRegistry {
  return (state.doc.attrs.listDefs as ListDefRegistry) ?? {};
}

function listNumberingPlugin(): Plugin {
  return new Plugin({
    key: listNumberingKey,
    appendTransaction: (_trs, _old, newState) => promotePastedDefs(newState),
    state: {
      init: (_, state) => buildDecorations(state.doc),
      apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
    },
    props: {
      decorations(state) {
        return listNumberingKey.getState(state) as DecorationSet;
      },
    },
    view() {
      const styleEl = document.createElement('style');
      styleEl.id = `pgn-list-numbering-${++styleSeq}`;
      document.head.appendChild(styleEl);
      let lastSig = '';
      const sync = (state: EditorState) => {
        const used = collectUsedDefs(state);
        const bulletUsed = collectUsedBulletDefs(state);
        const sig = JSON.stringify(used) + '|' + JSON.stringify(bulletUsed);
        if (sig !== lastSig) {
          styleEl.textContent =
            generateRegistryCss(used) + '\n' + generateBulletRegistryCss(bulletUsed);
          lastSig = sig;
        }
      };
      return {
        update: (v) => sync(v.state),
        destroy: () => styleEl.remove(),
      };
    },
  });
}

/* ---------------------------- UI state reader -------------------------- */

export interface ActiveListInfo {
  level: number; // selected level (ordered-list depth at the cursor), 1-based
  definition: ListDefinition;
  defId: string | null;
  presetId: string | null; // matched preset for the selected-card state, if any
}

const PRESET_IDS = PRESETS.map((p) => ({ id: p.id, hash: definitionId(extendDefinition(p.levels)) }));

/** Read the ordered list at the cursor so the picker/panel can reflect it. */
export function getActiveListInfo(editor: Editor | null): ActiveListInfo | null {
  if (!editor) return null;
  const ctx = findOrderedListContext(editor.state);
  if (!ctx) return null;
  const reg = registryOf(editor.state);
  const id = ctx.nearest.node.attrs.listDefId as string | null;
  const definition = id && reg[id] ? reg[id]! : extendDefinition(PRESETS[0]!.levels);
  const presetId = id ? (PRESET_IDS.find((p) => p.hash === id)?.id ?? null) : null;
  return { level: ctx.level, definition, defId: id, presetId };
}

/* ------------------------- command typing (Tiptap) --------------------- */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listNumbering: {
      applyListPreset: (presetId: string) => ReturnType;
      applyListDefinition: (def: ListDefinition) => ReturnType;
      setLevelNumberStyle: (level: number, style: NumberStyle) => ReturnType;
      setLevelSeparator: (level: number, separator: Separator) => ReturnType;
      setLevelStartAt: (level: number, startAt: number) => ReturnType;
      setLevelIncludeParent: (level: number, includeParent: boolean) => ReturnType;
      addListLevel: () => ReturnType;
      resetListLevel: (level: number) => ReturnType;
      restartNumbering: () => ReturnType;
    };
  }
}
