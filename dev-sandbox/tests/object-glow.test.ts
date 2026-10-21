import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { animateIgnite } from '../src/views/ignite-objects';
import { disposeGroup } from '../src/views/resources';
import { LAMP_LIGHT, applyLampLightBudget } from '../src/views/cozy-objects';
import { GLOWING_KINDS } from '../src/views/glow';

globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) } as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

function emissives(root: THREE.Object3D, prefix: string): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name.startsWith(prefix)) {
      const m = o.material as THREE.MeshStandardMaterial;
      if (m && 'emissiveIntensity' in m) out.push(m);
    }
  });
  return out;
}

test('flying saucer rim lights are emissive and blink over time', () => {
  const g = buildObject('flyingSaucer');
  const rim = emissives(g, 'saucer-light-');
  assert.equal(rim.length, 10, 'all ten rim lights exist');
  assert.ok(rim.every((m) => m.emissiveIntensity > 0), 'rim lights glow at rest');

  animateIgnite(g, 0);
  const a = rim.map((m) => m.emissiveIntensity);
  animateIgnite(g, 0.6);
  const b = rim.map((m) => m.emissiveIntensity);
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.1), 'rim brightness changes over time');

  // Blink, not a uniform fade: at a given instant the ring is not all one brightness.
  assert.ok(Math.max(...b) - Math.min(...b) > 0.1, 'lights chase around the rim');

  // Pure function of absolute time: revisiting a time restores the same frame.
  animateIgnite(g, 97.3);
  animateIgnite(g, 0.6);
  assert.deepEqual(rim.map((m) => m.emissiveIntensity), b, 'time-based, not incremental');

  // Bounded: never negative, never blown out.
  for (const t of [0, 0.37, 1.1, 5.5, 13.2, 101.7]) {
    animateIgnite(g, t);
    assert.ok(rim.every((m) => m.emissiveIntensity >= 0 && m.emissiveIntensity <= 3), `bounded at t=${t}`);
  }
});

test('lava lamp wax glows and pulses', () => {
  const g = buildObject('lavaLamp');
  const wax = emissives(g, 'lava-blob-');
  assert.equal(wax.length, 3, 'three blobs');
  assert.ok(wax.every((m) => m.emissiveIntensity > 0), 'wax glows at rest');
  animateIgnite(g, 0);
  const a = wax.map((m) => m.emissiveIntensity);
  animateIgnite(g, 2.4);
  const b = wax.map((m) => m.emissiveIntensity);
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.05), 'wax brightness breathes');
  animateIgnite(g, 2.4);
  assert.deepEqual(wax.map((m) => m.emissiveIntensity), b, 'pure function of time');
});

test('lava lamp casts a moody local light registered in the lamp light budget', () => {
  const g = buildObject('lavaLamp');
  let light: THREE.PointLight | undefined;
  g.traverse((o) => { if (o instanceof THREE.PointLight) light = o; });
  assert.ok(light, 'lava lamp must own a real PointLight');
  assert.equal(light!.name, 'lamp-light', 'joins the existing lamp light budget by name');
  assert.ok(light!.intensity > 0);
  assert.ok(light!.intensity < LAMP_LIGHT.intensity, 'moodier and dimmer than a reading lamp');
  assert.ok(light!.distance >= 1.2 && light!.distance <= LAMP_LIGHT.distance, 'local pool, not a room fill');
  g.position.set(-1.7, 0, 2.2);
  g.updateMatrixWorld(true);
  const world = light!.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(world.x + 1.7) < 0.4 && Math.abs(world.z - 2.2) < 0.4, 'light follows the lamp');
  assert.ok(world.y > 0.2, 'light sits up in the wax column');

  const lit = light!.intensity;
  animateIgnite(g, 0);
  animateIgnite(g, 3.1);
  assert.notEqual(light!.intensity, lit, 'the pool breathes with the wax');
  assert.ok(light!.intensity > 0 && light!.intensity <= LAMP_LIGHT.intensity, 'stays within the lamp budget band');
  disposeGroup(g);
  assert.equal(light!.parent, null, 'light released with the group');
});

test('budget still caps object lights when many glowing objects are placed, and animation cannot relight them', () => {
  const root = new THREE.Group();
  const groups: THREE.Group[] = [];
  for (let i = 0; i < LAMP_LIGHT.maxCount + 3; i++) {
    const g = buildObject(i % 2 ? 'lavaLamp' : 'lamp');
    groups.push(g);
    root.add(g);
  }
  applyLampLightBudget(root);
  const lights: THREE.PointLight[] = [];
  root.traverse((o) => { if (o instanceof THREE.PointLight) lights.push(o); });
  assert.equal(lights.length, LAMP_LIGHT.maxCount + 3);
  assert.equal(lights.filter((l) => l.intensity > 0).length, LAMP_LIGHT.maxCount, 'budget caps lit lights');
  for (const t of [0, 1.3, 7.9, 60]) {
    animateIgnite(root, t);
    assert.equal(lights.filter((l) => l.intensity > 0).length, LAMP_LIGHT.maxCount, `budget holds while animating at t=${t}`);
    assert.ok(lights.every((l) => l.intensity <= LAMP_LIGHT.intensity), 'no light exceeds the budget intensity');
  }
  groups.forEach(disposeGroup);
});

test('reduced motion freezes every glowing object at its t=0 frame', () => {
  for (const kind of GLOWING_KINDS) {
    const g = buildObject(kind);
    const animated: THREE.Object3D[] = [];
    g.traverse((o) => { if (typeof o.userData.animate === 'function') animated.push(o); });
    assert.ok(animated.length > 0, `${kind} has at least one animated indicator`);
    const sample = () => {
      const out: number[] = [];
      g.traverse((o) => {
        if (o instanceof THREE.PointLight) out.push(o.intensity);
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshStandardMaterial;
          if (m && typeof m.emissiveIntensity === 'number') out.push(m.emissiveIntensity);
        }
      });
      return out;
    };
    animateIgnite(g, 0, true);
    const frozen = sample();
    for (const t of [0.4, 3.7, 42]) {
      animateIgnite(g, t, true);
      assert.deepEqual(sample(), frozen, `${kind} frozen under reduced motion at t=${t}`);
    }
    animateIgnite(g, 3.7, false);
    assert.notDeepEqual(sample(), frozen, `${kind} does animate when motion is allowed`);
    disposeGroup(g);
  }
});

// The indicator each kind actually has on the real object. Nothing is invented for kinds whose
// real counterpart is unlit (dice, cactus, skateboard, telescope, a bare cartridge, a VHS tape).
const INDICATORS: Record<string, string[]> = {
  tv: ['tv-screen', 'tv-power-led'],
  console: ['console-button-a', 'console-button-b', 'console-power-led'],
  boombox: ['boombox-power-led'],
  synthesizer: ['synth-display'],
  robot: ['robot-eye-l', 'robot-eye-r'],
  coffeeMaker: ['coffee-switch'],
  lantern: ['lantern-paper'],
};

test('each indicator kind lights exactly the parts the real object has, and they animate', () => {
  for (const [kind, names] of Object.entries(INDICATORS)) {
    const g = buildObject(kind as Parameters<typeof buildObject>[0]);
    for (const name of names) {
      const part = g.getObjectByName(name);
      assert.ok(part, `${kind}: missing ${name}`);
      const mat = (part as THREE.Mesh).material as THREE.MeshStandardMaterial;
      assert.ok(mat.emissiveIntensity > 0, `${kind} ${name} is emissive`);
      assert.ok(mat.emissive.getHex() !== 0x000000, `${kind} ${name} has an emissive colour`);
    }
    const mats = names.map((n) => (g.getObjectByName(n) as THREE.Mesh).material as THREE.MeshStandardMaterial);
    animateIgnite(g, 0);
    const a = mats.map((m) => m.emissiveIntensity);
    let moved = false;
    for (const t of [0.3, 0.9, 1.7, 2.6, 4.1]) {
      animateIgnite(g, t);
      if (mats.some((m, i) => Math.abs(m.emissiveIntensity - a[i]) > 0.02)) moved = true;
      assert.ok(mats.every((m) => m.emissiveIntensity >= 0 && m.emissiveIntensity <= 3), `${kind} bounded at t=${t}`);
    }
    assert.ok(moved, `${kind} indicators animate over time`);
    disposeGroup(g);
  }
});

test('unlit kinds gain no indicators', () => {
  for (const kind of ['dice', 'cactus', 'skateboard', 'telescope', 'cartridge', 'vhs', 'rubiksCube'] as const) {
    const g = buildObject(kind);
    g.traverse((o) => {
      assert.ok(!(o instanceof THREE.PointLight), `${kind} must not own a light`);
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (m && m.emissive) assert.equal(m.emissive.getHex(), 0x000000, `${kind} ${o.name} must not glow`);
      }
    });
    disposeGroup(g);
  }
});
