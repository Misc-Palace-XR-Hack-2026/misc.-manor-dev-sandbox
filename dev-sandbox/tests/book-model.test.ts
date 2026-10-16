import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { disposeGroup } from '../src/views/resources';
import { Store, newRoom, validateRoom } from '../src/core/store';

globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) } as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

test('standing book has named front and back covers enclosing the page block', () => {
  const g = buildObject('book');
  try {
    const front = g.getObjectByName('book-front');
    const back = g.getObjectByName('book-back');
    const pages = g.getObjectByName('book-pages');
    const spine = g.getObjectByName('book-spine');
    assert.ok(front, 'front cover mesh');
    assert.ok(back, 'back cover mesh');
    assert.ok(pages, 'page block');
    assert.ok(spine, 'spine');
    g.updateMatrixWorld(true);
    const z = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
    const frontZ = z(front!);
    const backZ = z(back!);
    const pageZ = z(pages!);
    assert.ok(frontZ.min.z >= pageZ.max.z - 0.01, 'front cover sits on the +Z face of the pages');
    assert.ok(backZ.max.z <= pageZ.min.z + 0.01, 'back cover sits on the -Z face of the pages');
    assert.ok(frontZ.min.z - backZ.max.z > 0.04, 'covers enclose the page block with a gap, not a single slab');
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    assert.ok(size.x > 0.4 && size.y > 0.5 && size.z > 0.2 && size.z < 0.7, `book proportions ${size.x.toFixed(2)} ${size.y.toFixed(2)} ${size.z.toFixed(2)}`);
  } finally {
    disposeGroup(g);
  }
});

test('assignable book still places, saves, and restores content', () => {
  const store = new Store(newRoom());
  const id = store.addItem({ title: 'Keep me', sourceRef: 'A note inside the book', type: 'note', kind: 'book' });
  const slot = store.slotOf(id);
  const content = structuredClone(store.state.contentItems);
  store.pickUp(id);
  store.place(id, slot!);
  const loaded = new Store(JSON.parse(store.exportJson()));
  assert.equal(validateRoom(loaded.state), null);
  assert.equal(loaded.state.representations[0].objectKind, 'book');
  assert.deepEqual(loaded.state.contentItems, content);
  assert.equal(loaded.slotOf(id), slot);
});
