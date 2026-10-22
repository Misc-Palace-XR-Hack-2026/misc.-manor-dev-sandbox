// Real Chromium WebGL + synthetic XR controller dispatch, not headset evidence.
// Proves the VR panel is parked on the pillar / selected object rather than floating at the viewer.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.MP_EVIDENCE ?? '/home/dvgpro/.hermes/cache/scratch/xr-anchor-evidence';
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5534/dev/');
 await page.waitForFunction(() => window.store);
 const result = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { Store, newRoom } = await import('/src/core/store.ts');
  const { RoomView } = await import('/src/views/room.ts');
  const { REPO_ROOMS } = await import('/src/core/repo-rooms.ts');
  const host = document.createElement('div'); host.style.cssText='position:fixed;inset:0;z-index:999;width:1280px;height:900px'; document.body.append(host);
  const store = new Store(newRoom(), 'vr-anchor-proof');
  const view = new RoomView(host, store, REPO_ROOMS); view.renderer.setAnimationLoop(null);
  const xr = view.xr, panel = xr.panel;
  function check(v,m){ if(!v) throw Error(m); }
  xr.onStart();
  xr.camera.aspect = 1280/900; xr.camera.updateProjectionMatrix(); xr.camera.position.y = 1.65;
  const controller = xr.controllers[0]; controller.matrixAutoUpdate = true; controller.position.set(0,1.5,0);
  const aim = (point) => { xr.scene.updateMatrixWorld(true); controller.lookAt(point); controller.rotateY(Math.PI); xr.scene.updateMatrixWorld(true); };
  const click = () => { controller.dispatchEvent({type:'selectstart'}); controller.dispatchEvent({type:'selectend'}); };
  const faceWorld = () => { xr.scene.updateMatrixWorld(true); return panel.mesh.getWorldPosition(new THREE.Vector3()); };
  const camWorld = () => xr.camera.getWorldPosition(new THREE.Vector3());
  const facesViewer = () => {
   xr.scene.updateMatrixWorld(true);
   const normal = new THREE.Vector3(0,0,1).applyQuaternion(panel.mesh.getWorldQuaternion(new THREE.Quaternion()));
   const toViewer = camWorld().sub(faceWorld()).setY(0).normalize();
   return normal.setY(0).normalize().dot(toViewer);
  };
  const facts = { pillars: {} };

  // The panel must live in the world, not ride the player rig, or it can never stay on a pillar.
  check(panel.group.parent === xr.scene, 'panel group is in the world scene');

  for (const kind of ['portal','jukebox','room-portal']) {
   store.select(null); panel.hide();
   xr.updateControllers(performance.now(), .016);
   const model = kind === 'room-portal' ? xr.amenities.rooms : xr.amenities[kind];
   const centre = kind === 'jukebox'
    ? model.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,0.9,0))
    : model.center.clone();
   aim(model.group.position.clone().add(new THREE.Vector3(0,1,0)));
   const hit = xr.pick(controller);
   check(hit?.kind === kind, `controller hits ${kind}, got ${hit?.kind}`);
   click();
   check(panel.visible, `${kind} opens the panel`);
   const face = faceWorld();
   const toPillar = Math.hypot(face.x-centre.x, face.z-centre.z);
   const toViewer = Math.hypot(face.x-camWorld().x, face.z-camWorld().z);
   facts.pillars[kind] = { page: panel.page, toPillar: +toPillar.toFixed(3), toViewer: +toViewer.toFixed(3), facing: +facesViewer().toFixed(3) };
   check(toPillar <= 0.9, `${kind}: panel ${toPillar.toFixed(2)}m from its pillar, should hug it`);
   check(toPillar < toViewer, `${kind}: panel is nearer the viewer than the pillar`);
   check(facesViewer() > 0.9, `${kind}: panel must face the viewer`);
  }

  // Paging inside a pillar's menu keeps the panel on that pillar.
  const roomsCentre = xr.amenities.rooms.center.clone();
  const pressAt = (id) => { const b = panel.shown.find(b=>b.id===id); if(!b) return false; aim(panel.mesh.localToWorld(new THREE.Vector3((b.x/1024-.5)*.84,(.5-b.y/1408)*1.16,0))); click(); return true; };
  facts.pressedSubPage = pressAt('page:rooms');
  for (const sub of ['rooms','repo-rooms']) {
   xr.onPanel({ page: sub });
   const face = faceWorld();
   const d = +Math.hypot(face.x-roomsCentre.x, face.z-roomsCentre.z).toFixed(3);
   facts['stays_' + sub] = d;
   check(d <= 0.9, `${sub} stays on the Rooms pillar, got ${d}`);
  }
  xr.onPanel({ page: 'music' });
  const jukeCentre = xr.amenities.jukebox.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,0.9,0));
  const musicFace = faceWorld();
  facts.stays_music = +Math.hypot(musicFace.x-jukeCentre.x, musicFace.z-jukeCentre.z).toFixed(3);
  check(facts.stays_music <= 0.9, 'the music page stays on the jukebox');

  // Selecting an object and opening Edit puts the panel on that object, under its action pills.
  panel.hide(); store.select(null);
  const repId = store.state.placements[0]?.representationId
   ?? store.addItem({ title: 'Anchor proof', sourceRef: 'https://example.com/anchor', kind: 'book', place: true });
  check(repId && store.slotOf(repId), 'there is a placed object to select');
  store.select(repId);
  xr.updateControllers(performance.now(), .016);
  const pills = xr.objectMenu.anchor;
  check(pills, 'the object action pills are up');
  const objectWorld = pills.clone();
  const result = (await import('/src/xr/interaction.ts')).runPanelAction(store, 'page:object', [], panel.draft);
  xr.onPanel(result);
  check(panel.page === 'object', 'object actions page opened');
  const objFace = faceWorld();
  facts.objectPage = {
   toObject: +Math.hypot(objFace.x-objectWorld.x, objFace.z-objectWorld.z).toFixed(3),
   belowPills: +(objectWorld.y - objFace.y).toFixed(3),
   toViewer: +Math.hypot(objFace.x-camWorld().x, objFace.z-camWorld().z).toFixed(3),
   facing: +facesViewer().toFixed(3),
  };
  check(facts.objectPage.toObject <= 0.7, 'object menu hugs its object');
  check(facts.objectPage.belowPills > 0, 'the panel hangs below the action pills');
  check(facts.objectPage.facing > 0.9, 'object panel faces the viewer');

  // Editing the item's text/link keeps that same anchor instead of jumping to the face.
  const edit = (await import('/src/xr/interaction.ts')).runPanelAction(store, 'page:edit-content', [], panel.draft);
  if (edit.page === 'create') {
   xr.onPanel(edit);
   xr.updateControllers(performance.now(), .016);
   const editFace = faceWorld();
   facts.editPage = { page: panel.page, editing: panel.draft.editing, toObject: +Math.hypot(editFace.x-objectWorld.x, editFace.z-objectWorld.z).toFixed(3) };
   check(panel.draft.editing, 'the editor is editing the selected item');
   check(facts.editPage.toObject <= 0.7, 'the editor pops up at the selected object');
  } else facts.editPage = { skipped: edit.page ?? 'none' };

  // A page with no pillar still lands in front of the viewer.
  store.select(null); panel.hide();
  xr.updateControllers(performance.now(), .016);
  xr.onPanel({ page: 'howto' });
  const homeFace = faceWorld();
  facts.noPillarPage = { toViewer: +Math.hypot(homeFace.x-camWorld().x, homeFace.z-camWorld().z).toFixed(3), facing: +facesViewer().toFixed(3) };
  check(facts.noPillarPage.toViewer > 0.8 && facts.noPillarPage.toViewer < 1.6, 'wrist-menu pages stay an arm away');

  // A look from the room at the portal pillar with its menu up, for visual review.
  store.select(null); panel.hide(); xr.updateControllers(performance.now(), .016);
  const portalCentre = xr.amenities.portal.center.clone();
  xr.player.position.set(portalCentre.x - 1.9, 0, portalCentre.z + 1.6);
  xr.player.rotation.set(0, 0, 0);
  xr.scene.updateMatrixWorld(true);
  xr.camera.lookAt(portalCentre);
  xr.onPanel({ page: 'portal' });
  xr.scene.updateMatrixWorld(true);
  view.renderer.render(view.scene, xr.camera);
  return facts;
 });
 await page.screenshot({ path: evidence + '/xr-panel-on-pillar.png' });
 if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
 writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 1));
 console.log(JSON.stringify(result, null, 1));
 assert.ok(result.pillars.portal.toPillar < result.pillars.portal.toViewer);
 console.log('XR ANCHOR OK');
} finally { await browser.close(); }
