// Real-browser check: the sandbox's prod shortcut is visible, unobstructed, and actually navigates
// to the public build, which in turn still offers the mirrored hop back into /dev/.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.MP_BASE ?? 'http://127.0.0.1:5546';
const out = process.env.MP_EVIDENCE ?? '/tmp/prod-link-evidence';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(`${base}/dev/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.store);

  const link = page.locator('a.app-prod');
  await link.waitFor({ state: 'visible' });
  assert.equal(await link.innerText(), 'prod');
  assert.equal(await link.getAttribute('title'), 'Public build');

  // Nothing may cover it: the element under its own centre must be the link itself.
  const box = await link.boundingBox();
  const onTop = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el?.classList.contains('app-prod') ?? false;
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  assert.ok(onTop, 'prod link is not covered by the chrome bar or other overlays');

  const chrome = await page.locator('nav.chrome').boundingBox();
  assert.ok(box.y + box.height <= chrome.y, 'prod link sits above the chrome bar, not on it');

  await page.screenshot({ path: `${out}/dev-prod-link.png` });

  // It navigates to the public build, and the public build still links back.
  await link.click();
  await page.waitForURL(url => !url.pathname.startsWith('/dev'), { timeout: 15000 });
  const devBack = page.locator('a.demo-dev');
  await devBack.waitFor({ state: 'attached', timeout: 15000 });
  assert.match(await devBack.getAttribute('href'), /\/dev\/$/, 'public build keeps the mirrored hop');
  await page.screenshot({ path: `${out}/prod-landing.png` });

  console.log('PASS sandbox prod shortcut: visible, unobstructed, navigates, mirrored both ways', {
    link: box, chromeTop: chrome.y, landedOn: new URL(page.url()).pathname, evidence: out,
  });
} finally {
  await browser.close();
}
