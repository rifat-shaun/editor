import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const spotlightKey = new PluginKey<string | null>('redline-spotlight');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spotlight: {
      /** Highlight the block(s) owning a change id, or clear with null. */
      setSpotlight: (changeId: string | null) => ReturnType;
    };
  }
}

/**
 * Node-decorates the block elements that contain a given change's redline
 * marks, producing the "active / spotlit change" treatment. Driven entirely
 * by a plugin-state change id set via the `setSpotlight` command.
 */
export const Spotlight = Extension.create({
  name: 'redlineSpotlight',

  addCommands() {
    return {
      setSpotlight:
        (changeId) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(spotlightKey, changeId));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<string | null>({
        key: spotlightKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(spotlightKey);
            if (meta !== undefined) return meta as string | null;
            return value;
          },
        },
        props: {
          decorations(state) {
            const changeId = spotlightKey.getState(state);
            if (!changeId) return DecorationSet.empty;

            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              let hit = false;
              node.descendants((child) => {
                if (
                  child.marks.some(
                    (m) =>
                      (m.type.name === 'insertion' || m.type.name === 'deletion') &&
                      m.attrs.changeId === changeId,
                  )
                ) {
                  hit = true;
                }
              });
              if (hit) {
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, { class: 'redline-spotlight' }),
                );
              }
              return true;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
