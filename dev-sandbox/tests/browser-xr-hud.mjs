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
    panel.setGuide({ status:'fresh', lesson:'create', step:0, snapshot:null, roomId:null });
    capture('hud-world-tutorial');
    panel.setGuide(null);
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
    const glassMaterials = [panel.mesh, panel.guideMesh, ...menu.group.children, ...hover.group.children]
      .filter(o => o.material).map(o => ({ transparent:o.material.transparent, opacity:o.material.opacity, depthWrite:o.material.depthWrite, toneMapped:o.material.toneMapped }));
    // Real texture alpha and composited contrast: opaque-hex contrast ignores the world behind glass.
    const ctx = panel.canvas.getContext('2d');
    panel.show('home');
    const alphaAt = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
    const alpha = { panel: alphaAt(28, 500), button: alphaAt(60, 230), outside: alphaAt(0, 0) };
    const luminance = rgb => rgb.map(v => v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const composite = (fg, a, bg) => fg.map((v,i)=>v*a+bg[i]*(1-a));
    const contrasts = [0, 128, 255].map(value => {
      const bg = composite([18,20,24], alpha.button/255, [value,value,value]);
      return 1.05/(luminance(bg)+.05);
    });
    // The production panel material in a deterministic WebGL fixture: no CSS or canvas-only proof.
    const glassScene = new THREE.Scene();
    const halfWidth = .85 * 1600 / 1100;
    const eye = new THREE.OrthographicCamera(-halfWidth,halfWidth,.85,-.85,.01,10); eye.position.z = 2;
    const pane = panel.mesh.clone(); pane.position.set(0,0,0); glassScene.add(pane);
    const fixtureRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    fixtureRenderer.setSize(1600,1100);
    const target = new THREE.WebGLRenderTarget(160,160);
    const pixels = new Uint8Array(160*160*4);
    const sample = color => {
      glassScene.background = new THREE.Color(color);
      fixtureRenderer.setRenderTarget(target); fixtureRenderer.render(glassScene, eye);
      fixtureRenderer.readRenderTargetPixels(target,0,0,160,160,pixels);
      // x=55 lies inside the pane's open left margin, away from glyphs / buttons.
      return [...pixels.slice((80*160+55)*4,(80*160+55)*4+3)];
    };
    const transmitted = { dark: sample(0x000000), light: sample(0xffffff) };
    fixtureRenderer.setRenderTarget(null); target.dispose();
    for (const [name, color] of [['light',0xf5eee3],['dark',0x13161d]]) {
      glassScene.background = new THREE.Color(color); fixtureRenderer.render(glassScene, eye);
      shots['hud-glass-'+name+'-background'] = fixtureRenderer.domElement.toDataURL();
    }
    fixtureRenderer.dispose();
    room.xr.onEnd(); room.renderer.dispose(); host.remove();
    return { shots, pages, controls, labels, hoveredTextureVersion, clearedTextureVersion, whiteTint, hit: hit?.object.userData.actionId, contrasts, alpha, transmitted, glassMaterials };
  });
  for (const [name, data] of Object.entries(result.shots)) writeFileSync(join(out, name+'.png'), Buffer.from(data.split(',')[1], 'base64'));
  assert.equal(result.labels.filter(id => id === 'page:object').length, 1, 'one unified Edit');
  assert.equal(result.hit, 'page:object', 'rounded buttons retain real ray targets');
  assert.equal(result.whiteTint, 0xffffff, 'hover must not multiply/darken text');
  assert.ok(result.clearedTextureVersion > result.hoveredTextureVersion, 'hover reset repaints');
  assert.ok(result.contrasts.every(r => r >= 4.5), 'opaque labels on composited button beds meet 4.5:1 over dark, mid and white worlds');
  assert.ok(result.alpha.panel >= 94 && result.alpha.panel <= 100, 'open panel body retains 62% world visibility');
  assert.ok(result.alpha.button > result.alpha.panel && result.alpha.button < 200, 'button beds remain translucent');
  assert.equal(result.alpha.outside, 0, 'rounded texture corners remain clear');
  assert.ok(result.transmitted.light.every((v,i) => v - result.transmitted.dark[i] > 80), 'real WebGL panel transmits changing world backgrounds');
  assert.ok(result.glassMaterials.length >= 8);
  for (const material of result.glassMaterials) assert.deepEqual(material, { transparent:true, opacity:1, depthWrite:false, toneMapped:false }, 'all glass components keep opaque ink and transparent surfaces');
  assert.deepEqual(errors, []);
  delete result.shots;
  writeFileSync(join(out, 'hud-results.json'), JSON.stringify(result, null, 2));
  console.log('PASS real WebGL HUD, bounds, ray targets, contrast, hover feedback', result, out);
} finally { await browser.close(); }
