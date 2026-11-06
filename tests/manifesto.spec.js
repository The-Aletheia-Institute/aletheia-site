// The manifesto.
//
// The promises on this page are the thing people will hold us to, so the
// test asserts each one is PRESENT. An edit that tidies a vow away should
// fail here, in half a second, and not years later when somebody quotes a
// sentence back to us that we quietly stopped making.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoSettled, trackExternalRequests, trackConsoleErrors } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// Source wrapping is not meaning. Phrase assertions run against
// whitespace-flattened source, so reflowing a paragraph cannot break a test
// about what the paragraph SAYS.
const flat = (p) => read(p).replace(/\s+/g, ' ');

const FILE = 'manifesto/index.html';
const PATH = '/manifesto/';

test.describe('manifesto: the promises', () => {
  test('our half states every commitment', () => {
    const html = flat(FILE);
    for (const phrase of [
      'never take a percentage of your fee',
      'never hold your money',
      'never rank you, or sell you',
      'never put anyone in front of you in exchange for money',
      'publish what we spent, where it came from',
      'leave with you in a form anyone can read',
      'grow this faster than we can keep it honest',
    ]) {
      expect(html, `a commitment has gone missing: ${phrase}`).toContain(phrase);
    }
  });

  test('your half states what is asked back', () => {
    const html = flat(FILE);
    for (const phrase of [
      'Keep your word',
      'Say the name of the invisible one',
      'Clap for whoever just went across the floor',
      'Take help without apologising',
      'hold the door',
    ]) {
      expect(html, `an ask has gone missing: ${phrase}`).toContain(phrase);
    }
  });

  test('we owe more than we ask', async ({ page }) => {
    // Not decoration. A covenant where the side holding the power owes the
    // shorter list is a terms-of-service with better typography.
    await gotoSettled(page, { path: PATH, waitForReady: false });
    const counts = await page.evaluate(() => {
      const out = {};
      let current = null;
      for (const el of document.querySelectorAll('main h2, main .vow')) {
        if (el.tagName === 'H2') { current = el.textContent.trim(); out[current] = 0; }
        else if (current) { out[current] += 1; }
      }
      return out;
    });
    expect(Object.keys(counts)).toEqual(['Our half', 'Your half']);
    expect(counts['Our half'], 'our half must not be the shorter list')
      .toBeGreaterThanOrEqual(counts['Your half']);
  });

  test('no placeholder ever reached the page', () => {
    const html = read(FILE);
    expect(html, 'an unfilled placeholder is published').not.toMatch(/[⟨⟩]/);
  });

  test('it carries no script and no loader', () => {
    const html = read(FILE);
    expect(html, 'the manifesto must stay a document').not.toMatch(/<script/i);
    expect(html, 'it must not wait on body.ready').not.toContain('id="loader"');
  });

  test('the home page footer links to it', () => {
    expect(read('index.html')).toContain('href="/manifesto/"');
  });
});

test.describe('manifesto: the page keeps the site laws', () => {
  test('zero external requests, no console errors', async ({ page }) => {
    const external = trackExternalRequests(page);
    const errors = trackConsoleErrors(page);
    await gotoSettled(page, { path: PATH, waitForReady: false });
    await expect(page).toHaveTitle(/Hold the Door/);
    expect(external, 'the manifesto reached off-origin').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('axe finds no serious or critical violations', async ({ page }) => {
    await gotoSettled(page, { path: PATH, waitForReady: false });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`)).toEqual([]);
  });

  test('one h1, no heading jumps, content in a main landmark', async ({ page }) => {
    await gotoSettled(page, { path: PATH, waitForReady: false });
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

  test('prose links are underlined, not colour alone', async ({ page }) => {
    await gotoSettled(page, { path: PATH, waitForReady: false });
    const decoration = await page.locator('.legal-footer .fine a').first()
      .evaluate(el => getComputedStyle(el).textDecorationLine);
    expect(decoration).toContain('underline');
  });

  test('the vows are set apart, not run together as prose', async ({ page }) => {
    await gotoSettled(page, { path: PATH, waitForReady: false });
    const border = await page.locator('.vow').first()
      .evaluate(el => getComputedStyle(el).borderLeftWidth);
    expect(border, 'the .manifesto scope is not applying').not.toBe('0px');
  });
});
