import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Store, newRoom } from '../src/core/store';
import { XrObjectMenu } from '../src/xr/object-menu';
import { overlayIsGranted } from '../src/xr/interaction';
import { XrPreview } from '../src/xr/preview';

const painted: string[] = [];
// Canvas drawing is unavailable in Node; geometry and visibility use real Three.js.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText(text: string) { painted.push(text); }, measureText(text: string) { return { width: text.length * 16 }; } }) }) } as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;

test('preview wraps readable words and shares desktop note content', () => {
  painted.length = 0;
  const preview = new XrPreview({ id: 'n', title: 'My note', type: 'note', sourceKind: 'note', sourceRef: 'remember '.repeat(12), tags: [], createdAt: '' });
  assert.ok(painted.includes('My note'));
  assert.ok(painted.includes(Array(6).fill('remember').join(' ')), 'wrap at word boundaries');
  assert.ok(painted.includes('Preview · select Close to dismiss'));
  preview.dispose();
});

test('selected VR object has a world-space preview and dismiss button without blocking rays', () => {
  const store = new Store(newRoom());
  const menu = new XrObjectMenu(store, () => {});
  const id = store.addItem({ title: 'Reading list', sourceRef: 'Remember the important passage.', type: 'note', kind: 'notebook' });
  store.select(id);
  const card = menu.group.getObjectByName('xr-preview');
  assert.ok(card, 'selected content needs a rendered preview');
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 3);
  menu.follow(new THREE.Vector3(), camera);
  const position = menu.group.position.clone();
  camera.position.x += 2;
  menu.follow(new THREE.Vector3(), camera);
  assert.deepEqual(menu.group.position, position, 'head movement must not move the card');
  const close = menu.group.children.find(o => o.userData.actionId === 'cancel');
  assert.ok(close, 'preview is dismissible');
  menu.group.updateMatrixWorld(true);
  const center = card.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(menu.group.quaternion);
  assert.equal(menu.hit(new THREE.Raycaster(center.clone().add(normal), normal.negate())), null, 'decorative preview does not capture controller rays');
  menu.activate(close);
  assert.equal(store.selectedId, null);
  assert.equal(menu.group.visible, false);
});

test('desktop selection cannot show VR buttons, including after leaving VR', () => {
  const store = new Store(newRoom());
  const menu = new XrObjectMenu(store, () => {});
  const id = store.addItem({ title: 'Note', sourceRef: 'text', type: 'note', kind: 'notebook' });
  store.select(id);
  assert.equal(menu.group.visible, false, 'desktop Store updates must not show VR buttons');
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 3);
  menu.follow(new THREE.Vector3(), camera);
  assert.equal(menu.group.visible, true, 'VR frame shows selected actions');
  store.setKind(id, 'book');
  assert.equal(menu.group.visible, true, 'VR edits retain visible actions');
  menu.hide();
  store.select(null);
  store.select(id);
  assert.equal(menu.group.visible, false, 'desktop reselection after exit stays hidden');
  assert.equal(menu.hit(new THREE.Raycaster()), null);
});

for (const [title, sourceRef] of [['Note', 'text'], ['Link', 'https://example.com']]) test(`selected ${title} actions share one padded capsule with pill-shaped ray targets`, () => {
  const store = new Store(newRoom());
  const menu = new XrObjectMenu(store, () => {});
  const id = store.addItem({ title, sourceRef, type: 'auto', kind: 'notebook' });
  store.select(id);
  const capsule = menu.group.getObjectByName('xr-object-toolbar') as THREE.Mesh;
  assert.ok(capsule, 'one shared glass capsule behind the actions');
  assert.equal(menu.group.children.filter(c => c.name === 'xr-object-toolbar').length, 1);
  const buttons = menu.group.children.filter(c => c.userData.actionId) as THREE.Mesh[];
  assert.equal(buttons.length, title === 'Link' ? 5 : 4, 'link Open joins the same shared capsule');
  const bounds = (mesh: THREE.Mesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox!; };
  const outer = bounds(capsule);
  const material = capsule.material as THREE.MeshBasicMaterial;
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.opacity, 1);
  assert.equal(material.toneMapped, false);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1, 3);
  menu.follow(new THREE.Vector3(), camera); menu.group.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(menu.group.quaternion);
  const rayAt = (local: THREE.Vector3) => {
    const world = menu.group.localToWorld(local.clone());
    return new THREE.Raycaster(world.clone().add(normal), normal.clone().negate());
  };
  for (const [i, button] of buttons.entries()) {
    assert.ok(button.geometry instanceof THREE.ShapeGeometry, 'pill silhouette is real geometry, not a rectangular hit plane');
    const box = bounds(button);
    assert.ok(box.min.x + button.position.x > outer.min.x && box.max.x + button.position.x < outer.max.x);
    assert.ok(box.min.y > outer.min.y && box.max.y < outer.max.y, 'even outer padding');
    assert.equal(menu.hit(rayAt(button.position))?.object, button, 'centers remain actionable');
    assert.equal(menu.hit(rayAt(button.position.clone().add(new THREE.Vector3(box.max.x - .001, box.max.y - .001, 0)))), null, 'rounded corners do not steal world rays');
    if (i) assert.ok(button.position.x + box.min.x > buttons[i - 1].position.x + bounds(buttons[i - 1]).max.x, 'separated buttons');
  }
  const gap = buttons[0].position.clone().add(buttons[1].position).multiplyScalar(.5);
  assert.equal(menu.hit(rayAt(gap)), null, 'container gaps do not capture menu rays');
  assert.deepEqual(rayAt(gap).intersectObject(capsule, false), [], 'container also ignores scene-wide raycasts');
  let geometryDisposed = false, textureDisposed = false, materialDisposed = false;
  capsule.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  material.map!.addEventListener('dispose', () => { textureDisposed = true; });
  material.addEventListener('dispose', () => { materialDisposed = true; });
  store.select(null);
  assert.ok(geometryDisposed && textureDisposed && materialDisposed, 'rebuild frees shared backdrop resources');
  assert.equal(menu.group.getObjectByName('xr-object-toolbar'), undefined);
  assert.equal(menu.group.visible, false);
});

test('granted DOM overlay skips the canvas embed so the shared iframe can play', () => {
  const store = new Store(newRoom());
  const menu = new XrObjectMenu(store, () => {});
  menu.useDomOverlay = true;
  const id = store.addItem({ title: 'Song', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'video', kind: 'tv' });
  store.select(id);
  assert.equal(menu.group.getObjectByName('xr-preview'), undefined);
  assert.ok(menu.group.children.find(o => o.userData.actionId === 'cancel'));
});

test('overlay grant is recorded from the WebXR session so a selected embed can open in VR', () => {
  assert.equal(overlayIsGranted({ domOverlayState: { type: 'screen' } }), true);
  assert.equal(overlayIsGranted({ domOverlayState: { type: null } }), false);
  assert.equal(overlayIsGranted({}), false);
});
