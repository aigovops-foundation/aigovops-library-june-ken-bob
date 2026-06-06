// scripts/build-docs.mjs
// Inline the single source of truth (core/src/core/yesgate.shared.js) into the
// "See it run" demo in docs/index.html, between the BEGIN-SHARED / END-SHARED
// markers. Export-strips the module so it runs inside the page's classic <script>
// — which means the page stays ONE self-contained file (works on file:// AND
// GitHub Pages, no runtime import) while the logic has exactly one source.
//
// Run:  npm run build:docs   (also run by the Pages workflow before deploy)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'core/src/core/yesgate.shared.js');
const PAGE = path.join(root, 'docs/index.html');
const BEGIN = '/*BEGIN-SHARED';
const END = '/*END-SHARED*/';

function stripExports(code) {
  return code
    .replace(/^\s*export\s+function/gm, 'function')
    .replace(/^\s*export\s+const/gm, 'const')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')   // drop `export { ... }` lines
    .trim();
}

const shared = fs.readFileSync(SRC, 'utf8');
const inlined = stripExports(shared);

let page = fs.readFileSync(PAGE, 'utf8');
const b = page.indexOf(BEGIN);
const e = page.indexOf(END);
if (b < 0 || e < 0) { console.error('markers not found in docs/index.html'); process.exit(1); }

const head = page.slice(0, b);
const tail = page.slice(e + END.length);
const beginLineEnd = page.indexOf('*/', b) + 2; // keep the BEGIN comment line intact
const beginComment = page.slice(b, beginLineEnd);

const block =
  beginComment + '\n' +
  '    // --- inlined from core/src/core/yesgate.shared.js — DO NOT EDIT HERE ---\n' +
  inlined.split('\n').map(l => l ? '    ' + l : l).join('\n') + '\n    ' +
  END;

page = head + block + tail;
fs.writeFileSync(PAGE, page);
console.log('build:docs — inlined', inlined.split('\n').length, 'lines of yesgate.shared.js into docs/index.html');
