// Real Chromium WebGL, synthetic XR lifecycle (not headset evidence).
// Proves the headset sees the whole neighborhood instead of clipping it at the room's far plane.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.MP_EVIDENCE ?? '/home/dvgpro/.hermes/cache/scratch/xr-distance-evidence';
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5534/dev/');
 await page.waitForFunction(() => window.store);
 const facts = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { Store, newRoom } = await import('/src/core/store.ts');
  const { RoomView } = await import('/src/views/room.ts');
  const { REPO_ROOMS } = await import('/src/core/repo-rooms.ts');
  const host = document.createElement('div'); host.style.cssText='position:fixed;inset:0;z-index:999;width:1280px;height:900px'; document.body.append(host);
  const store = new Store(newRoom(), 'xr-distance-proof');
  const view = new RoomView(host, store, REPO_ROOMS); view.renderer.setAnimationLoop(null);
  const xr = view.xr;
  function check(v,m){ if(!v) throw Error(m); }
  const facts = {};

  xr.onStart();
  xr.camera.aspect = 1280/900; xr.camera.updateProjectionMatrix();
  facts.room = { near: xr.camera.near, far: xr.camera.far };
  check(facts.room.far <= 60, 'indoors keeps a tight far plane for depth precision');

  document.dispatchEvent(new CustomEvent('palace-neighborhood', { detail: store }));
  await new Promise(r => setTimeout(r, 600));
  const world = view.neighborhood;
  check(world && xr.neighborhood === world, 'the world is open in XR');
  xr.camera.aspect = 1280/900; xr.camera.updateProjectionMatrix();
  facts.world = { near: xr.camera.near, far: xr.camera.far, streetFar: world.street.far };
  check(xr.camera.far === world.street.far, 'the headset sees as far as the desktop street view');

  // Nothing in the world may fall beyond the far plane from where VR drops the player.
  xr.scene.updateMatrixWorld(true);
  const eye = xr.camera.getWorldPosition(new THREE.Vector3());
  const box = new THREE.Box3().setFromObject(world.group);
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x,y,z));
  facts.farthestWorldCorner = +Math.max(...corners.map(c => c.distanceTo(eye))).toFixed(1);
  facts.farthestPavilion = +Math.max(...world.pavilions.map(p => p.center.distanceTo(eye))).toFixed(1);
  facts.worldSize = new THREE.Vector3().subVectors(box.max, box.min).toArray().map(n => +n.toFixed(1));
  check(facts.farthestWorldCorner <= xr.camera.far, `world corner at ${facts.farthestWorldCorner}m is beyond the ${xr.camera.far}m far plane`);
  check(facts.farthestPavilion <= xr.camera.far, 'a pavilion is past the far plane');

  // Turn the headset toward the farthest pavilion: it must actually be inside the frustum.
  const target = world.pavilions.slice().sort((a,b) => b.center.distanceTo(eye) - a.center.distanceTo(eye))[0];
  xr.player.rotation.y = Math.atan2(target.center.x - eye.x, target.center.z - eye.z) + Math.PI;
  xr.scene.updateMatrixWorld(true);
  xr.camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
   new THREE.Matrix4().multiplyMatrices(xr.camera.projectionMatrix, xr.camera.matrixWorldInverse));
  facts.farthestPavilionVisible = frustum.containsPoint(target.center);
  facts.farthestPavilionId = target.id;
  check(facts.farthestPavilionVisible, `${target.id} at ${target.center.distanceTo(eye).toFixed(0)}m is still clipped`);

  // With the room's old far plane it would have been clipped — that is the bug this guards.
  const tight = xr.camera.clone(); tight.far = 40; tight.updateProjectionMatrix(); tight.updateMatrixWorld(true);
  facts.clippedAtOldFarPlane = !new THREE.Frustum().setFromProjectionMatrix(
   new THREE.Matrix4().multiplyMatrices(tight.projectionMatrix, tight.matrixWorldInverse)).containsPoint(target.center);

  view.renderer.render(view.scene, xr.camera);

  // Leaving the world restores the indoor range.
  document.dispatchEvent(new CustomEvent('palace-neighborhood-home', { detail: store }));
  await new Promise(r => setTimeout(r, 400));
  facts.backIndoors = { near: xr.camera.near, far: xr.camera.far, world: Boolean(view.neighborhood) };
  check(facts.backIndoors.far <= 60, 'the tight room range comes back');
  return facts;
 });
 await page.screenshot({ path: evidence + '/xr-world-distance.png' });
 if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
 writeFileSync(evidence + '/result.json', JSON.stringify(facts, null, 1));
 console.log(JSON.stringify(facts, null, 1));
 assert.ok(facts.clippedAtOldFarPlane, 'the regression guard must actually reproduce the old clipping');
 console.log('XR DISTANCE OK');
} finally { await browser.close(); }
