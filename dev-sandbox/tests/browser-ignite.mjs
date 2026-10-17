import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5188');
  await page.waitForFunction(() => window.store);
  const skip = page.getByRole('button', { name: 'Go to room' });
  if (await skip.count()) await skip.click();
  await page.evaluate(() => {
    const store = window.store;
    for (const kind of ['arDevice','vrDevice','igniteLogo','fireplace']) {
      const id = store.addItem({ title: kind, sourceRef: 'https://example.com', kind });
      store.place(id, store.freeSlotIds()[0] ?? store.layout.slots[0].id);
    }
  });
  await page.waitForTimeout(400);
  const canvas = page.locator('#room canvas');
  assert.equal(await canvas.count(), 1);
  await page.screenshot({ path: '/home/dvgpro/.hermes/cache/scratch/ignite-objects.png' });
  const kinds = await page.evaluate(() => window.store.state.representations.map((r) => r.objectKind));
  for (const kind of ['arDevice','vrDevice','igniteLogo','fireplace']) assert.ok(kinds.includes(kind));
  console.log('PASS: ignite objects placed in desktop room');
} finally { await browser.close(); }
