// Author: Prateek Dhall — World Dataset Assignment.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({ absWorkingDir: root, entryPoints: ['app/static/editor-source.js'], banner: { js: '/*! World Dataset Assignment integration by Prateek Dhall. Bundled dependencies retain their own authorship. */', css: '/*! World Dataset Assignment integration by Prateek Dhall. */' }, bundle: true, minify: true, outfile: 'app/static/editor.js', loader: { '.ttf': 'file' }, assetNames: 'editor-assets/[name]-[hash]', logLevel: 'info' });
await build({ absWorkingDir: root, entryPoints: ['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'], banner: { js: '/*! World Dataset Assignment integration by Prateek Dhall. Bundled dependencies retain their own authorship. */', css: '/*! World Dataset Assignment integration by Prateek Dhall. */' }, bundle: true, minify: true, outfile: 'app/static/editor-worker.js', logLevel: 'info' });
