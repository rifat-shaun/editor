/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { parse } from 'postcss';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';

// Library build vs. demo dev/build is decided by the LIB env flag.
const isLib = process.env.LIB === '1';

// The editor's root element (and its portal host) carry this attribute; every
// shipped rule is scoped under it so nothing — Tailwind's preflight reset,
// utility classes, or design tokens — escapes into the consuming app.
const SCOPE = '[data-docs-editor-root]';

// Rewrite one selector so it only matches inside the editor subtree.
function scopeSelector(sel: string): string {
  const s = sel.trim();
  // Theme-token blocks are keyed on `data-theme` set on <html> (:root). Keep
  // that html-level switch, but scope what it paints to the editor subtree:
  //   :root                          -> [data-docs-editor-root]
  //   :root[data-theme=dark]         -> :root[data-theme=dark] [data-docs-editor-root]
  //   :root[data-theme=dark] .foo    -> :root[data-theme=dark] [data-docs-editor-root] .foo
  if (s.startsWith(':root')) {
    const m = /^:root(\[[^\]]*\])?\s*/.exec(s)!;
    const attr = m[1] ?? '';
    const rest = s.slice(m[0].length);
    if (attr) return rest ? `:root${attr} ${SCOPE} ${rest}` : `:root${attr} ${SCOPE}`;
    return rest ? `${SCOPE} ${rest}` : SCOPE;
  }
  // Preflight targets the document root/body — map those onto the editor root.
  if (s === 'html' || s === 'body') return SCOPE;
  // Everything else (universal reset, element resets, utilities, components):
  // scope as a descendant. All styled elements live *under* the scope anchor,
  // so descendant scoping is sufficient (nothing is styled on the anchor itself).
  return `${SCOPE} ${s}`;
}

// Prefix every rule in the compiled stylesheet with the editor scope. Skips
// @keyframes step selectors (0%/from/to) and leaves @property/@font-face — which
// have no selector list — untouched.
function scopeCssToEditorRoot(src: string): string {
  const root = parse(src);
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type === 'atrule' && /keyframes$/i.test((parent as { name: string }).name)) return;
    rule.selectors = rule.selectors.map(scopeSelector);
  });
  return root.toString();
}

// Tailwind v4 emits `@layer properties/theme/base/components/utilities { … }`
// plus a leading `@layer …;` declaration. That's valid CSS, but a consumer on a
// different pipeline (e.g. a Tailwind v3 app, whose PostCSS rejects `@layer base`
// without a matching `@tailwind base`) chokes on it. Since dist CSS is final, we
// unwrap the layers into plain rules — source order already matches layer
// priority, so cascade behavior is preserved.
function flattenCssLayers(src: string): string {
  let out = '';
  let i = 0;
  const AT = '@layer';
  while (i < src.length) {
    const at = src.indexOf(AT, i);
    if (at === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, at);
    let j = at + AT.length;
    while (j < src.length && src[j] !== '{' && src[j] !== ';') j++;
    if (src[j] === ';') {
      i = j + 1; // `@layer a, b, c;` — a layer-order declaration; drop it.
      continue;
    }
    // Block form `@layer name { … }` — keep the inner content, drop the wrapper.
    let depth = 1;
    let k = j + 1;
    for (; k < src.length && depth > 0; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') depth--;
    }
    out += src.slice(j + 1, k - 1);
    i = k;
  }
  return out;
}

// Post-process the shipped stylesheet: flatten `@layer` wrappers, then scope
// every rule under the editor root. `enforce: 'post'` runs after
// @tailwindcss/vite has populated the CSS asset, and rewriting the asset's
// in-memory source (rather than the file on disk) means Vite writes the final
// CSS directly — so it applies identically to a one-shot build and to every
// `--watch` rebuild, with no disk read/write ordering race.
function flattenCss(): Plugin {
  return {
    name: 'flatten-css-layers',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = scopeCssToEditorRoot(flattenCssLayers(file.source));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isLib
      ? [dts({ include: ['src'], rollupTypes: true, tsconfigPath: './tsconfig.build.json' }), flattenCss()]
      : []),
  ],
  build: isLib
    ? {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'DocsEditor',
          fileName: 'docs-editor',
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react/jsx-runtime'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react/jsx-runtime': 'jsxRuntime',
            },
          },
        },
      }
    : undefined,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
});
