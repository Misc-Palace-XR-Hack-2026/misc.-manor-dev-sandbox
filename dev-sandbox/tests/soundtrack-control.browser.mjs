// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/soundtrack-control.browser.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      window.audioAttempts = [];
      HTMLMediaElement.prototype.play = function () {
        window.roomAudio = this;
        window.audioAttempts.push(navigator.userActivation.isActive);
        if (!navigator.userActivation.isActive) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
        return play.call(this);
      };
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173');
    const button = page.getByRole('button', { name: 'Unmute room music', exact: true });
    await button.waitFor({ timeout: 10000 });
    assert.equal(await button.getAttribute('data-sound-state'), 'muted');
    const saved = await page.evaluate(() => window.store.exportJson());
    if (mobile) await button.tap(); else await button.click();
    const mute = page.getByRole('button', { name: 'Mute room music', exact: true });
    await mute.waitFor();
    await page.waitForFunction(() => window.roomAudio.currentTime > 0 && !window.roomAudio.paused);
    assert.equal(await page.evaluate(() => window.audioAttempts.length), 2, 'one blocked autoplay plus one direct gesture');
    assert.equal(await page.evaluate(() => window.audioAttempts[1]), true);
    if (mobile) await mute.tap(); else { await mute.focus(); await page.keyboard.press('Space'); }
    await button.waitFor();
    assert.equal(await page.evaluate(() => window.roomAudio.paused), true);
    await page.locator('#room canvas').click({ position: { x: 20, y: 100 } });
    assert.equal(await page.evaluate(() => window.roomAudio.paused), true, 'room taps must not undo manual mute');
    assert.equal(await page.evaluate(() => window.store.exportJson()), saved);
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    for (const selector of ['.chrome', '.item-sheet']) {
      if (selector === '.item-sheet') await page.evaluate(() => window.store.select(window.store.state.representations[0].id));
      const other = await page.locator(selector).boundingBox();
      assert.ok(!other || box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y, `no overlap with ${selector}`);
    }
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/soundtrack-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.evaluate(() => window.store.setSoundtrack({ mode: 'off' }));
    const off = page.getByRole('button', { name: 'Room music is off — choose a track in Edit room', exact: true });
    assert.equal(await off.isDisabled(), true);
    assert.equal(await off.getAttribute('data-sound-state'), 'off');
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'Mobile tap' : 'Desktop click/keyboard'}: blocked → playing → muted; saved choice, off state, target size and overlay bounds PASS`);
    await context.close();
  }
} finally { await browser.close(); }
