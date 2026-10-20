// Manual browser check: the fish and the lava actually move inside the real room render loop.
// Runs against an existing Vite server in an isolated context; never touches personal saves and adds
// no production hooks. Motion is proven by comparing two frames 2.5 s apart against a control frame
// pair of the same room with the toys stashed away.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs');
const base = process.env.PREVIEW_URL ?? 'http://localhost:5173';
const out = resolve(process.env.ARTIFACT_DIR ?? `${homedir()}/.hermes/artifacts/misc-palace-toy-animation`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const errors = [], report = [];
try {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
    const room = await context.newPage();
    room.on('pageerror', (e) => errors.push(String(e)));
    room.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await room.goto(base);
    await room.waitForFunction(() => !!window.store);
    const pair = async (tag) => {
      await room.waitForTimeout(700);
      const a = await room.screenshot({ path: `${out}/animation-${device}-${tag}-a.png` });
      await room.waitForTimeout(2500);
      const b = await room.screenshot({ path: `${out}/animation-${device}-${tag}-b.png` });
      return !a.equals(b);
    };
    const reps = await room.evaluate(() => ['fishBowl', 'lavaLamp'].map((kind, i) => {
      const s = window.store, slot = ['loft-2', 'loft-3'][i];
      const id = s.addItem({ title: `Animation check: ${kind}`, sourceRef: 'Toy animation fixture', type: 'note', kind: 'book' });
      s.setKind(id, kind);
      s.place(id, slot);
      return { id, kind, slot };
    }));
    await room.reload();
    await room.waitForFunction(() => !!window.store);
    const moving = await pair('toys-placed');
    await room.evaluate((ids) => ids.forEach((id) => window.store.unplace(id)), reps.map((r) => r.id));
    const control = await pair('toys-stashed');
    assert.ok(moving, `placed fish bowl and lava lamp animate on ${device}`);
    assert.ok(!control, `the same room without them is static on ${device}, so the motion is the toys`);
    report.push({ device, movingFramesDiffer: moving, controlFramesDiffer: control, reps });
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(`${out}/animation-results.json`, JSON.stringify({ base, errors, report }, null, 2));
  console.log(JSON.stringify({ errors, report }, null, 2));
} finally { await browser.close(); }
