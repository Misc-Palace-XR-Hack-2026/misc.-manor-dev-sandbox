// Real Chromium / WebGL, synthetic XR lifecycle (room.xr.onStart) and a mocked navigator.xr probe.
// NOT headset evidence: no physical device is involved.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.XR_EVIDENCE_DIR ?? '/tmp/vr-usability-evidence';
mkdirSync(OUT, { recursive: true });
const URL_ = process.env.MP_URL ?? 'http://127.0.0.1:5297/dev/';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A headset reports immersive-vr support; mock the probe so the VR entry path is the real one.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: { isSessionSupported: async (m) => m === 'immersive-vr', addEventListener() {}, removeEventListener() {} },
    });
  });
  await page.goto(URL_);
  await page.waitForFunction(() => window.store);

  const result = await page.evaluate(async () => {
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const { REPO_ROOMS } = await import('/src/core/repo-rooms.ts');

    const host = document.createElement('div');
    host.style.cssText = 'width:900px;height:700px';
    document.body.append(host);
    const store = new Store(newRoom('Guest room'), 'guest');
    const room = new RoomView(host, store, REPO_ROOMS);
    room.renderer.setAnimationLoop(null);
    room.xr.onStart(); // synthetic immersive session
    const panel = room.xr.panel;

    const press = (id) => {
      for (let i = 0; i < 20; i++) {
        const b = panel.shown.find((x) => x.id === id);
        if (b) { panel.activate({ x: b.x / 1024, y: 1 - b.y / 1408 }); return; }
        const n = panel.shown.find((x) => x.id === 'ui:next');
        if (n) { panel.activate({ x: n.x / 1024, y: 1 - n.y / 1408 }); continue; }
        throw new Error('not on screen: ' + id + ' / have ' + panel.shown.map((s) => s.id).join(','));
      }
      throw new Error('paging loop: ' + id);
    };

    // ---------- defect 1: reach a populated repo room from inside the session ----------
    panel.show('home');
    const emptyObjects = room.objectsGroup.children.length;
    press('page:rooms');
    const roomsPage = panel.shown.map((b) => b.id);
    press('page:repo-rooms');
    const pickerIds = panel.shown.map((b) => b.id);
    const pickerLabels = panel.shown.map((b) => b.label);
    const pickerShot = panel.canvas.toDataURL('image/png');
    const repoNames = REPO_ROOMS.map((r) => r.name);

    press('visit-room:omari');
    const loadedReps = store.state.representations.length;
    const loadedObjects = room.objectsGroup.children.length;
    const visiting = store.visiting;
    // In-session view (what the headset camera sees) plus a legible isometric overview.
    room.renderer.render(room.scene, room.xr.camera ?? room.camera);
    const roomShotXr = room.renderer.domElement.toDataURL('image/png');
    room.renderer.render(room.scene, room.camera);
    const roomShot = room.renderer.domElement.toDataURL('image/png');

    press('page:rooms');
    press('page:repo-rooms');
    press('visit-room:vinyl-lounge');
    const secondReps = store.state.representations.length;
    const secondObjects = room.objectsGroup.children.length;

    // Returning home restores the empty guest room, personal save untouched.
    panel.show('home');
    press('home:return');
    const afterReturn = room.objectsGroup.children.length;

    // ---------- defect 2: the keyboard ----------
    panel.show('create');
    const createIds = panel.shown.map((b) => b.id);
    const keyRects = panel.shown.filter((b) => b.id.startsWith('key:')).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));
    const keyboardShot = panel.canvas.toDataURL('image/png');

    // Type a mixed-case URL purely by activating each key's own rect.
    press('create:field-title');
    for (const c of 'My Link') { if (c === ' ') { press('key:space'); continue; } const up = /[A-Z]/.test(c); if (up !== panel.draft.caps) press('key:caps'); press('key:' + c); }
    const typedTitle = panel.draft.title;
    if (panel.draft.caps) press('key:caps');
    press('create:field-text');
    press('key:https');
    const url = 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1';
    for (const c of url.slice('https://'.length)) { const up = /[A-Z]/.test(c); if (up !== panel.draft.caps) press('key:caps'); press('key:' + c); }
    if (panel.draft.caps) press('key:caps');
    const typed = panel.draft.text;
    const typedShot = panel.canvas.toDataURL('image/png');
    press('create:submit');
    const stored = store.state.contentItems.at(-1)?.sourceRef;

    room.xr.onEnd();
    room.renderer.dispose();
    host.remove();
    return {
      emptyObjects, roomsPage, pickerIds, pickerLabels, repoNames,
      loadedReps, loadedObjects, visiting, secondReps, secondObjects, afterReturn,
      createIds, keyRects, typedTitle, typed, stored,
      shots: { pickerShot, roomShot, roomShotXr, keyboardShot, typedShot },
    };
  });

  const save = (name, dataUrl) => {
    const p = join(OUT, name);
    writeFileSync(p, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('screenshot', p);
    return p;
  };
  save('vr-room-picker-panel.png', result.shots.pickerShot);
  save('vr-repo-room-omari.png', result.shots.roomShot);
  save('vr-repo-room-omari-headset-camera.png', result.shots.roomShotXr);
  save('vr-keyboard-empty.png', result.shots.keyboardShot);
  save('vr-keyboard-typed-url.png', result.shots.typedShot);

  // ---- defect 1 assertions ----
  assert.equal(result.emptyObjects, 0, 'the guest room really does start empty');
  assert.ok(result.roomsPage.includes('page:repo-rooms'), 'Rooms page links to the in-VR repo-room picker');
  for (const name of result.repoNames) {
    assert.ok(result.pickerIds.includes('visit-room:' + name), 'picker lists ' + name);
  }
  assert.ok(result.pickerLabels.includes('Vinyl Lounge'), 'labels are readable: ' + result.pickerLabels.join('|'));
  assert.ok(result.loadedReps > 10, `omari loaded ${result.loadedReps} representations`);
  assert.ok(result.loadedObjects > 10, `omari rendered ${result.loadedObjects} meshes in objectsGroup`);
  assert.equal(result.visiting, 'omari', 'loading a repo room is a visit, not a save overwrite');
  assert.ok(result.secondObjects > 0 && result.secondReps > 0, 'a second pick also renders');
  assert.equal(result.afterReturn, 0, 'Return home restores the original empty room');

  // ---- defect 2 assertions ----
  const keys = result.keyRects;
  const rows = new Map();
  for (const k of keys) rows.set(k.y, (rows.get(k.y) ?? 0) + 1);
  assert.ok(rows.size <= 7, `keyboard is ${rows.size} rows, not 54 stacked buttons`);
  assert.ok(Math.max(...rows.values()) >= 9, 'rows hold many keys side by side');
  assert.ok(Math.min(...keys.map((k) => k.w)) >= 60, 'keys stay ray-sized');
  assert.ok(!result.createIds.includes('ui:prev'), 'no paging needed to reach the keyboard');
  for (const id of ['create:submit', 'create:cancel', 'create:title', 'create:text']) {
    assert.ok(result.createIds.includes(id), id + ' visible alongside the keyboard');
  }
  assert.equal(result.typedTitle, 'My Link');
  const expected = 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1';
  assert.equal(result.typed, expected, 'typed value');
  assert.equal(result.stored, expected, 'typed === stored (PR #86 case preservation)');

  assert.deepEqual(errors, []);
  console.log('PASS in-VR repo-room picker + compact QWERTY keyboard (synthetic XR session, no headset)', {
    rows: rows.size, keys: keys.length, omariObjects: result.loadedObjects,
  });
} finally {
  await browser.close();
}
