// The legal documents: Privacy and Terms.
//
// These pages exist so a carrier's A2P review can find specific sentences.
// So the test asserts those sentences are PRESENT. Without it, an edit that
// tidies one away fails silently — and the failure surfaces months later as
// a rejected campaign rather than here, in half a second.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoSettled, trackExternalRequests, trackConsoleErrors } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// Source wrapping is not meaning. A reviewer reads rendered text, so the
// phrase assertions below run against whitespace-flattened source — otherwise
// reflowing a paragraph breaks a test about what the paragraph SAYS.
const flat = (p) => read(p).replace(/\s+/g, ' ');

const PAGES = [
  { name: 'privacy', path: '/privacy/', file: 'privacy/index.html', title: /Privacy Policy/ },
  { name: 'terms',   path: '/terms/',   file: 'terms/index.html',   title: /Terms of Service/ },
];

test.describe('legal: what a carrier reviews', () => {
  test('privacy states mobile opt-in data is never sold or shared', () => {
    const html = flat('privacy/index.html');
    // The single most common A2P rejection is the absence of this sentence.
    expect(html).toMatch(/No mobile information will be sold or shared with third parties/i);
    expect(html).toMatch(/will not be shared with any third parties/i);
  });

  test('terms carry every messaging programme element', () => {
    const html = flat('terms/index.html');
    for (const phrase of [
      'Message frequency varies',
      'Message and data rates may apply',
      'Carriers are not liable for delayed or undelivered messages',
    ]) {
      expect(html, `missing required phrase: ${phrase}`).toContain(phrase);
    }
    expect(html, 'STOP must appear as its own emphasised keyword').toMatch(/>STOP</);
    expect(html, 'HELP must appear as its own emphasised keyword').toMatch(/>HELP</);
  });

  test('both documents publish a support contact and cite each other', () => {
    for (const p of PAGES) {
      const html = read(p.file);
      expect(html, `${p.file} has no contact address`).toContain('mailto:inquiry@aletheiainstitute.ai');
      expect(html, `${p.file} does not link its sibling`).toMatch(/href="\/(privacy|terms)\/"/);
    }
  });

  test('the home page footer links to both', () => {
    const html = read('index.html');
    expect(html).toContain('href="/privacy/"');
    expect(html).toContain('href="/terms/"');
  });

  test('the documents carry no script and no loader', () => {
    for (const p of PAGES) {
      const html = read(p.file);
      expect(html, `${p.file} must stay a document`).not.toMatch(/<script/i);
      expect(html, `${p.file} must not wait on body.ready`).not.toContain('id="loader"');
    }
  });
});

test.describe('legal: the pages keep the site laws', () => {
  for (const p of PAGES) {
    test(`${p.name}: zero external requests, no console errors`, async ({ page }) => {
      const external = trackExternalRequests(page);
      const errors = trackConsoleErrors(page);
      await gotoSettled(page, { path: p.path, waitForReady: false });
      await expect(page).toHaveTitle(p.title);
      expect(external, 'a legal page reached off-origin').toEqual([]);
      expect(errors).toEqual([]);
    });

    test(`${p.name}: axe finds no serious or critical violations`, async ({ page }) => {
      await gotoSettled(page, { path: p.path, waitForReady: false });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`)).toEqual([]);
    });

    test(`${p.name}: one h1, no heading jumps, content in a main landmark`, async ({ page }) => {
      await gotoSettled(page, { path: p.path, waitForReady: false });
      expect(await page.locator('h1').count()).toBe(1);
      await expect(page.locator('main#main')).toBeVisible();
      const order = await page.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3')].map(h => Number(h.tagName[1])));
      let prev = 0;
      for (const lvl of order) {
        expect(lvl - prev, `heading jumped from h${prev} to h${lvl}`).toBeLessThanOrEqual(1);
        prev = lvl;
      }
    });

    test(`${p.name}: prose links are underlined, not colour alone`, async ({ page }) => {
      await gotoSettled(page, { path: p.path, waitForReady: false });
      const decoration = await page.locator('.legal p a').first()
        .evaluate(el => getComputedStyle(el).textDecorationLine);
      expect(decoration).toContain('underline');
    });
  }
});
