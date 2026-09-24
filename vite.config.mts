// Builds the React webviews into dist/webview with stable file names the extension links to.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'webview',
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: { results: 'webview/src/results.tsx', renderer: 'webview/src/renderer.tsx' },
      // The notebook renderer is loaded as a module and must export `activate`.
      preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: '[name].js', assetFileNames: '[name][extname]', chunkFileNames: '[name].js' },
    },
  },
});
