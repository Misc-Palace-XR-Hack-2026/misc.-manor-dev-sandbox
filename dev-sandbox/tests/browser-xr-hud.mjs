// Actual CanvasTexture/WebGL rendering and ray hits, not physical-headset evidence.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = process.env.XR_EVIDENCE_DIR ?? join(tmpdir(), 'manor-hud-evidence');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5537/dev/');
  await page.waitForFunction(() => window.store);
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const { XrHoverLabel } = await import('/src/xr/hover.ts');
    const { inspectPreview } = await import('/src/xr/interaction.ts');
    const { HUD } = await import('/src/xr/hud.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:1600px;height:1100px'; document.body.append(host);
    const store = new Store(newRoom(), 'guest');
    const room = new RoomView(host, store);
    room.renderer.setAnimationLoop(null);
    room.xr.onStart();
    const panel = room.xr.panel;
    const shots = {};
    const capture = name => {
      room.renderer.render(room.scene, room.xr.camera);
      shots[name] = room.renderer.domElement.toDataURL();
    };
    // Fixed eye height and view for deterministic desktop evidence of world-space geometry.
    room.xr.camera.position.set(0, 1.45, .35);
    room.xr.camera.aspect = 1600 / 1100;
    room.xr.camera.updateProjectionMatrix();
    panel.show('home');
    const b = panel.shown.find(b => b.id === 'page:rooms');
    panel.setHover({ x: b.x / 1024, y: 1 - b.y / 1408 });
    capture('hud-world-home-hover');
    shots['hud-home-texture'] = panel.canvas.toDataURL();
    panel.show('create');
    panel.draft.title = 'A long title '.repeat(20);
    panel.draft.text = 'https://example.com/' + 'LongPath'.repeat(40);
    panel.show('create', true);
    const key = panel.shown.find(b => b.id === 'key:w');
    panel.setHover({ x: key.x / 1024, y: 1 - key.y / 1408 });
    capture('hud-world-keyboard-hover');
    shots['hud-keyboard-selected-long-text'] = panel.canvas.toDataURL();
    // Exhaustive bounds, non-overlap and hit mapping on every kind page / list page.
    let controls = 0, pages = 0;
    for (const section of ['home', 'create', 'object', 'themes', 'lighting', 'surfaces', 'rooms', 'repo-rooms', 'inbox']) {
      panel.show(section);
      for (let n = 0; n < 30; n++) {
        pages++;
        for (const [i, b] of panel.shown.entries()) {
          if (b.x-b.w/2 < 0 || b.x+b.w/2 > 1024 || b.y-b.h/2 < 200 || b.y+b.h/2 > 1320) throw Error('clipped control '+section+':'+b.id);
          if (panel.hitIndex({ x: b.x/1024, y: 1-b.y/1408 }) !== i) throw Error('wrong hit '+b.id);
          for (const a of panel.shown.slice(i+1)) if (Math.abs(a.x-b.x) < (a.w+b.w)/2 && Math.abs(a.y-b.y) < (a.h+b.h)/2) throw Error('overlap '+b.id+' '+a.id);
          controls++;
        }
        const next = panel.shown.find(b => b.id === 'ui:next');
        if (!next) break;
        panel.activate({ x: next.x/1024, y: 1-next.y/1408 });
        if (section === 'create' && n === 0) shots['hud-keyboard-page-two'] = panel.canvas.toDataURL();
      }
    }
    panel.hide();
    const id = store.addItem({ title: 'The quiet corner', sourceRef: 'A place for ideas worth keeping. Select Edit to change this note, or Move to find it a new home.', type: 'note', kind: 'notebook' });
    const note = store.content(store.state.representations.find(r => r.id === id).contentItemId);
    store.updateContent(note.id, { title: note.title, sourceRef: note.sourceRef });
    store.select(id);
    const menu = room.xr.objectMenu;
    // Same production menu placed in front of the evidence camera in the real room.
    const origin = room.xr.camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -.85, -1.8));
    menu.follow(origin, room.xr.camera);
    const edit = menu.group.children.find(o => o.userData.actionId === 'page:object');
    menu.setHover(edit);
    capture('hud-world-object-actions-hover');
    const hoveredTextureVersion = edit.material.map.version;
    const whiteTint = edit.material.color.getHex();
    menu.setHover(null);
    const clearedTextureVersion = edit.material.map.version;
    menu.group.updateMatrixWorld(true);
    const p = edit.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0,0,1).applyQuaternion(menu.group.quaternion);
    const hit = menu.hit(new THREE.Raycaster(p.clone().add(normal), normal.clone().negate()));
    menu.hide();
    const hover = new XrHoverLabel(); room.scene.add(hover.group);
    hover.show(inspectPreview(store, id), origin.clone().add(new THREE.Vector3(0,.4,0)), room.xr.camera);
    capture('hud-world-hover-card');
    shots['hud-hover-texture'] = hover.group.children[0].material.map.image.toDataURL();
    const labels = menu.group.children.map(c => c.userData.actionId).filter(Boolean);
    // Quantify readable foreground/background contrast for every button state.
    const luminance = hex => { const c = hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; };
    const contrasts = [HUD.base, HUD.inset, HUD.surface, HUD.hover].map(bg => (luminance(HUD.text)+.05)/(luminance(bg)+.05));
    room.xr.onEnd(); room.renderer.dispose(); host.remove();
    return { shots, pages, controls, labels, hoveredTextureVersion, clearedTextureVersion, whiteTint, hit: hit?.object.userData.actionId, contrasts };
  });
  for (const [name, data] of Object.entries(result.shots)) writeFileSync(join(out, name+'.png'), Buffer.from(data.split(',')[1], 'base64'));
  assert.equal(result.labels.filter(id => id === 'page:object').length, 1, 'one unified Edit');
  assert.equal(result.hit, 'page:object', 'rounded buttons retain real ray targets');
  assert.equal(result.whiteTint, 0xffffff, 'hover must not multiply/darken text');
  assert.ok(result.clearedTextureVersion > result.hoveredTextureVersion, 'hover reset repaints');
  assert.ok(result.contrasts.every(r => r >= 4.5), 'text meets 4.5:1 contrast in all states');
  assert.deepEqual(errors, []);
  delete result.shots;
  writeFileSync(join(out, 'hud-results.json'), JSON.stringify(result, null, 2));
  console.log('PASS real WebGL HUD, bounds, ray targets, contrast, hover feedback', result, out);
} finally { await browser.close(); }
