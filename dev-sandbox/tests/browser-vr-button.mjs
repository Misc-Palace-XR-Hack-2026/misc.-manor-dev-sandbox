import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs');
const url = process.env.TEST_URL ?? 'http://127.0.0.1:5198';
const evidence = process.env.EVIDENCE_DIR ?? `${process.env.TMPDIR}/vr-button-evidence`;
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  for (const mobile of [false, true]) {
    for (const mode of ['missing', 'unsupported', 'pending', 'reject', 'supported']) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile });
      await context.addInitScript((mode) => {
        window.vrRequests = 0;
        Object.defineProperty(navigator, 'xr', { configurable: true, value: mode === 'missing' ? undefined : {
          addEventListener() {}, removeEventListener() {},
          isSessionSupported: (kind) => {
            if (kind !== 'immersive-vr') throw Error('wrong session type');
            if (mode === 'pending') return new Promise(resolve => { window.resolveVr = resolve; });
            if (mode === 'reject') return Promise.reject(Error('probe denied'));
            return Promise.resolve(mode === 'supported');
          },
          requestSession: async () => { window.vrRequests++; throw Error('mock session requested'); },
        } });
      }, mode);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      const button = page.locator('.vr-enter');
      await button.waitFor({ state: 'attached' });
      await page.waitForTimeout(300);
      if (mode === 'supported') {
        assert.equal(await button.isVisible(), true);
        assert.equal(await button.isEnabled(), true);
        await button.click({ force: true });
        await page.waitForFunction(() => window.vrRequests === 1);
      } else {
        assert.equal(await button.isVisible(), false);
        assert.equal(await button.evaluate(b => b.getClientRects().length), 0, 'no blank button box');
        await page.screenshot({ path: `${evidence}/${mobile ? 'mobile' : 'desktop'}-${mode}.png` });
        if (mode === 'pending') {
          await page.evaluate(() => window.resolveVr(true));
          await button.waitFor({ state: 'visible' });
          assert.equal(await button.isEnabled(), true);
        }
      }
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ url, mobile, mode, passed: true }));
      await context.close();
    }
  }
} finally { await browser.close(); }
