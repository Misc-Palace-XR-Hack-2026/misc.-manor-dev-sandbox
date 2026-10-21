import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const origin = process.env.OMARI_ORIGIN ?? 'http://127.0.0.1:5243/dev/';
const evidence = process.env.OMARI_EVIDENCE ?? '/home/dvgpro/.hermes/cache/scratch/omari-room-evidence';
mkdirSync(evidence, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  // The app does not expose its THREE renderer, so count real GPU draw calls at the WebGL boundary.
  await page.addInitScript(() => {
    window.__glCalls = 0;
    for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
      if (!proto) continue;
      for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const orig = proto[m];
        if (!orig) continue;
        proto[m] = function (...args) { window.__glCalls++; return orig.apply(this, args); };
      }
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.waitForFunction(() => window.store);
  await page.evaluate(() => localStorage.setItem('mp-sandbox:active-room', 'omari'));
  await page.reload();
  await page.waitForFunction(() => window.store?.state.contentItems.length === 38);

  // The room really is full and really is all spoons.
  assert.equal(await page.evaluate(() => window.store.state.placements.length), 38);
  assert.equal(await page.evaluate(() => window.store.freeSlotIds().length), 0);
  assert.equal(
    await page.evaluate(() => window.store.state.representations.filter((r) => r.objectKind === 'spoon').length),
    38,
  );

  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${evidence}/omari-desktop.png` });

  // Draw-call / frame cost with 38 objects in the scene.
  const perf = await page.evaluate(async () => {
    const frames = [];
    const callsPerFrame = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        callsPerFrame.push(window.__glCalls);
        window.__glCalls = 0;
        if (++n >= 120) return resolve();
        requestAnimationFrame(tick);
      };
      window.__glCalls = 0;
      requestAnimationFrame(tick);
    });
    frames.shift();
    callsPerFrame.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    const drawn = callsPerFrame.filter((c) => c > 0);
    return {
      drawCallsMedian: drawn.length ? drawn.sort((a, b) => a - b)[Math.floor(drawn.length / 2)] : 0,
      drawCallsMax: drawn.length ? drawn[drawn.length - 1] : 0,
      meanMs: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2),
      p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      maxMs: +sorted[sorted.length - 1].toFixed(2),
      fps: +(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1),
      frames: frames.length,
    };
  });
  console.log('PERF', JSON.stringify(perf));

  // The hidden spoon is reachable and reads back its note and its link.
  await page.evaluate(() => window.store.select('omari-spoon-no-spoon-rep'));
  await page.waitForSelector('iframe[src*="XO0pcWxcROI"]', { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.store.content('omari-spoon-no-spoon').notes), 'There is no spoon');
  assert.equal(
    await page.evaluate(() => window.store.content('omari-spoon-no-spoon').sourceRef),
    'https://www.youtube.com/watch?v=XO0pcWxcROI',
  );
  const frameSrc = await page.evaluate(() => document.querySelector('iframe')?.getAttribute('src') ?? null);
  console.log('EMBED_SRC', frameSrc);
  assert.ok(String(frameSrc).includes('youtube-nocookie.com/embed/XO0pcWxcROI'), `embed src was ${frameSrc}`);
  // The inspector does not print notes, so read them back through the real content editor.
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  const notesField = page.getByLabel('Notes', { exact: true });
  await notesField.waitFor({ state: 'visible' });
  assert.equal(await notesField.inputValue(), 'There is no spoon');
  await page.waitForTimeout(2500); // let the YouTube player paint before the evidence shot
  await page.screenshot({ path: `${evidence}/omari-no-spoon-item.png` });
  await page.keyboard.press('Escape');

  // A neighbouring quote spoon reads back its own quote, not the Matrix note.
  await page.evaluate(() => window.store.select(null));
  await page.evaluate(() => window.store.select('omari-spoon-tao-rep'));
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'a quote spoon shows no video embed');
  const tao = await page.evaluate(() => window.store.content('omari-spoon-tao'));
  assert.ok(tao.notes.includes('Laozi'), tao.notes);
  assert.ok(!tao.notes.includes('There is no spoon'));
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await notesField.waitFor({ state: 'visible' });
  assert.equal(await notesField.inputValue(), tao.notes);
  assert.ok((await notesField.inputValue()).includes('The Tao that can be told'));
  await page.screenshot({ path: `${evidence}/omari-quote-item.png` });
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.store.select(null));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${evidence}/omari-desktop-clean.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${evidence}/omari-mobile.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow on mobile');
  await page.evaluate(() => window.store.select('omari-spoon-no-spoon-rep'));
  await page.waitForSelector('iframe[src*="XO0pcWxcROI"]', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${evidence}/omari-mobile-no-spoon.png` });

  assert.deepEqual(errors, []);
  console.log('OK omari browser verification');
} finally {
  await browser.close();
}
