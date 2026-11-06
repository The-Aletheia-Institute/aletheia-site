// Static guarantees: files on disk keep their promises before a browser ever runs.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const RUNTIME_FILES = ['index.html', 'manifesto/index.html', 'privacy/index.html', 'terms/index.html', 'css/main.css', 'js/main.js', 'js/particles.js', 'js/palette.js', 'js/inquiry.js', 'js/emblem-data.js'];

test.describe('static: the livery', () => {
  const tokens = JSON.parse(read('tokens.json'));
  const css = read('css/main.css');

  const NAMED = {
    'aletheia-midnight': tokens.color['aletheia-midnight'].$value,
    'midnight-ink': tokens.color['midnight-ink'].$value,
    'veritas-gold': tokens.color['veritas-gold'].$value,
    'ledger-bronze': tokens.color['ledger-bronze'].$value,
    'institute-ivory': tokens.color['institute-ivory'].$value,
    'verity-teal': tokens.color['verity-teal'].$value,
  };

  for (const [name, hex] of Object.entries(NAMED)) {
    test(`css declares --${name} exactly ${hex}`, () => {
      const re = new RegExp(`--${name}\\s*:\\s*${hex}`, 'i');
      expect(css).toMatch(re);
    });
  }

  test('functional vars alias the named tinctures', () => {
    expect(css).toMatch(/--navy\s*:\s*var\(--aletheia-midnight\)/);
    expect(css).toMatch(/--gold\s*:\s*var\(--veritas-gold\)/);
    expect(css).toMatch(/--ivory\s*:\s*var\(--institute-ivory\)/);
    expect(css).toMatch(/--teal\s*:\s*var\(--verity-teal\)/);
    expect(css).toMatch(/--gold-shadow\s*:\s*var\(--ledger-bronze\)/);
  });

  test('law: pure white is never used as a color', () => {
    // #fff / #ffffff / rgb(255,255,255) must not appear as a color value
    expect(css).not.toMatch(/#fff\b/i);
    expect(css).not.toMatch(/#ffffff/i);
    expect(css).not.toMatch(/rgb\(\s*255\s*,\s*255\s*,\s*255/);
  });

  test('law: every text tincture clears WCAG AAA on both grounds', () => {
    const lum = (hex) => {
      const c = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4].map(i => {
        const v = parseInt(c.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    for (const ground of [NAMED['aletheia-midnight'], NAMED['midnight-ink']]) {
      expect(ratio(NAMED['institute-ivory'], ground)).toBeGreaterThanOrEqual(7);
      expect(ratio(NAMED['veritas-gold'], ground)).toBeGreaterThanOrEqual(7);
      expect(ratio(NAMED['verity-teal'], ground)).toBeGreaterThanOrEqual(7);
    }
  });

  test('law: the metal always wins — teal luminance below gold', () => {
    const lum = (hex) => {
      const c = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4].map(i => {
        const v = parseInt(c.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lum(NAMED['verity-teal'])).toBeLessThan(lum(NAMED['veritas-gold']));
  });
});

test.describe('static: the promise', () => {
  test('zero external URLs in runtime code', () => {
    for (const f of RUNTIME_FILES) {
      const matches = (read(f).match(/https?:\/\/[^"'` )\\]+/g) || [])
        .filter(u => !u.includes('w3.org'));           // SVG namespace, never fetched
      expect(matches, `${f} references external URLs`).toEqual([]);
    }
  });

  test('every local href/src in every page resolves to a real file', () => {
    for (const page of ['index.html', 'manifesto/index.html', 'privacy/index.html', 'terms/index.html']) {
      const html = read(page);
      const refs = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)]
        .map(m => m[1])
        .filter(u => !u.startsWith('mailto:') && !u.startsWith('http') && !u.startsWith('data:'));
      expect(refs.length, `${page} has almost no local refs`).toBeGreaterThan(3);
      for (const r of refs) {
        // Root-absolute against the repo root; relative against the page.
        const f = r.startsWith('/') ? join(root, r) : join(root, dirname(page), r);
        expect(existsSync(f), `${page} missing: ${r}`).toBe(true);
      }
    }
  });

  test('preloaded fonts exist and are genuine woff2', () => {
    const html = read('index.html');
    const preloads = [...html.matchAll(/rel="preload" href="([^"]+)"/g)].map(m => m[1]);
    expect(preloads.length).toBeGreaterThanOrEqual(3);
    for (const p of preloads) {
      const buf = readFileSync(join(root, p));
      expect(buf.subarray(0, 4).toString('latin1'), `${p} is not woff2`).toBe('wOF2');
    }
  });

  test('vendored libraries match the pinned versions, by content hash', () => {
    // Minified builds do not reliably embed their version string (Lenis dropped
    // its constant at 1.3), so integrity is verified against vendor.lock.json,
    // which scripts/vendor.mjs writes at download time.
    const manifest = JSON.parse(read('vendor.json'));
    const lock = JSON.parse(read('vendor.lock.json'));
    for (const [name, lib] of Object.entries(manifest.libraries)) {
      expect(lock.libraries[name], `${name}: vendor.json bumped without re-vendoring`)
        .toBe(lib.version);
    }
    for (const [file, sha] of Object.entries(lock.files)) {
      const actual = createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
      expect(actual, `${file} does not match its locked hash — re-run npm run vendor`).toBe(sha);
    }
    // GSAP still publishes a version banner; assert it while it exists.
    expect(read('js/gsap.min.js')).toContain(`GSAP ${manifest.libraries.gsap.version}`);
  });

  test('the collaboration stays on the record', () => {
    const html = read('index.html');
    expect(html).toContain('a human architect');      // source comment

    expect(html).toContain('This site calls no one');
    expect(html).toContain('some truths must be typed to be seen');  // footer whisper
  });

  test('required structure: every section, both nav systems, the seal', () => {
    const html = read('index.html');
    for (const id of ['hero', 'manifesto', 'services', 'method', 'demo', 'principles', 'contact',
                      'inquiry', 'inq-body', 'palette', 'mobile-menu', 'vitals', 'term-body',
                      'term-live', 'constellation']) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
    expect(html).toContain('assets/seal.svg');
    expect(html).toContain('lang="en"');
    expect(html).toMatch(/<meta name="description"/);
  });

  test('inquiry addresses inquiry@ and declares its honesty', () => {
    const html = read('index.html');
    expect(html).toContain('inquiry@aletheiainstitute.ai');
    expect(html).toContain('Nothing is transmitted silently');
    expect(read('js/inquiry.js')).toContain('inquiry@aletheiainstitute.ai');
  });

  test('the full seal ships as a packed point cloud — structural, not token-counted', () => {
    const data = read('js/emblem-data.js');
    expect(data).toContain('window.__ALETHEIA_EMBLEM');
    const m = data.match(/atob\("([A-Za-z0-9+/=]+)"\)/);
    expect(m, 'packed base64 payload missing').toBeTruthy();
    const bytes = Buffer.from(m[1], 'base64');
    expect(bytes.length % 5).toBe(0);                       // int16 x, int16 y, uint8 color
    const points = bytes.length / 5;
    expect(points).toBeGreaterThanOrEqual(18000);           // outline-cloud fidelity floor
    for (let i = 0; i < points; i += 499) {                 // spot-check normalization
      expect(Math.abs(bytes.readInt16LE(i * 5))).toBeLessThanOrEqual(1000);
      expect(bytes[i * 5 + 4]).toBeLessThan(32);            // palette index in range
    }
    expect(data).toContain('__ALETHEIA_EMBLEM_COLOR');      // true colors ship
    expect(data.length, 'emblem payload budget (320KB — the logo outranks the byte count)').toBeLessThan(320 * 1024);
    expect(read('index.html')).toContain('js/emblem-data.js');
    expect(existsSync(join(root, 'scripts/generate-emblem.sh'))).toBe(true);  // reproducible
  });

  test('the modality stage ships all four capabilities and the descent glyph', () => {
    const html = read('index.html');
    for (const id of ['mod-tabs', 'mod-listen', 'mod-read', 'mod-watch', 'mod-ask', 'descend']) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
    expect(html).toContain('role="tablist"');
  });

  test('demonstration: at least 4 exchanges, none of them GI-specific', () => {
    const main = read('js/main.js');
    const questions = main.match(/q: '/g) || [];
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(main).not.toMatch(/\bGI\b/);
  });
});
