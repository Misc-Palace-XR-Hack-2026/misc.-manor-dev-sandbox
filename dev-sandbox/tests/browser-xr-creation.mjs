// Real Chromium / WebGL, synthetic XR lifecycle; not headset evidence.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The dev sandbox entry moved to /dev/ (PR #98 multi-entry build); `/` is the public demo.
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5297/dev/');
  await page.waitForFunction(() => window.store);
  const result = await page.evaluate(async () => {
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:500px;height:400px'; document.body.append(host);
    const store = new Store(newRoom()), room = new RoomView(host, store);
    room.renderer.setAnimationLoop(null);
    room.xr.onStart();
    const panel = room.xr.panel;
    function press(id) {
      for (let i = 0; i < 30; i++) {
        const button = panel.shown.find(b => b.id === id);
        if (button) { panel.activate({ x: .5, y: 1 - button.y / 1408 }); return; }
        const next = panel.shown.find(b => b.id === 'ui:next');
        if (!next) throw new Error('Button unavailable: ' + id);
        panel.activate({ x: .5, y: 1 - next.y / 1408 });
      }
      throw new Error('Pagination loop');
    }
    panel.show('create');
    const painted = [];
    const ctx = panel.canvas.getContext('2d'); const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...args) => { painted.push(text); fillText(text, ...args); };
    press('create:submit');
    const validationVisible = painted.includes('Enter a title.');
    const invalidUnchanged = store.state.contentItems.length === 0;
    panel.draft.title = 'Created in VR'; panel.draft.mode = 'note'; panel.draft.text = 'Safe note';
    press('create:submit');
    const completionVisible = panel.shown.some(b => b.id === 'create:done');
    const closeVisible = panel.shown.some(b => b.id === 'page:home');
    const id = store.selectedId;
    const placing = room.xr.placing && !store.slotOf(id);
    room.xr.controllers[0].dispatchEvent({ type: 'disconnected' });
    room.xr.updateControllers();
    const restoredAfterDisconnect = !!store.slotOf(id) && !room.xr.placing;
    // Repeated submission cannot duplicate the completed draft.
    const repeated = panel.draft.create(store) === null;
    const count = store.state.contentItems.length;
    panel.show('create'); panel.draft.title = 'Discard me';
    press('create:cancel');
    const cancelled = store.state.contentItems.length === count;
    panel.show('create'); panel.draft.title = 'Exit recovery'; panel.draft.mode = 'note';
    press('create:submit'); const exitingId = store.selectedId;
    room.xr.onEnd();
    const restoredAfterExit = !!store.slotOf(exitingId);
    room.xr.onStart();
    while (store.freeSlotIds().length) store.addItem({ title: 'Fill room', sourceRef: '', type: 'note' });
    panel.show('create'); panel.draft.title = 'Overflow'; panel.draft.mode = 'note';
    press('create:submit');
    const fullRoomMessage = panel.shown.some(b => b.id === 'create:done') && /Inbox/.test(panel.draft.message);
    const overflow = store.state.contentItems.at(-1);
    const inInbox = !store.repFor(overflow.id);
    room.xr.onEnd();
    room.renderer.dispose(); host.remove();
    return { repeated, cancelled, restoredAfterExit, fullRoomMessage, inInbox, validationVisible, invalidUnchanged, completionVisible, closeVisible, placing, restoredAfterDisconnect, count };
  });
  assert.equal(result.validationVisible, true, "validation must be painted on the world-space panel");
  assert.equal(result.invalidUnchanged, true);
  assert.equal(result.completionVisible, true, 'success message must be visible after paginated submit');
  assert.equal(result.closeVisible, true, 'Close must be visible after submit');
  assert.equal(result.placing, true);
  assert.equal(result.restoredAfterDisconnect, true);
  assert.equal(result.count, 1);
  for (const key of ["repeated", "cancelled", "restoredAfterExit", "fullRoomMessage", "inInbox"]) assert.equal(result[key], true, key);
  assert.deepEqual(errors, []);
  console.log('PASS XR creation pagination and controller-loss recovery', result);
} finally { await browser.close(); }
