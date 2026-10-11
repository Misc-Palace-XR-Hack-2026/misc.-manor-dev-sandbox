import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { disposeGroup } from '../src/views/resources';

// Canvas drawing is verified in Chromium; this test checks ownership and geometry.
globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})} as unknown as Document;
test('each furniture kind builds only its own independently disposable model at slot scale', () => {
  for (const kind of ['armchair','sideTable','turntable','rug','plant'] as const) {
    const first = buildObject(kind), second = buildObject(kind);
    const bounds = new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3());
    assert.ok(bounds.x > .3 && bounds.x < 2, `${kind} width ${bounds.x}`);
    assert.ok(bounds.z > .3 && bounds.z < 2, `${kind} depth ${bounds.z}`);
    const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    first.traverse(o => { if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial; materials.add(m); if (m.map) textures.add(m.map);
    }});
    assert.ok(materials.size > 0);
    second.traverse(o => { if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial;
      assert.ok(!materials.has(m)); if (m.map) assert.ok(!textures.has(m.map));
    }});
    if (kind === 'armchair' || kind === 'turntable' || kind === 'rug') assert.ok(textures.size > 0);
    if (kind === 'plant') assert.ok(first.getObjectByProperty('type','Mesh') && first.children[0].children.length > 30);
    disposeGroup(first); disposeGroup(second);
  }
});

test('armchair tuft buttons embed in the tilted backrest at every row', () => {
  const g = buildObject('armchair');
  const parts: THREE.Mesh[] = [];
  g.traverse(o => { if (o instanceof THREE.Mesh) parts.push(o); });
  const back = parts.find(m => m.geometry instanceof THREE.BoxGeometry && m.geometry.parameters.height === .54)!;
  const buttons = parts.filter(m => m.geometry instanceof THREE.SphereGeometry && m.geometry.parameters.radius === .015);
  assert.equal(buttons.length, 9);
  g.updateMatrixWorld(true);
  for (const button of buttons) {
    const p = back.worldToLocal(button.getWorldPosition(new THREE.Vector3()));
    assert.ok(p.z - .015 < .06 && p.z + .015 > .06, `button must intersect front upholstery, local z=${p.z}`);
    assert.ok(Math.abs(p.y) < .27 && Math.abs(p.x) < .34);
  }
});

test('turntable cabinet is about TV height, not a full-size desk', () => {
  const tv = buildObject('tv');
  const table = buildObject('turntable');
  const tvSize = new THREE.Box3().setFromObject(tv).getSize(new THREE.Vector3());
  const tableSize = new THREE.Box3().setFromObject(table).getSize(new THREE.Vector3());
  const tableMin = new THREE.Box3().setFromObject(table).min;
  assert.ok(tableSize.y < tvSize.y * 1.2, `turntable ${tableSize.y} should be near TV ${tvSize.y}`);
  assert.ok(tableSize.y > tvSize.y * 0.7, `turntable ${tableSize.y} should not collapse under TV ${tvSize.y}`);
  assert.ok(tableMin.y > -0.04 && tableMin.y < 0.05, `base should sit on the slot, min.y=${tableMin.y}`);
  disposeGroup(tv); disposeGroup(table);
});
