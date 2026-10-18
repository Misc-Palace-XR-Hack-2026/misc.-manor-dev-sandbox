// Real Chromium / WebGL, synthetic XR lifecycle; not headset evidence.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5298');
  await page.waitForFunction(() => window.store);
  const result = await page.evaluate(async () => {
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:500px;height:400px'; document.body.append(host);
    const store = new Store(newRoom()), room = new RoomView(host, store);
    room.renderer.setAnimationLoop(null);
    const panel = room.xr.panel;
    function press(id) {
      for (let i = 0; i < 40; i++) {
        const button = panel.shown.find(b => b.id === id);
        if (button) { panel.activate({ x: .5, y: 1 - button.y / 1408 }); return; }
        const next = panel.shown.find(b => b.id === 'ui:next');
        if (next) { panel.activate({ x: .5, y: 1 - next.y / 1408 }); continue; }
        if (panel.scroll > 0) {
          panel.scroll = 0;
          panel.redraw();
          continue;
        }
        throw new Error('Button unavailable: ' + id);
      }
      throw new Error('Pagination loop for ' + id);
    }
    function typeText(text) {
      for (const c of text) {
        if (c === ' ') { press('key:space'); continue; }
        const upper = /[A-Z]/.test(c);
        if (upper !== panel.draft.caps) press('key:caps');
        press('key:' + c);
      }
    }
    room.xr.onStart();
    panel.show('create');
    press('create:field-title');
    typeText('My Link');
    const title = panel.draft.title;
    press('create:field-text');
    const url = 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1';
    typeText(url);
    const typed = panel.draft.text;
    press('create:submit');
    const stored = store.state.contentItems[0]?.sourceRef;
    const overlay = document.getElementById('xr-dom-overlay');
    const overlayPresent = Boolean(overlay);
    room.xr.onEnd();

    const stairStore = new Store(newRoom());
    const stairRoom = new RoomView(host, stairStore);
    stairRoom.renderer.setAnimationLoop(null);
    stairRoom.xr.onStart();
    stairRoom.xr.player.position.set(.7, 0, 6.1);
    stairRoom.xr.player.rotation.set(0, 0, 0);
    const yawBefore = stairRoom.xr.player.rotation.y;
    const menuBefore = stairRoom.xr.panel.visible;
    const source = {
      handedness: 'left',
      gamepad: {
        axes: [0, 0, 0.9, -0.5],
        buttons: [null, null, null, null, null, { pressed: false }],
      },
    };
    stairRoom.renderer.xr.getSession = () => ({ inputSources: [source] });
    const now = performance.now();
    stairRoom.xr.lastWalk = now - 16;
    stairRoom.xr.lastSnap = now - 1000;
    stairRoom.xr.updateControllers();
    const walked = Math.abs(stairRoom.xr.player.position.z - 6.1) > 0.001;
    const snapTurned = Math.abs(stairRoom.xr.player.rotation.y - yawBefore) > 0.01;
    source.gamepad.axes[2] = 0;
    source.gamepad.axes[3] = -0.4;
    source.gamepad.buttons[5] = { pressed: true };
    stairRoom.xr.lastSnap = performance.now() - 1000;
    stairRoom.xr.updateControllers();
    const menuToggled = stairRoom.xr.panel.visible !== menuBefore;
    stairRoom.xr.onEnd();

    const failStore = new Store(newRoom());
    const failRoom = new RoomView(host, failStore);
    failRoom.renderer.setAnimationLoop(null);
    const overlayRoot = failRoom.xr.overlay;
    const granted = { domOverlayState: { type: 'screen' }, end: async () => { granted.ended = true; } };
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, get: () => true });
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => granted,
      },
    });
    failRoom.renderer.xr.setSession = async () => { throw new Error('setSession refused'); };
    failRoom.renderer.xr.getSession = () => null;
    let rejected = false;
    try { await failRoom.xr.enter(); } catch { rejected = true; }
    const overlayHiddenAfterReject = overlayRoot.hidden === true;
    const grantCleared = failRoom.xr.overlayGranted === false;
    const menuOverlayOff = failRoom.xr.objectMenu.useDomOverlay === false;
    const presenting = failRoom.xr.presenting === false;
    const sessionEnded = granted.ended === true;
    failRoom.renderer.xr.setSession = async (session) => { failRoom.renderer.xr.getSession = () => session; };
    await failRoom.xr.enter();
    const retryGranted = failRoom.xr.overlayGranted === true && overlayRoot.hidden === false;
    failRoom.xr.onEnd();
    failRoom.renderer.dispose();
    stairRoom.renderer.dispose();
    room.renderer.dispose();
    host.remove();
    return {
      title, typed, stored, overlayPresent,
      walked, snapTurned, menuToggled,
      rejected, overlayHiddenAfterReject, grantCleared, menuOverlayOff, presenting, retryGranted, sessionEnded,
      iframeSandbox: document.querySelector('iframe')?.getAttribute('sandbox') ?? 'none-created',
    };
  });
  assert.equal(result.title, 'My Link');
  assert.equal(result.typed, 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1');
  assert.equal(result.stored, result.typed);
  assert.equal(result.walked, true);
  assert.equal(result.snapTurned, true, 'left stick snap-turn must still run while walking stairs');
  assert.equal(result.menuToggled, true, 'same-controller menu button must still run while walking stairs');
  assert.equal(result.rejected, true);
  assert.equal(result.overlayHiddenAfterReject, true);
  assert.equal(result.grantCleared, true);
  assert.equal(result.menuOverlayOff, true);
  assert.equal(result.presenting, true);
  assert.equal(result.sessionEnded, true);
  assert.equal(result.retryGranted, true);
  assert.deepEqual(errors, []);
  console.log('PASS XR keyboard, stair controller dispatch, rejected setSession cleanup', result);
} finally { await browser.close(); }
