// Adds a content-based version to every local CSS/JS link in index.html and pos.html, e.g.
//   <script src="js/cart.js?v=3f9c2a1b"></script>
// GitHub Pages lets browsers cache files for about 10 minutes. When a file
// changes, its version changes too, so browsers fetch the new copy right away.
// Unchanged files keep their version and stay cached.
//
// Run before committing changes to css/ or js/:
//   node scripts/version-assets.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'pos.html'];

// Hash with LF line endings so Windows and Linux checkouts get the same version
const versionOf = (file) => {
  const content = readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
};

for (const page of PAGES) {
  const pagePath = join(root, page);
  const html = readFileSync(pagePath, 'utf8');
  const changes = [];
  const updated = html.replace(
    /((?:href|src)=")((?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w-]*)?(")/g,
    (match, before, file, after) => {
      const tagged = `${before}${file}?v=${versionOf(file)}${after}`;
      if (tagged !== match) changes.push(file);
      return tagged;
    }
  );

  if (changes.length === 0) {
    console.log(`${page} already up to date`);
  } else {
    writeFileSync(pagePath, updated);
    console.log(`${page}: updated ${changes.length} link(s): ${changes.join(', ')}`);
  }
}
