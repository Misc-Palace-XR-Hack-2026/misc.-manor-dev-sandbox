// Real Chromium WebGL + synthetic XR: the VR scenery must stand on the public build's own anchors
// and still be reachable by a controller ray from inside the room. Not headset evidence.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.MP_EVIDENCE ?? '/tmp/vr-anchor-evidence';
mkdirSync(evidence, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium', headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5547/dev/');
  await page.waitForFunction(() => window.store);

  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const { REPO_ROOMS } = await import('/src/core/repo-rooms.ts');
    const { JUKEBOX_POS, SAVE_POINT_POS } = await import('/src/core/intro-timeline.ts');
    const { spawnPosition } = await import('/src/xr/interaction.ts');

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:999;width:1280px;height:900px';
    document.body.append(host);
    const store = new Store(newRoom(), 'vr-anchor-proof');
    const view = new RoomView(host, store, REPO_ROOMS);
    view.renderer.setAnimationLoop(null);
    const xr = view.xr;
    xr.onStart();
    xr.camera.aspect = 1280 / 900;
    xr.camera.updateProjectionMatrix();
    xr.scene.updateMatrixWorld(true);

    const world = (model) => model.group.getWorldPosition(new THREE.Vector3()).toArray().map(n => Math.round(n * 1000) / 1000);
    const anchors = {
      portal: { at: world(xr.amenities.portal), expected: [...SAVE_POINT_POS] },
      jukebox: { at: world(xr.amenities.jukebox), expected: [...JUKEBOX_POS] },
    };
    const jukeboxScale = xr.amenities.jukebox.group.scale.x;
    const jukeboxFacing = Math.round(xr.amenities.jukebox.group.rotation.y * 1000) / 1000;

    // Reach: aim from the spawn point and from the room's own floor at each model.
    const controller = xr.controllers[0];
    controller.matrixAutoUpdate = true;
    const spawn = spawnPosition();
    const reach = {};
    for (const kind of ['portal', 'jukebox']) {
      const target = xr.amenities[kind].group.position.clone().add(new THREE.Vector3(0, 1, 0));
      xr.player.position.set(spawn.x, spawn.y, spawn.z);
      controller.position.set(0, 1.5, 0);
      xr.scene.updateMatrixWorld(true);
      controller.lookAt(target);
      controller.rotateY(Math.PI);
      xr.scene.updateMatrixWorld(true);
      const hit = xr.pick(controller);
      const from = controller.getWorldPosition(new THREE.Vector3());
      reach[kind] = { hit: hit?.kind ?? null, distance: Math.round(from.distanceTo(target) * 100) / 100 };
    }
    // A viewpoint that frames both pieces of scenery for the screenshot.
    xr.player.position.set(spawn.x, spawn.y, spawn.z);
    xr.camera.position.set(7.2, 2.6, 6.4);
    xr.camera.lookAt(9.5, 1.2, 2.6);
    view.renderer.render(view.scene, xr.camera);
    return { anchors, jukeboxScale, jukeboxFacing, reach, gl: view.renderer.getContext().getParameter(0x1F02) };
  });

  for (const [kind, { at, expected }] of Object.entries(result.anchors)) {
    assert.deepEqual(at, expected, `${kind} stands on the public build's anchor`);
  }
  assert.equal(result.jukeboxScale, 0.6, 'jukebox uses the public build scale');
  assert.equal(result.jukeboxFacing, Math.round(-Math.PI / 2 * 1000) / 1000, 'jukebox faces into the room');
  for (const [kind, { hit, distance }] of Object.entries(result.reach)) {
    assert.equal(hit, kind, `${kind} is still selectable by a controller ray from the spawn point`);
    assert.ok(distance <= 10, `${kind} is inside the 10m controller ray (was ${distance}m)`);
  }
  assert.deepEqual(errors, []);

  await page.screenshot({ path: `${evidence}/vr-amenity-anchors.png` });
  console.log('PASS VR scenery on production anchors, reachable by controller', result, evidence);
} finally {
  await browser.close();
}
