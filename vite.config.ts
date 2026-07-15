/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';

// Library build vs. demo dev/build is decided by the LIB env flag.
const isLib = process.env.LIB === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isLib
      ? [dts({ include: ['src'], rollupTypes: true, tsconfigPath: './tsconfig.build.json' })]
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
