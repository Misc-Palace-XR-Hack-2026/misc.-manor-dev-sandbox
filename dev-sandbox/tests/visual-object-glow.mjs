// Visual review of animated object indicators. Runs against a Vite server serving THIS worktree
// (checked below), uses an isolated browser context and never touches personal saves.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs');
const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5199';
const out = resolve(process.env.ARTIFACT_DIR ?? 'artifacts/object-glow');
await mkdir(out, { recursive: true });

// Guard against another worktree's dev server answering on this port.
const served = await (await fetch(`${base}/src/views/glow.ts`)).text();
assert.ok(served.includes('glowWave'), 'the server on this port does not serve this worktree');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const errors = [], screenshots = [], checks = [];
const kinds = (process.env.MODEL_KINDS ?? 'flyingSaucer,lavaLamp,tv,console,boombox,synthesizer,robot,coffeeMaker,lantern').split(',');
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/__glow_review', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<html><body style="margin:0;background:#101014"><div id="label" style="position:fixed;top:20px;left:20px;font:18px sans-serif;color:#eee"></div></body></html>',
  }));
  await page.goto(`${base}/__glow_review`);
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { buildObject } = await import('/src/views/objects.ts');
    const { animateIgnite } = await import('/src/views/ignite-objects.ts');
    const { applyLampLightBudget } = await import('/src/views/cozy-objects.ts');
    const { disposeGroup } = await import('/src/views/resources.ts');
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb6b2aa, 2);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0xffffff, 1); fill.position.set(-3, 2, -3);
    scene.add(hemi, key, fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xd1cec7, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; scene.add(floor);
    // Back and side walls so a local light has something to spill onto in the dark scene.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc9c0, roughness: 1 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), wallMat); back.position.set(0, 2, -0.9); scene.add(back);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), wallMat); side.rotation.y = Math.PI / 2; side.position.set(-0.9, 2, 0); scene.add(side);
    back.visible = side.visible = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(720, 720); document.body.append(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-0.65, 0.65, 0.65, -0.65, 0.01, 100);
    let model;
    const place = (kind) => {
      if (model) { scene.remove(model); disposeGroup(model); }
      model = buildObject(kind);
      scene.add(model);
      applyLampLightBudget(scene);
      return model;
    };
    window.renderModel = (kind, view, t, dark) => {
      if (!model || model.userData.kind !== kind || dark !== undefined) { place(kind); model.userData.kind = kind; }
      hemi.intensity = dark ? 0.035 : 2; key.intensity = dark ? 0.05 : 2.4; fill.intensity = dark ? 0 : 1;
      scene.background = new THREE.Color(dark ? '#07070b' : '#e8e5df');
      back.visible = side.visible = Boolean(dark);
      animateIgnite(model, t);
      const bounds = new THREE.Box3().setFromObject(model), target = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const half = Math.max(size.x, size.y, size.z) * (dark ? 1.5 : 0.72);
      camera.left = camera.bottom = -half; camera.right = camera.top = half; camera.updateProjectionMatrix();
      const offset = view === 'front' ? [0, 0, 4] : view === 'side' ? [4, 0, 0] : [3, 2.1, 3];
      camera.position.copy(target).add(new THREE.Vector3(...offset)); camera.lookAt(target);
      renderer.render(scene, camera);
      document.querySelector('#label').textContent = `${kind} / ${view} / t=${t}${dark ? ' / dark room' : ''}`;
      let lightIntensity = 0;
      model.traverse((o) => { if (o.isPointLight) lightIntensity = o.intensity; });
      return { kind, view, t, dark: Boolean(dark), lightIntensity, triangles: renderer.info.render.triangles };
    };
    // A crowd of glowing objects in one dark room: proof the shared lamp-light budget still caps
    // how many real lights burn when many lava lamps and table lamps are placed together.
    window.renderCrowd = (count, t) => {
      if (model) { scene.remove(model); disposeGroup(model); }
      model = new THREE.Group();
      for (let i = 0; i < count; i++) {
        const g = buildObject(i % 2 ? 'lavaLamp' : 'lamp');
        g.position.set((i - (count - 1) / 2) * 0.55, 0, 0);
        model.add(g);
      }
      scene.add(model);
      model.userData.kind = 'crowd';
      applyLampLightBudget(model);
      animateIgnite(model, t);
      hemi.intensity = 0.035; key.intensity = 0.05; fill.intensity = 0;
      scene.background = new THREE.Color('#07070b');
      back.visible = side.visible = true;
      const half = count * 0.32;
      camera.left = camera.bottom = -half; camera.right = camera.top = half; camera.updateProjectionMatrix();
      camera.position.set(0, 0.6, 4); camera.lookAt(0, 0.6, 0);
      renderer.render(scene, camera);
      document.querySelector('#label').textContent = `${count} glowing objects / dark room / t=${t}`;
      const intensities = [];
      model.traverse((o) => { if (o.isPointLight) intensities.push(Number(o.intensity.toFixed(3))); });
      return { count, intensities, lit: intensities.filter((v) => v > 0).length };
    };
    window.hideLight = (hide) => { model.traverse((o) => { if (o.isPointLight) o.visible = !hide; }); renderer.render(scene, camera); };
  });
  for (const kind of kinds) {
    for (const view of ['front', 'side', 'isometric']) {
      const info = await page.evaluate(({ kind, view }) => window.renderModel(kind, view, 2.0), { kind, view });
      assert.ok(info.triangles > 0);
      checks.push(info);
      const path = `${out}/${kind}-${view}.png`; await page.screenshot({ path }); screenshots.push(path);
    }
    // Two instants of the same model, front on: proof the indicators move.
    for (const t of [0, 0.9]) {
      const path = `${out}/${kind}-blink-t${t}.png`;
      await page.evaluate(({ kind, t }) => window.renderModel(kind, 'front', t), { kind, t });
      await page.screenshot({ path }); screenshots.push(path);
    }
  }
  // Dark room: lava lamp with and without its own PointLight.
  for (const [name, hide] of [['lit', false], ['light-off', true]]) {
    const info = await page.evaluate(() => window.renderModel('lavaLamp', 'front', 3.2, true));
    await page.evaluate((h) => window.hideLight(h), hide);
    checks.push({ darkScene: name, ...info });
    const path = `${out}/lavaLamp-dark-${name}.png`; await page.screenshot({ path }); screenshots.push(path);
  }
  // Crowd scene: many glowing objects at once, budget still capped.
  for (const t of [0, 4.5]) {
    const crowd = await page.evaluate((t) => window.renderCrowd(9, t), t);
    checks.push({ crowd: true, t, ...crowd });
    const path = `${out}/crowd-dark-t${t}.png`; await page.screenshot({ path }); screenshots.push(path);
  }
  await page.close();

  // The real room, desktop and mobile, in isolated contexts.
  const roomKinds = ['flyingSaucer', 'lavaLamp', 'tv', 'console'];
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
    const room = await context.newPage();
    room.on('pageerror', (e) => errors.push(String(e)));
    room.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await room.goto(base); await room.waitForFunction(() => !!window.store);
    const reps = await room.evaluate((kinds) => {
      const s = window.store;
      const slots = ['loft-2', 'loft-3', 'floor-3', 'floor-4'];
      return kinds.map((kind, i) => {
        const id = s.addItem({ title: `Glow review: ${kind}`, sourceRef: 'Indicator light fixture', type: 'note', kind: 'book' });
        s.setKind(id, kind); s.place(id, slots[i]); s.unplace(id);
        if (s.slotOf(id) !== undefined) throw new Error('pickup failed');
        s.place(id, slots[i]);
        if (s.slotOf(id) !== slots[i]) throw new Error('placement failed');
        return { id, kind, slot: slots[i] };
      });
    }, roomKinds);
    await room.reload(); await room.waitForFunction(() => !!window.store);
    const saved = await room.evaluate((reps) => reps.every((r) =>
      window.store.state.representations.some((x) => x.id === r.id && x.objectKind === r.kind) && window.store.slotOf(r.id) === r.slot), reps);
    assert.ok(saved, 'assigned kinds and placements survive reload');
    const toggle = room.locator('button').filter({ hasText: 'Hide menu' });
    if (await toggle.count()) await toggle.first().click();
    await room.waitForTimeout(1500);
    const path = `${out}/room-${device}.png`; await room.screenshot({ path }); screenshots.push(path);
    // Budget check inside the real running room.
    const budget = await room.evaluate(() => {
      const lights = [];
      window.room?.objectsGroup?.traverse?.((o) => { if (o.isPointLight && o.name === 'lamp-light') lights.push(o.intensity); });
      return lights;
    });
    checks.push({ device, saved, budgetLights: budget, representations: reps });
    for (const rep of reps) {
      await room.evaluate((id) => window.store.select(id), rep.id);
      await room.waitForTimeout(900);
      const p = `${out}/room-${device}-${rep.kind}.png`; await room.screenshot({ path: p }); screenshots.push(p);
      await room.getByRole('button', { name: 'Pick up', exact: true }).click();
      assert.equal(await room.evaluate((id) => window.store.slotOf(id) ?? null, rep.id), null, 'real UI pickup removes placement');
      await room.evaluate(({ id, slot }) => window.store.place(id, slot), rep);
      assert.equal(await room.evaluate((id) => window.store.slotOf(id), rep.id), rep.slot, 'object can be placed again');
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(`${out}/results.json`, JSON.stringify({ base, errors, checks, screenshots }, null, 2));
  console.log(JSON.stringify({ errors, screenshotCount: screenshots.length, out }, null, 2));
} finally { await browser.close(); }
