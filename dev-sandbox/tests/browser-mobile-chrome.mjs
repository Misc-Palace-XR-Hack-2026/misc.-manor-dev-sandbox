import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const tap = async (locator) => {
  const box = await locator.boundingBox();
  assert.ok(box, 'missing tap target');
  assert.ok(box.height >= 44, `${await locator.textContent()} height ${box.height}`);
  assert.ok(box.width >= 44, `${await locator.textContent()} width ${box.width}`);
};

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => window.store, { timeout: 5000 });

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    room: document.getElementById('room').getBoundingClientRect(),
    menu: document.getElementById('menu').getBoundingClientRect(),
  }));
  assert.ok(layout.scrollWidth <= layout.innerWidth + 1, `horizontal overflow ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.ok(layout.room.width >= 350, `room should fill the phone, got ${layout.room.width}`);
  assert.ok(layout.room.height >= 600, `room should fill the phone, got ${layout.room.height}`);
  assert.ok(layout.menu.width < 200 || layout.menu.bottom <= 0 || layout.menu.top >= 844, 'left menu must not cover the phone');

  const edit = page.getByRole('button', { name: 'Edit room', exact: true });
  const neighborhood = page.getByRole('button', { name: 'Visit neighborhood', exact: true });
  await assert.equal(await edit.isVisible(), true);
  await assert.equal(await neighborhood.isVisible(), true);
  await tap(edit);
  await tap(neighborhood);

  await edit.click();
  await page.waitForFunction(() => document.getElementById('menu')?.classList.contains('sheet-open'));
  await page.getByLabel('Lighting preset').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('menu')?.classList.contains('sheet-open'));

  await neighborhood.click();
  await page.getByRole('button', { name: /Visit greenhouse conservatory/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close neighborhood', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.neighborhood-sheet')?.hidden === true);

  await page.evaluate(() => {
    const rep = window.store.state.representations[0];
    window.store.select(rep.id);
  });
  const item = page.getByRole('dialog', { name: /item/i });
  await item.waitFor({ state: 'visible' });
  assert.ok(await item.getByRole('button', { name: 'Pick up', exact: true }).count() + await item.getByRole('button', { name: 'Stash', exact: true }).count() >= 1);

  await page.waitForFunction(() => {
    const room = document.getElementById('room');
    const x = Number(room?.dataset.inspectX);
    const y = Number(room?.dataset.inspectY);
    return x > 0.42 && x < 0.58 && y > 0.42 && y < 0.58;
  }, { timeout: 4000 });
  const framed = await page.evaluate(() => {
    const room = document.getElementById('room');
    const sheet = document.querySelector('.item-sheet');
    const card = sheet.getBoundingClientRect();
    const bg = getComputedStyle(sheet).backgroundColor;
    const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    const alpha = m ? (m[4] === undefined ? 1 : Number(m[4])) : 1;
    const x = Number(room.dataset.inspectX);
    const y = Number(room.dataset.inspectY);
    const objX = x * 390;
    const objY = y * 844;
    const overlaps = objX > card.left + 8 && objX < card.right - 8 && objY > card.top + 8 && objY < card.bottom - 8;
    return {
      x, y, alpha,
      width: card.width,
      height: card.height,
      left: card.left,
      right: card.right,
      bottom: card.bottom,
      radius: getComputedStyle(sheet).borderRadius,
      overlaps,
    };
  });
  assert.ok(framed.x > 0.42 && framed.x < 0.58, `item should stay centered, got ${framed.x}`);
  assert.ok(framed.y > 0.42 && framed.y < 0.58, `item should stay centered, got y=${framed.y}`);
  assert.ok(framed.width < 320, `inspector should be a floating card, width=${framed.width}`);
  assert.ok(framed.height < 420, `inspector should be compact, height=${framed.height}`);
  assert.ok(framed.left > 24, `card should float off the left edge, left=${framed.left}`);
  assert.ok(framed.right < 390 - 8, `card should float inside the room, right=${framed.right}`);
  assert.ok(framed.alpha > 0.45 && framed.alpha < 0.92, `card should be dark glass, alpha=${framed.alpha}`);

  await page.screenshot({ path: '/home/dvgpro/.hermes/cache/scratch/mobile-chrome-review.png' });
  assert.deepEqual(errors.filter((m) => !/favicon/.test(m)), []);
  console.log('PASS: phone chrome leaves the room visible; Edit room and Visit neighborhood open sheets; item tap uses a modal');
} finally {
  await browser.close();
}
