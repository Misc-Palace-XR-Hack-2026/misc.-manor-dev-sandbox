import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Store, newRoom } from '../src/core/store';
import { XrObjectMenu } from '../src/xr/object-menu';

// Canvas drawing is unavailable in Node; geometry and visibility use real Three.js.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) } as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;

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
