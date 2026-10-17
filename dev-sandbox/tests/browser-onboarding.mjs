import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.store && window.tutorial);
  assert.equal(await page.getByRole('button', { name: 'Start tutorial' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Go to room' }).isVisible(), true);
  await page.screenshot({ path: '/home/dvgpro/.hermes/cache/scratch/welcome-desktop.png' });
  await page.getByRole('button', { name: 'Start tutorial' }).click();
  await page.getByText('1 of 5').waitFor();
  const firstBox = await page.locator('.tutorial-highlight').boundingBox();
  assert.ok(firstBox && firstBox.width > 20);
  await page.locator('.fab').click();
  await page.getByRole('button', { name: 'Add object' }).click();
  await page.getByText('2 of 5').waitFor();
  await page.waitForFunction(() => {
    const title = document.querySelector('#new-object-title')?.getBoundingClientRect();
    const highlight = document.querySelector('.tutorial-highlight')?.getBoundingClientRect();
    return Boolean(title && highlight && Math.abs(highlight.x - (title.x - 6)) < 8 && Math.abs(highlight.y - (title.y - 6)) < 8);
  });
  const titleSize = await page.locator('#new-object-title').evaluate((el) => Number(getComputedStyle(el).fontSize.replace('px', '')));
  const refSize = await page.locator('#new-object-ref').evaluate((el) => Number(getComputedStyle(el).fontSize.replace('px', '')));
  assert.ok(titleSize >= 16, `title font-size ${titleSize} must be >= 16px so iOS does not zoom`);
  assert.ok(refSize >= 16, `content font-size ${refSize} must be >= 16px so iOS does not zoom`);
  await page.locator('#new-object-title').fill('Practice link');
  await page.getByText('3 of 5').waitFor();
  await page.locator('#new-object-ref').fill('https://example.com');
  await page.getByText('4 of 5').waitFor();
  await page.locator('[data-tutorial="add-submit"]').click();
  await page.getByText('5 of 5').waitFor();
  const placed = await page.evaluate(() => window.store.state.placements.length);
  assert.ok(placed >= 1);
  await page.evaluate(() => window.tutorial.notice('placed'));
  await page.waitForFunction(() => !window.tutorial.state.lesson);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByText('1 of 5').waitFor();
  await page.getByRole('button', { name: 'Skip / Exit' }).click();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobile.addInitScript(() => localStorage.clear());
  const phone = await mobile.newPage();
  await phone.goto(process.env.MP_URL ?? 'http://127.0.0.1:5173');
  await phone.waitForFunction(() => window.tutorial);
  assert.equal(await phone.getByRole('button', { name: 'Start tutorial' }).isVisible(), true);
  await phone.getByRole('button', { name: 'Go to room' }).click();
  assert.equal(await phone.locator('.tutorial-overlay').isHidden(), true);
  await phone.screenshot({ path: '/home/dvgpro/.hermes/cache/scratch/welcome-mobile-skip.png' });
  console.log('PASS: welcome, action-gated create tutorial, skip/replay on desktop and mobile');
} finally {
  await browser.close();
}
