import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => window.store, { timeout: 5000 });

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    room: document.getElementById('room').getBoundingClientRect(),
    menu: (() => {
      const el = document.getElementById('menu');
      const box = el.getBoundingClientRect();
      return { ...box.toJSON?.() ?? { width: box.width, bottom: box.bottom, top: box.top }, visibility: getComputedStyle(el).visibility };
    })(),
    chrome: document.querySelector('.chrome')?.getBoundingClientRect(),
  }));
  assert.ok(layout.scrollWidth <= layout.innerWidth + 1, `horizontal overflow ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.ok(layout.room.width >= 1200, `room should fill the desktop, got ${layout.room.width}`);
  assert.ok(layout.room.height >= 900, `room should fill the desktop, got ${layout.room.height}`);
  assert.ok(layout.menu.width < 200 || layout.menu.bottom <= 0 || layout.menu.visibility === 'hidden', 'left menu must not stay on screen');

  const edit = page.getByRole('button', { name: 'Edit room', exact: true });
  const neighborhood = page.getByRole('button', { name: 'Visit neighborhood', exact: true });
  assert.equal(await edit.isVisible(), true);
  assert.equal(await neighborhood.isVisible(), true);

  await edit.click();
  await page.waitForFunction(() => document.getElementById('menu')?.classList.contains('sheet-open'));
  await page.getByLabel('Lighting preset').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('menu')?.classList.contains('sheet-open'));

  await neighborhood.click();
  await page.getByRole('button', { name: /Visit greenhouse conservatory/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close neighborhood', exact: true }).click();

  // Reproduce selection after the user has orbited, panned and zoomed.
  await page.mouse.move(720, 400);
  await page.mouse.down();
  await page.mouse.move(1050, 560, { steps: 20 });
  await page.mouse.up();
  await page.mouse.move(720, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(850, 480, { steps: 15 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.store.select(window.store.state.representations[0].id));
  const item = page.getByRole('dialog', { name: /item/i });
  await item.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const x = Number(document.getElementById('room')?.dataset.inspectX);
    const y = Number(document.getElementById('room')?.dataset.inspectY);
    return x > 0.42 && x < 0.58 && y > 0.42 && y < 0.58;
  }, { timeout: 4000 });
  await page.screenshot({ path: '/home/dvgpro/.hermes/cache/scratch/desktop-chrome-review.png' });
  assert.deepEqual(errors.filter((m) => !/favicon/.test(m)), []);
  console.log('PASS: desktop uses overlay chrome; room fills the screen; inspect card frames the object');
} finally {
  await browser.close();
}
