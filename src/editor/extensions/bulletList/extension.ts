/**
 * Bullet-list engine — mirrors the ordered CustomOrderedList (see
 * ../listNumbering/extension) but for unordered markers. Adds a `bulletDefId`
 * node attribute + copy-on-write commands. The DOM decorations and the injected
 * <style> are produced by the shared list plugin on the Document node, so this
 * file has no plugin of its own — it only defines the node, commands, and the
 * UI state reader.
 */
import BulletList from '@tiptap/extension-bullet-list';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import {
  bulletDefinitionId,
  BULLET_PRESETS,
  defaultBulletLevelConfig,
  extendBulletDefinition,
  getBulletPreset,
  type BulletDefinition,
  type BulletDefRegistry,
  type BulletLevelConfig,
  type MarkerStyle,
} from './model';

export const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bulletDefId: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-bullet-def-id') || el.getAttribute('data-bullet-def') || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.bulletDefId
            ? {
                'data-bullet-def-id': attrs.bulletDefId as string,
                'data-bullet-def': attrs.bulletDefId as string,
              }
            : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      applyBulletPreset:
        (presetId: string) =>
        ({ state, dispatch }) => {
          const preset = getBulletPreset(presetId);
          if (!preset) return false;
          return commitBulletDefinition(state, dispatch, extendBulletDefinition(preset.levels));
        },
      applyBulletDefinition:
        (def: BulletDefinition) =>
        ({ state, dispatch }) => commitBulletDefinition(state, dispatch, def.map((l) => ({ ...l }))),
      setBulletLevelMarker:
        (level: number, markerStyle: MarkerStyle) =>
        ({ state, dispatch }) => editBulletLevel(state, dispatch, level, { markerStyle }),
      setBulletLevelCustomMarker:
        (level: number, customMarker: string) =>
        ({ state, dispatch }) =>
          editBulletLevel(state, dispatch, level, { markerStyle: 'custom', customMarker }),
      setBulletLevelColor:
        (level: number, color: string | null) =>
        ({ state, dispatch }) => editBulletLevel(state, dispatch, level, { color }),
      setBulletLevelSize:
        (level: number, size: string | null) =>
        ({ state, dispatch }) => editBulletLevel(state, dispatch, level, { size }),
      addBulletListLevel:
        () =>
        ({ state, dispatch }) => {
          const ctx = findBulletListContext(state);
          if (!ctx) return false;
          const def = currentBulletDefinition(state, ctx);
          const next = def.slice();
          next.push(defaultBulletLevelConfig(next.length + 1));
          return commitBulletDefinition(state, dispatch, next);
        },
      resetBulletListLevel:
        (level: number) =>
        ({ state, dispatch }) =>
          editBulletLevel(state, dispatch, level, defaultBulletLevelConfig(level), true),
    };
  },
});

/* --------------------------- context + edits --------------------------- */

interface UlRef {
  node: PMNode;
  pos: number;
}
interface UlContext {
  nearest: UlRef;
  outer: UlRef;
  level: number; // bullet-list nesting depth at the cursor (1-based)
}

/** Bullet-list ancestors of the selection (innermost first). */
export function findBulletListContext(state: EditorState): UlContext | null {
  const { $from } = state.selection;
  const uls: UlRef[] = [];
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    if (node.type.name === 'bulletList') uls.push({ node, pos: $from.before(d) });
  }
  if (!uls.length) return null;
  return { nearest: uls[0]!, outer: uls[uls.length - 1]!, level: uls.length };
}

function registryOf(state: EditorState): BulletDefRegistry {
  return (state.doc.attrs.bulletDefs as BulletDefRegistry) ?? {};
}

function currentBulletDefinition(state: EditorState, ctx: UlContext): BulletDefinition {
  const reg = registryOf(state);
  const id = ctx.nearest.node.attrs.bulletDefId as string | null;
  const def = id ? reg[id] : undefined;
  return def ? def.slice() : extendBulletDefinition(BULLET_PRESETS[0]!.levels);
}

/** When `replace` is true the level is set outright; otherwise the patch merges. */
function editBulletLevel(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  level: number,
  patch: Partial<BulletLevelConfig>,
  replace = false,
): boolean {
  const ctx = findBulletListContext(state);
  if (!ctx) return false;
  const def = extendBulletDefinition(currentBulletDefinition(state, ctx), Math.max(level, 1));
  const next = def.map((l, i) =>
    i === level - 1 ? (replace ? (patch as BulletLevelConfig) : { ...l, ...patch }) : { ...l },
  );
  return commitBulletDefinition(state, dispatch, next);
}

/** Register `def` (dedup by hash) and point every ul in the cursor's outermost
 * bullet list at it — one atomic, undoable transaction. */
function commitBulletDefinition(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  def: BulletDefinition,
): boolean {
  const ctx = findBulletListContext(state);
  if (!ctx) return false;
  if (dispatch) {
    const id = bulletDefinitionId(def);
    const reg = { ...registryOf(state), [id]: def };
    const tr = state.tr;
    tr.setDocAttribute('bulletDefs', reg);
    const from = ctx.outer.pos;
    const to = ctx.outer.pos + ctx.outer.node.nodeSize;
    const targets: { pos: number; node: PMNode }[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'bulletList') targets.push({ pos, node });
      return true;
    });
    for (const t of targets) tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, bulletDefId: id });
    dispatch(tr);
  }
  return true;
}

/* ---------------------------- UI state reader -------------------------- */

export interface ActiveBulletInfo {
  level: number;
  definition: BulletDefinition;
  defId: string | null;
  presetId: string | null;
}

const PRESET_IDS = BULLET_PRESETS.map((p) => ({
  id: p.id,
  hash: bulletDefinitionId(extendBulletDefinition(p.levels)),
}));

export function getActiveBulletInfo(editor: Editor | null): ActiveBulletInfo | null {
  if (!editor) return null;
  const ctx = findBulletListContext(editor.state);
  if (!ctx) return null;
  const reg = registryOf(editor.state);
  const id = ctx.nearest.node.attrs.bulletDefId as string | null;
  const definition = id && reg[id] ? reg[id]! : extendBulletDefinition(BULLET_PRESETS[0]!.levels);
  const presetId = id ? (PRESET_IDS.find((p) => p.hash === id)?.id ?? null) : null;
  return { level: ctx.level, definition, defId: id, presetId };
}

/* ------------------------- command typing (Tiptap) --------------------- */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bulletListStyle: {
      applyBulletPreset: (presetId: string) => ReturnType;
      applyBulletDefinition: (def: BulletDefinition) => ReturnType;
      setBulletLevelMarker: (level: number, markerStyle: MarkerStyle) => ReturnType;
      setBulletLevelCustomMarker: (level: number, customMarker: string) => ReturnType;
      setBulletLevelColor: (level: number, color: string | null) => ReturnType;
      setBulletLevelSize: (level: number, size: string | null) => ReturnType;
      addBulletListLevel: () => ReturnType;
      resetBulletListLevel: (level: number) => ReturnType;
    };
  }
}
