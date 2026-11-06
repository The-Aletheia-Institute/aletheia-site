#!/usr/bin/env node
/* Assemble the deployable site into dist/ — and stamp every asset reference
   with its content hash, so served HTML can never pair with a stale cached
   asset. The source tree stays clean; only dist/index.html carries hashes. */
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ['index.html', 'privacy', 'terms', 'css', 'js', 'assets']) {
  await cp(join(root, entry), join(dist, entry), { recursive: true });
}

// content-hash cache busting: rewrite local href/src refs to path?v=<hash8>
// EVERY page is stamped, not just the home page. A legal page deployed with
// unstamped refs can pair with a stale cached asset, and the post-deploy
// smoke reads these hashes to prove the live site is this exact build.
const PAGES = ['index.html', 'privacy/index.html', 'terms/index.html'];
const hashed = [];
for (const page of PAGES) {
  const pageFile = join(dist, page);
  let html = await readFile(pageFile, 'utf8');
  const refs = [...html.matchAll(/(href|src)="([^"#][^"?]*)"/g)]
    .map(m => m[2])
    .filter(u => !u.startsWith('http') && !u.startsWith('mailto:') && !u.startsWith('data:'));
  for (const ref of [...new Set(refs)]) {
    // Root-absolute refs resolve against dist/; relative ones against the
    // page's own directory. A ref naming a DIRECTORY — the footer's
    // href="/privacy/" — is not an asset, and readFile would throw EISDIR.
    const f = ref.startsWith('/') ? join(dist, ref) : join(dirname(pageFile), ref);
    if (!existsSync(f) || !statSync(f).isFile()) continue;
    const h = createHash('sha256').update(await readFile(f)).digest('hex').slice(0, 8);
    html = html.replaceAll(`"${ref}"`, `"${ref}?v=${h}"`);
    hashed.push(`${page}  ${ref}?v=${h}`);
  }
  await writeFile(pageFile, html);
}

console.log('dist/ ready —', hashed.length, 'asset refs stamped:');
hashed.forEach(h => console.log('  ', h));
