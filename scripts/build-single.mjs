// Single-file build: turns dist/ (from `vite build`) into one HTML file at
// the repo root, ClimateConnections.html, that opens by double-click with
// no server. The script, the stylesheet, the favicon and the graph are all
// inlined. The last step of `npm run build`, so it never goes stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'ClimateConnections.html');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const read = (rel) => readFileSync(join(dist, rel.replace(/^\.\//, '')), 'utf8');
/** `</` would end an inline <script> early. */
const safe = (s) => s.replace(/<\//g, '<\\/');

let found = 0;
// Function replacements throughout: a string replacement would expand any
// `$&` or `$1` inside the minified bundle.
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  found++;
  const js = read(src).replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '');
  return `<script type="module">${safe(js)}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => {
  found++;
  return `<style>${read(href).replace(/<\//g, '<\\/')}</style>`;
});
html = html.replace(/<link rel="icon" type="image\/svg\+xml" href="([^"]+)" \/>/, (_, href) => {
  found++;
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(read(href))}" />`;
});
if (found !== 3) throw new Error(`build-single: expected script, stylesheet and favicon in dist/index.html, found ${found}`);

const graph = JSON.stringify(JSON.parse(read('data/graph.json')));
html = html.replace('</body>', () => `<script type="application/json" id="graph-data">${safe(graph)}</script>\n  </body>`);

writeFileSync(out, html);
console.log(`build-single: wrote ${out} (${Math.round(html.length / 1024)} KB)`);
