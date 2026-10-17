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
