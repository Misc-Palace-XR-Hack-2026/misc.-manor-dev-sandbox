// Install Playwright locally or point PLAYWRIGHT_MODULE at an existing module.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.store);
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Store, newRoom } = await import('/src/core/store.ts');
    const { RoomView } = await import('/src/views/room.ts');
    const { XrObjectMenu } = await import('/src/xr/object-menu.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:500px;height:400px'; document.body.append(host);
    const store = new Store(newRoom()), room = new RoomView(host, store);
    room.renderer.setAnimationLoop(null);
    const id = store.addItem({ title: 'Reading list', sourceRef: 'Remember the important passage. A small note saved in your palace, ready to revisit.', type: 'note', kind: 'notebook' });
    const note = store.content(store.state.representations.find(r => r.id === id).contentItemId);
    store.updateContent(note.id, { title: note.title, sourceRef: note.sourceRef });
    store.place(id, store.layout.slots[0].id);
    store.select(id);
    const desktopHidden = !room.xr.objectMenu.group.visible;
    room.xr.onStart(); store.select(id); room.xr.updateControllers();
    const vrShown = room.xr.objectMenu.group.visible;
    room.xr.objectMenu.activate(room.xr.objectMenu.group.children.find(c => c.userData.actionId === 'move'));
    room.xr.updateControllers();
    const pickupHidden = !room.xr.objectMenu.group.visible && room.xr.placing;
    room.xr.onEnd(); store.select(id);
    const exitHidden = !room.xr.objectMenu.group.visible;
    room.renderer.dispose(); host.remove();
    // Render the real world-space card/pills with actual CanvasTexture/WebGL.
    const menu = new XrObjectMenu(store, () => {}); store.select(id);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#b6aaa0'); scene.add(menu.group);
    const camera = new THREE.PerspectiveCamera(45, 1200 / 900, .01, 100); camera.position.set(0, 1.03, 2.4); camera.lookAt(0, 1.03, 0);
    menu.follow(new THREE.Vector3(), camera);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true }); renderer.setSize(1200, 900);
    renderer.domElement.id = 'preview-evidence'; renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:99999'; document.body.append(renderer.domElement);
    renderer.render(scene, camera);
    const labels = menu.group.children.map(c => c.userData.actionId).filter(Boolean);
    const card = menu.group.getObjectByName('xr-preview');
    const ctx = card.material.map.image.getContext('2d');
    const pixels = ctx.getImageData(0, 0, 1024, 720).data;
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    // Local image decodes and actually paints onto the texture.
    const { XrPreview } = await import('/src/xr/preview.ts');
    const photo = document.createElement('canvas'); photo.width = 32; photo.height = 32;
    const pc = photo.getContext('2d'); pc.fillStyle = '#ff0000'; pc.fillRect(0, 0, 32, 32);
    const content = { id: 'photo', title: 'Local photo', type: 'image', sourceKind: 'file', sourceRef: 'photo.png', tags: [], createdAt: '', imageData: photo.toDataURL() };
    const imagePreview = new XrPreview(content);
    await new Promise(resolve => setTimeout(resolve, 100));
    const pixel = [...imagePreview.mesh.material.map.image.getContext('2d').getImageData(512, 100, 1, 1).data];
    imagePreview.dispose();
    return { desktopHidden, vrShown, pickupHidden, exitHidden, labels, colorCount: colors.size, pixel };
  });
  for (const key of ['desktopHidden', 'vrShown', 'pickupHidden', 'exitHidden']) assert.equal(result[key], true, key);
  assert.deepEqual(result.labels, ['page:object', 'move', `stash:${result.labels[2].slice(6)}`, 'cancel']);
  assert.ok(result.colorCount > 20, 'text and fallback artwork painted');
  assert.deepEqual(result.pixel, [255, 0, 0, 255], 'local photo drawn');
  assert.deepEqual(errors, []);
  await page.locator('#preview-evidence').screenshot({ path: join(process.env.TMPDIR ?? tmpdir(), 'xr-preview.png') });
  console.log('PASS rendered VR preview, image pixels, desktop/VR/exit isolation and pickup lifecycle (synthetic, no headset).', result);
} finally { await browser.close(); }
