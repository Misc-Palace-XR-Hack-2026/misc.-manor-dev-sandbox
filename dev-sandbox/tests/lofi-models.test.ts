import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { disposeGroup } from '../src/views/resources';

globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})} as unknown as Document;

test('each lofi kind builds an independently disposable low-poly model at slot scale', () => {
  for (const kind of ['cat','teapot','lantern','headphones','cassette','cushion'] as const) {
    const first = buildObject(kind), second = buildObject(kind);
    const bounds = new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3());
    assert.ok(bounds.x > .15 && bounds.x < 1.8, `${kind} width ${bounds.x}`);
    assert.ok(bounds.z > .15 && bounds.z < 1.8, `${kind} depth ${bounds.z}`);
    assert.ok(bounds.y > .08 && bounds.y < 1.6, `${kind} height ${bounds.y}`);
    const materials = new Set<THREE.Material>();
    first.traverse(o => { if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material); });
    assert.ok(materials.size > 0, `${kind} has meshes`);
    second.traverse(o => { if (o instanceof THREE.Mesh) assert.ok(!materials.has(o.material as THREE.Material)); });
    disposeGroup(first); disposeGroup(second);
  }
});

test('sleeping cat reads as a loaf: grounded, wider than tall, with a head and two ears', () => {
  const cat = buildObject('cat');
  const size = new THREE.Box3().setFromObject(cat).getSize(new THREE.Vector3());
  const min = new THREE.Box3().setFromObject(cat).min;
  assert.ok(size.x > size.y, `loaf should be wider than tall, got ${size.x} x ${size.y}`);
  assert.ok(min.y > -0.02 && min.y < 0.05, `base should sit on the slot, min.y=${min.y}`);
  assert.ok(cat.getObjectByName('cat-body'));
  assert.ok(cat.getObjectByName('cat-head'));
  assert.ok(cat.getObjectByName('cat-ear-l'));
  assert.ok(cat.getObjectByName('cat-ear-r'));
  assert.ok(cat.getObjectByName('cat-tail'));
  const head = cat.getObjectByName('cat-head')!;
  const earL = cat.getObjectByName('cat-ear-l')!;
  const earR = cat.getObjectByName('cat-ear-r')!;
  assert.ok(earL.position.y > head.position.y, 'left ear sits on the head');
  assert.ok(earR.position.y > head.position.y, 'right ear sits on the head');
  disposeGroup(cat);
});
