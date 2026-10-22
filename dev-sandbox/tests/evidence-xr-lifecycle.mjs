// Evidence capture for the reconciled PR #85 / #86 XR lifecycle work.
// Real Chromium + WebGL, SYNTHETIC WebXR only. This is NOT headset evidence.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.env.EVIDENCE_DIR ?? '/home/dvgpro/.hermes/cache/scratch/xr-lifecycle-evidence';
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5321/dev/');
  await page.waitForFunction(() => window.store);
  const shots = await page.evaluate(async () => {
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:600px;height:450px'; document.body.append(host);
    const store = new Store(newRoom()), room = new RoomView(host, store);
    room.renderer.setAnimationLoop(null);
    room.xr.onStart();
    const panel = room.xr.panel;
    const png = () => panel.canvas.toDataURL('image/png');
    const press = (id) => {
      for (let i = 0; i < 60; i++) {
        const b = panel.shown.find(b => b.id === id);
        if (b) { panel.activate({ x: b.x / 1024, y: 1 - b.y / 1408 }); return; }
        const n = panel.shown.find(b => b.id === 'ui:next');
        if (n) { panel.activate({ x: n.x / 1024, y: 1 - n.y / 1408 }); continue; }
        if (panel.scroll > 0) { panel.scroll = 0; panel.redraw(); continue; }
        throw new Error('unreachable: ' + id);
      }
      throw new Error('loop: ' + id);
    };
    const out = {};

    // 1. PR #85: validation error painted in the world-space header.
    panel.show('create');
    press('create:submit');
    out.validationError = png();

    // 2. PR #86: Caps-on keyboard shows uppercase glyphs.
    panel.show('create');
    press('create:field-title');
    press('key:caps');
    out.capsKeyboard = png();

    // 3. PR #86: mixed-case title + full URL symbol set typed through the keyboard.
    const type = (s) => { for (const c of s) { if (c === ' ') { press('key:space'); continue; } const up = /[A-Z]/.test(c); if (up !== panel.draft.caps) press('key:caps'); press('key:' + c); } };
    type('My Link');
    const title = panel.draft.title;
    press('create:field-text');
    const url = 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1';
    type(url);
    const typed = panel.draft.text;
    out.typedUrl = png();

    // 4. PR #85: completion screen is reachable immediately after a paginated submit.
    press('create:submit');
    const stored = store.state.contentItems.at(-1)?.sourceRef;
    out.completion = png();
    const completionIds = panel.shown.map(b => b.id);
    const scroll = panel.scroll;

    room.xr.onEnd(); room.renderer.dispose(); host.remove();
    return { out, title, typed, stored, completionIds, scroll };
  });
  const { out, ...facts } = shots;
  const paths = {};
  for (const [name, data] of Object.entries(out)) {
    const p = `${OUT}/${name}.png`;
    writeFileSync(p, Buffer.from(data.split(',')[1], 'base64'));
    paths[name] = p;
  }
  assert.equal(facts.title, 'My Link', 'capital letters must survive the world-space keyboard');
  assert.equal(facts.typed, 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1');
  assert.equal(facts.stored, facts.typed, 'the stored link must keep path/query/hash case');
  assert.ok(facts.completionIds.includes('create:done'), 'completion guidance must be on the visible page');
  assert.ok(facts.completionIds.includes('page:home'), 'Close must be on the visible page');
  assert.equal(facts.scroll, 0, 'pagination must clamp onto the short completion screen');
  assert.deepEqual(errors, []);
  console.log('PASS evidence captured (synthetic XR, not headset):', JSON.stringify({ ...facts, paths }, null, 2));
} finally { await browser.close(); }
