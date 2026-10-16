import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { disposeGroup } from '../src/views/resources';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { LAMP_LIGHT, lampLightBudget, applyLampLightBudget } from '../src/views/cozy-objects';

globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) } as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

function lampLight(g: THREE.Object3D): THREE.PointLight | undefined {
  let found: THREE.PointLight | undefined;
  g.traverse((o) => {
    if (o instanceof THREE.PointLight) found = o;
  });
  return found;
}

test('table lamp emits a local light that follows placement', () => {
  const g = buildObject('lamp');
  try {
    const light = lampLight(g);
    assert.ok(light, 'lamp builder must return a PointLight, not only an emissive shade');
    assert.ok(light!.intensity > 0);
    assert.equal(light!.intensity, LAMP_LIGHT.intensity);
    assert.equal(light!.distance, LAMP_LIGHT.distance);
    assert.ok(light!.distance >= 1.5 && light!.distance <= 4.5, 'range is local, not a room fill');
    g.position.set(2.4, 0, 3.1);
    g.updateMatrixWorld(true);
    const world = light!.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(world.x - 2.4) < 0.4, 'light follows the lamp on X');
    assert.ok(Math.abs(world.z - 3.1) < 0.4, 'light follows the lamp on Z');
    assert.ok(world.y > 0.4, 'light sits up in the shade, not in the base');
  } finally {
    disposeGroup(g);
  }
});

test('lamp light budget caps concurrent object lights', () => {
  assert.equal(lampLightBudget(1), 1);
  assert.equal(lampLightBudget(LAMP_LIGHT.maxCount), LAMP_LIGHT.maxCount);
  assert.equal(lampLightBudget(LAMP_LIGHT.maxCount + 5), LAMP_LIGHT.maxCount);
  assert.ok(LAMP_LIGHT.maxCount >= 4 && LAMP_LIGHT.maxCount <= 12);
  const root = new THREE.Group();
  for (let i = 0; i < LAMP_LIGHT.maxCount + 2; i++) root.add(buildObject('lamp'));
  applyLampLightBudget(root);
  const intensities: number[] = [];
  root.traverse((o) => { if (o instanceof THREE.PointLight) intensities.push(o.intensity); });
  assert.equal(intensities.filter((v) => v > 0).length, LAMP_LIGHT.maxCount);
  assert.equal(intensities.filter((v) => v === 0).length, 2);
  root.children.forEach((child) => { if (child instanceof THREE.Group) disposeGroup(child); });
});

test('disposing a lamp removes its light; content and placement still save', () => {
  const g = buildObject('lamp');
  const light = lampLight(g)!;
  assert.ok(light.parent);
  disposeGroup(g);
  assert.equal(light.parent, null);

  const store = new Store(newRoom());
  store.setLighting('candlelight');
  const id = store.addItem({ title: 'Keep the lamp', sourceRef: 'A cozy note', type: 'note', kind: 'lamp' });
  const slot = store.slotOf(id);
  const content = structuredClone(store.state.contentItems);
  store.pickUp(id);
  store.select(null);
  assert.equal(store.slotOf(id), slot);
  const loaded = new Store(JSON.parse(store.exportJson()));
  assert.equal(validateRoom(loaded.state), null);
  assert.equal(loaded.state.lighting, 'candlelight');
  assert.equal(loaded.state.representations[0].objectKind, 'lamp');
  assert.deepEqual(loaded.state.contentItems, content);
});
