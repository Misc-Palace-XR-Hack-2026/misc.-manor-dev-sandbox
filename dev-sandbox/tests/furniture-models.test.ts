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
