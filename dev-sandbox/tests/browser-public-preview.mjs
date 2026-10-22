import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.MP_URL;
assert.ok(base?.startsWith('https:'), 'MP_URL must be the isolated HTTPS test app');
const out = process.env.PREVIEW_ARTIFACTS ?? 'artifacts/issue65';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
const results = [];
try {
  for (const [name, viewport, isMobile] of [['desktop', { width: 1280, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
    const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const failures = [], messages = [];
    page.on('requestfailed', r => failures.push({ url: r.url(), error: r.failure()?.errorText }));
    page.on('console', m => messages.push(m.text()));
    await page.goto(base);
    await page.waitForFunction(() => window.store);
    const skip = page.getByRole('button', { name: 'Go to room' });
    if (await skip.count()) await skip.click();
    await page.evaluate(async () => {
      const { PreviewCardView } = await import('/src/views/preview-card.ts');
      const host = document.createElement('div'); host.id = 'policy-preview'; document.body.append(host);
      window.policyCard = new PreviewCardView(host);
      Object.assign(window.policyCard.root.style, { position: 'fixed', top: '20px', left: '20px', bottom: 'auto', right: 'auto', transform: 'none', zIndex: '10000', width: '300px' });
      window.policyShow = async sourceRef => {
        const { buildPreview } = await import('/src/core/preview.ts');
        const preview = buildPreview({ id: 'policy', type: 'link', title: 'Public website preview', sourceKind: 'url', sourceRef, tags: [], createdAt: '2026-01-01' });
        window.policyCard.show(preview);
        return preview;
      };
    });
    const show = url => page.evaluate(url => window.policyShow(url), url);
    const root = page.locator('#policy-preview');
    const checkOpen = async expected => {
      const link = root.getByRole('link', { name: 'Open in browser' });
      assert.ok(await link.isVisible()); assert.equal(await link.getAttribute('href'), expected);
      assert.equal(await link.getAttribute('target'), '_blank'); assert.match(await link.getAttribute('rel'), /noopener noreferrer/);
      const box = await link.boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'Open stays inside viewport');
    };
    // Deterministic HTTPS responses, still subject to Chromium's actual frame policy engine.
    const fixture = 'https://outside-allowlist.example.com';
    await page.route(`${fixture}/frameable`, r => r.fulfill({ contentType: 'text/html', body: '<h1>Frameable public fixture</h1><script>try{parent.document.body.dataset.escaped="yes"}catch{document.body.dataset.isolated="yes"}</script>' }));
    assert.equal((await show(`${fixture}/frameable`)).provider, 'page');
    await page.frameLocator('#policy-preview iframe').getByRole('heading', { name: 'Frameable public fixture' }).waitFor();
    assert.equal(await page.frameLocator('#policy-preview iframe').locator('body').getAttribute('data-isolated'), 'yes');
    assert.equal(await root.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
    assert.match(await root.innerText(), /Blank\?/, 'load must not claim success');
    await checkOpen(`${fixture}/frameable`);
    await page.screenshot({ path: `${out}/${name}-frameable.png` });
    const popupPromise = page.waitForEvent('popup'); await root.getByRole('link').click();
    const popup = await popupPromise; await popup.waitForLoadState(); assert.equal(await popup.evaluate(() => window.opener), null); await popup.close();
    for (const [kind, headers] of [['xfo', { 'x-frame-options': 'DENY' }], ['csp', { 'content-security-policy': "frame-ancestors 'none'" }]]) {
      const url = `${fixture}/${kind}`;
      await page.route(url, r => r.fulfill({ contentType: 'text/html', headers, body: '<h1>Forbidden content</h1>' }));
      await show(url);
      await page.waitForFunction(() => document.querySelector('#policy-preview .preview-text')?.textContent.includes('Blank?'));
      assert.equal(await page.frameLocator('#policy-preview iframe').getByText('Forbidden content').count(), 0);
      assert.ok(failures.some(f => f.url === url && f.error === 'net::ERR_BLOCKED_BY_RESPONSE'), `${kind} enforced`);
      await checkOpen(url); await page.screenshot({ path: `${out}/${name}-${kind}.png` });
    }
    await page.route(`${fixture}/failed`, r => r.abort('failed'));
    await show(`${fixture}/failed`); await page.waitForTimeout(300); await checkOpen(`${fixture}/failed`);
    await root.locator('iframe').evaluate(frame => frame.dispatchEvent(new Event('error')));
    assert.match(await root.innerText(), /could not load/i);
    // Same-origin redirects cannot be stopped by URL syntax, but stay opaque and cannot access parent DOM.
    await page.route(`${fixture}/redirect`, r => r.fulfill({ status: 302, headers: { location: `${base}/tests/fixtures/page-preview.html` } }));
    await show(`${fixture}/redirect`);
    await page.frameLocator('#policy-preview iframe').getByRole('heading', { name: 'Redirect rendered' }).waitFor();
    assert.equal(await page.frameLocator('#policy-preview iframe').locator('body').getAttribute('data-isolated'), 'yes');
    assert.equal(await page.locator('body').getAttribute('data-escaped'), null);
    await checkOpen(`${fixture}/redirect`);
    await page.route(`${fixture}/insecure`, r => r.fulfill({ status: 302, headers: { location: 'http://example.com/insecure' } }));
    await show(`${fixture}/insecure`); await page.waitForTimeout(800);
    assert.ok(messages.some(m => /Mixed Content/.test(m)), 'HTTPS parent enforces mixed-content redirect refusal');
    await checkOpen(`${fixture}/insecure`);
    for (const [url, expectedOpen] of [
      ['http://example.com/', 'http://example.com/'],
      ['https://youtube.com/@channel', 'https://youtube.com/@channel'],
      ['https://soundcloud.com/profile', 'https://soundcloud.com/profile'],
      ['https://127.1/', 'https://127.0.0.1/'],
      [`${base}/same-origin`, `${base}/same-origin`],
      ['https://github.com/a/b', 'https://github.com/a/b'],
      ['https://distrokid.com/hyperfollow/x', 'https://distrokid.com/hyperfollow/x'],
    ]) {
      assert.equal((await show(url)).kind, 'card'); assert.equal(await root.locator('iframe').count(), 0);
      // A card is never a dead end: title, domain and the external handoff stay on screen.
      assert.ok((await root.innerText()).trim().length > 0, `card not blank: ${url}`);
      await checkOpen(expectedOpen);
    }
    // A scheme we refuse to navigate to must not become an href at all.
    assert.equal((await show('javascript:alert(1)')).kind, 'card');
    assert.equal(await root.getByRole('link').count(), 0);
    await page.screenshot({ path: `${out}/${name}-card-fallback.png` });
    // Real public network document outside the old list: classify from frame DOM, not onload.
    const live = 'https://example.com/'; await show(live);
    let liveResult;
    try {
      await page.frameLocator('#policy-preview iframe').getByText('This domain is for use in documentation examples', { exact: false }).waitFor({ timeout: 20000 });
      liveResult = 'rendered documentation paragraph in real example.com cross-origin document';
    } catch { liveResult = 'unavailable on this network; fixture result is not live-site evidence'; }
    await checkOpen(live); await page.screenshot({ path: `${out}/${name}-live-example.png` });
    results.push({ name, viewport, live, liveResult, fixtureCases: ['frameable opaque sandbox', 'CSP refusal', 'XFO refusal', 'load not success', 'failure guidance', 'Open noopener', 'same-origin redirect isolation', 'mixed-content redirect refusal', 'HTTP/channel/profile/private/same-origin/blocklist card fallback with Open', 'unsafe scheme has no link'], failures, messages: messages.filter(m => /Mixed Content|frame|sandbox/i.test(m)) });
    await context.close();
  }
  await writeFile(`${out}/browser-public-preview.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(({ name, liveResult, fixtureCases }) => ({ name, liveResult, fixtureCases })), null, 2));
} finally { await browser.close(); }
