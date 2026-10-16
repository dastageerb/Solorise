import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const exe = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1818, height: 854 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => document.querySelectorAll('article').length > 0, { timeout: 10_000 });

const m = await page.evaluate(() => {
  const lane = document.querySelector('section[aria-label="Backlog"]');
  const body = lane.lastElementChild;
  const board = lane.parentElement;
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
  };
  return {
    viewportH: window.innerHeight,
    lane: r(lane),
    board: r(board),
    // How much lane content is hidden behind the scroll?
    hiddenContent: body.scrollHeight - body.clientHeight,
    // Space between the bottom of the board and the bottom of the window.
    deadSpaceBelowBoard: window.innerHeight - r(board).bottom,
    // Everything above the board, which the 300px offset is meant to cover.
    chromeAboveBoard: r(board).top,
  };
});

console.log(JSON.stringify(m, null, 2));
console.log(
  `\nproposed lane height = 100vh - ${m.chromeAboveBoard + 32}px  (chrome above board + a 32px bottom gutter)`,
);
await browser.close();
