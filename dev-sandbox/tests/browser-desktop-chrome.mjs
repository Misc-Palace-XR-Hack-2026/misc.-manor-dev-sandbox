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
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.store, { timeout: 5000 });
  const skip = page.getByRole('button', { name: 'Go to room' });
  if (await skip.count()) await skip.click();

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
  const rooms = page.getByTitle('Switch room');
  assert.equal(await edit.isVisible(), true);
  assert.equal(await rooms.isVisible(), true);
  assert.equal(await rooms.textContent(), 'Rooms');
  assert.equal(await page.getByRole('button', { name: 'Visit neighborhood', exact: true }).count(), 0);

  await edit.click();
  await page.waitForFunction(() => document.getElementById('menu')?.classList.contains('sheet-open'));
  await page.getByLabel('Lighting preset').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('menu')?.classList.contains('sheet-open'));

  await rooms.click();
  await page.getByRole('dialog', { name: 'Rooms' }).waitFor({ state: 'visible' });
  const firstRoomName = await page.evaluate(() => document.querySelector('.neighborhood-actions button')?.textContent?.trim() ?? null);
  assert.equal(firstRoomName, 'My room');
  await page.getByRole('button', { name: /Matt's room/i }).waitFor({ state: 'visible' });
  await page.getByRole('dialog', { name: 'Rooms' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Rooms"]')?.hidden === true);

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
  await page.evaluate(() => {
    const store = window.store;
    if (!store.state.representations[0]) store.addItem({ title: 'Chrome fixture', sourceRef: 'note:chrome', type: 'note', kind: 'book' });
    store.select(store.state.representations[0].id);
  });
  const item = page.getByRole('dialog', { name: /item/i });
  await item.waitFor({ state: 'visible' });
  assert.ok(await item.getByRole('button', { name: 'Pick up', exact: true }).count() >= 1);
  await page.screenshot({ path: '/home/dvgpro/.hermes/cache/scratch/desktop-chrome-review.png' });
  assert.deepEqual(errors.filter((m) => !/favicon/.test(m)), []);
  console.log('PASS: desktop uses overlay chrome; room fills the screen; Edit room / Rooms / item inspector work');
} finally {
  await browser.close();
}
