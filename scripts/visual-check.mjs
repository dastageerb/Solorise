/**
 * Visual check: drives the running server with the locally installed Chrome and
 * writes screenshots plus a computed-style audit.
 *
 * DESIGN.md §7 asks for screenshot review, and a green build proves nothing about
 * rendering — see DECISIONS.md D14. Run with the server up:
 *
 *   npm start
 *   node scripts/visual-check.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = '.verify';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge binary found. Set CHROME=/path/to/chrome.');
  process.exit(1);
}

const SHOTS = [
  { name: 'board', path: '/board', width: 1600, height: 1000 },
  { name: 'board-narrow', path: '/board', width: 1180, height: 900 },
  { name: 'board-editor', path: '/board', width: 1600, height: 1000, openEditor: true },
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});

const report = [];

for (const shot of SHOTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: shot.width, height: shot.height });
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle2' });

  /* Wait for the store to hydrate real cards, not just for the paint. */
  await page
    .waitForFunction(() => document.querySelectorAll('article').length > 0, { timeout: 10_000 })
    .catch(() => {});

  if (shot.openEditor) {
    /* Target the primary button specifically: the rail also has a "New issue"
       button, and matching on text alone silently picks the wrong one. */
    const btn = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('New ticket'),
      ) ?? null,
    );
    if (btn.asElement()) await btn.asElement().click();
    else console.warn('warn: could not find the New issue button');
    await page.waitForSelector('dialog[open]', { timeout: 5000 }).catch(() => {
      console.warn('warn: editor dialog did not open');
    });
  }

  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  report.push(`shot  ${shot.name}.png`);
  await page.close();
}

/* --------------------------------------------------------- computed audit */

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto(`${BASE}/board`, { waitUntil: 'networkidle2' });
/* Guarded: a missed wait should still produce the audit, not abort the run. */
await page
  .waitForFunction(() => document.querySelectorAll('article').length > 0, { timeout: 10_000 })
  .catch(() => console.warn('warn: no cards appeared before the audit timeout'));

const audit = await page.evaluate(() => {
  const seen = new Set();
  const shadows = new Set();
  const radii = new Set();
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) {
      const v = cs[prop];
      if (v && v !== 'rgba(0, 0, 0, 0)') seen.add(v);
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') shadows.add(cs.boxShadow);
    if (cs.borderRadius && cs.borderRadius !== '0px') radii.add(cs.borderRadius);
  }
  const lanes = Array.from(document.querySelectorAll('section[aria-label]'));
  return {
    cards: document.querySelectorAll('article').length,
    tagChips: document.querySelectorAll('.chip-tag').length,
    laneGeom: lanes.map((l) => {
      const r = l.getBoundingClientRect();
      return { label: l.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
    }),
    colours: Array.from(seen).sort(),
    shadows: Array.from(shadows),
    radii: Array.from(radii).sort(),
  };
});

await browser.close();

console.log(report.join('\n'));
console.log(`\ncards rendered: ${audit.cards}`);
console.log(`tag chips rendered: ${audit.tagChips}`);
console.log('\nlanes (equal width + height is the goal):');
audit.laneGeom.forEach((l) => console.log(`  ${String(l.label).padEnd(14)} ${l.w} x ${l.h}`));
console.log('\ndistinct colours in use:');
console.log(audit.colours.join('\n'));
console.log('\nbox shadows in use:');
console.log(audit.shadows.join('\n') || '(none)');
console.log('\nborder radii in use:');
console.log(audit.radii.join('\n'));
