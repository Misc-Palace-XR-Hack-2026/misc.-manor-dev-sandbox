import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { disposeGroup } from '../src/views/resources';

const NEW_KINDS = [
  'console', 'cartridge', 'vhs', 'recordSleeve', 'spoon', 'robot', 'telescope', 'car', 'motorcycle',
] as const;

globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})} as unknown as Document;

test('each new kind builds an independently disposable low-poly model at slot scale', () => {
  for (const kind of NEW_KINDS) {
    const first = buildObject(kind), second = buildObject(kind);
    const bounds = new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3());
    assert.ok(bounds.x > .12 && bounds.x < 1.9, `${kind} width ${bounds.x}`);
    assert.ok(bounds.z > .12 && bounds.z < 1.9, `${kind} depth ${bounds.z}`);
    assert.ok(bounds.y > .06 && bounds.y < 1.7, `${kind} height ${bounds.y}`);
    const materials = new Set<THREE.Material>();
    first.traverse(o => { if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material); });
    assert.ok(materials.size > 0, `${kind} has meshes`);
    second.traverse(o => { if (o instanceof THREE.Mesh) assert.ok(!materials.has(o.material as THREE.Material)); });
    disposeGroup(first); disposeGroup(second);
  }
});

test('TV has knobs, antenna, and a named screen', () => {
  const tv = buildObject('tv');
  assert.ok(tv.getObjectByName('tv-screen'));
  assert.ok(tv.getObjectByName('tv-knob-l'));
  assert.ok(tv.getObjectByName('tv-knob-r'));
  assert.ok(tv.getObjectByName('tv-antenna-l'));
  assert.ok(tv.getObjectByName('tv-antenna-r'));
  disposeGroup(tv);
});

test('sleeping cat is a slimmer loaf, not a sphere blob', () => {
  const cat = buildObject('cat');
  const size = new THREE.Box3().setFromObject(cat).getSize(new THREE.Vector3());
  const min = new THREE.Box3().setFromObject(cat).min;
  assert.ok(size.x > size.y, `loaf should be wider than tall, got ${size.x} x ${size.y}`);
  assert.ok(size.x < 0.72, `cat should be slimmer, width ${size.x}`);
  assert.ok(size.z < 0.58, `cat should not be a fat sphere, depth ${size.z}`);
  assert.ok(min.y > -0.02 && min.y < 0.05, `base should sit on the slot, min.y=${min.y}`);
  assert.ok(cat.getObjectByName('cat-body'));
  assert.ok(cat.getObjectByName('cat-head'));
  disposeGroup(cat);
});
