// Empaqueta la app en un único archivo dist/index.html (JS y CSS en línea),
// listo para GitHub Pages o para abrir directamente en el navegador.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const res = await build({
  entryPoints: ['src/ui/main.tsx'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  outdir: 'dist',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [],
  logLevel: 'warning',
});
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const html = (await readFile('index.html', 'utf8'))
  .replace('<!--STYLE-->', `<style>${css}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
