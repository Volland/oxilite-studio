// Bundles the extension host code into one CommonJS file.
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  // Packaged builds are minified and ship without source maps.
  sourcemap: !process.argv.includes('--production'),
  minify: process.argv.includes('--production'),
};

if (process.argv.includes('--watch')) {
  await (await esbuild.context(options)).watch();
} else {
  // A map left by a development build must not end up in the package.
  if (!options.sourcemap) rmSync(`${options.outfile}.map`, { force: true });
  await esbuild.build(options);
}
