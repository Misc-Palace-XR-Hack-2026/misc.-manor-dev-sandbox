import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';

function meshes(g: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  g.updateMatrixWorld(true);
  g.traverse(o => { if (o instanceof THREE.Mesh) result.push(o); });
  return result;
}
const bounds = (o: THREE.Object3D) => {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o);
};
const center = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const axis = (o: THREE.Object3D) => new THREE.Vector3(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
function caps(o: THREE.Object3D): THREE.Vector3[] {
  const m = o as THREE.Mesh<THREE.CylinderGeometry>;
  m.updateWorldMatrix(true, false);
  return [-1, 1].map(sign => m.localToWorld(new THREE.Vector3(0, sign * m.geometry.parameters.height / 2, 0)));
}
function connected(g: THREE.Object3D) {
  const parts = meshes(g), reached = new Set([parts[0]]);
  for (let i = 0; i < parts.length; i++) for (const p of parts) {
    if ([...reached].some(r => bounds(r).expandByScalar(.001).intersectsBox(bounds(p)))) reached.add(p);
  }
  assert.equal(reached.size, parts.length, 'all assembly parts must touch a connected component');
}

test('robot eyes sit within head height on the forward face, not above the head', () => {
  const g = buildObject('robot');
  const head = g.getObjectByName('robot-head') ?? g.children[1];
  const h = bounds(head);
  const eyes = meshes(g).filter(m => m.name.startsWith('robot-eye') || m.geometry instanceof THREE.CylinderGeometry);
  assert.equal(eyes.length, 2);
  for (const eye of eyes) {
    const e = bounds(eye);
    assert.ok(e.min.y > h.min.y && e.max.y < h.max.y, 'eyes fit inside head height');
    assert.ok(Math.abs(axis(eye).z) > .999, 'eye faces point along +Z');
    assert.ok(e.min.z <= h.max.z && e.max.z > h.max.z, 'eyes embed into forward face');
    assert.ok(e.min.x > h.min.x && e.max.x < h.max.x);
  }
  assert.ok(center(eyes[0]).x < 0 && center(eyes[1]).x > 0);
});

test('vinyl disc is upright, parallel to its jacket, partly emerging with a flush label', () => {
  const g = buildObject('recordSleeve');
  const disc = g.getObjectByName('recordSleeve-disc') ?? meshes(g).find(m => m.geometry instanceof THREE.CylinderGeometry)!;
  assert.ok(Math.abs(axis(disc).z) > .999, 'disc normal must face forward, not upward');
  const cover = g.getObjectByName('recordSleeve-cover') ?? g.children[0];
  const d = bounds(disc), c = bounds(cover);
  assert.ok(d.min.x < c.max.x && d.max.x > c.max.x + .1, 'disc overlaps jacket and emerges at its side');
  assert.ok(d.min.y >= c.min.y && d.max.y <= c.max.y, 'record fits jacket height');
  const label = g.getObjectByName('recordSleeve-label')!;
  assert.ok(label, 'exposed record has a label');
  assert.ok(Math.abs(axis(label).dot(axis(disc))) > .999);
  assert.ok(center(label).sub(center(disc)).cross(axis(disc)).length() < .001);
  assert.ok(bounds(label).intersectsBox(d), 'label touches disc');
  connected(g);
});

test('motorcycle wheels roll along the wheelbase, touch ground, and attach to the frame', () => {
  const g = buildObject('motorcycle');
  const wheels = meshes(g).filter(m => m.name.startsWith('motorcycle-tire') ||
    (m.geometry instanceof THREE.CylinderGeometry && m.geometry.parameters.radiusTop === .08));
  assert.equal(wheels.length, 2);
  const travel = center(wheels[1]).sub(center(wheels[0])).normalize();
  for (const w of wheels) {
    assert.ok(Math.abs(axis(w).dot(travel)) < .001, 'axles must be perpendicular to wheelbase');
    assert.ok(Math.abs(axis(w).y) < .001, 'wheel planes must be vertical');
    assert.ok(Math.abs(bounds(w).min.y) < .002, 'tires must meet floor');
  }
  assert.ok(Math.abs(axis(wheels[0]).dot(axis(wheels[1]))) > .999);
  assert.ok(Math.abs(center(wheels[0]).z - center(wheels[1]).z) < .001);
  for (const end of ['rear','front']) {
    const hub = g.getObjectByName(`motorcycle-hub-${end}`)!;
    const struts = meshes(g).filter(m => m.name.startsWith(end === 'front' ? 'motorcycle-fork-' : 'motorcycle-swingarm-'));
    assert.equal(struts.length, 2, 'each wheel has two attached supports');
    for (const strut of struts) {
      const p = caps(strut)[0], c = center(hub);
      assert.ok(Math.hypot(p.x-c.x,p.y-c.y) < .001, 'support ends at axle center in wheel plane');
      assert.ok(Math.abs(p.z-c.z) < .06, 'support is within hub width plus support radius');
    }
  }
  connected(g);
});

test('telescope optics share the inclined tube axis and connect to a grounded mount', () => {
  const g = buildObject('telescope');
  const cylinders = meshes(g).filter(m => m.geometry instanceof THREE.CylinderGeometry);
  const tube = g.getObjectByName('telescope-tube') ?? cylinders[0];
  const lens = g.getObjectByName('telescope-lens') ?? cylinders[1];
  assert.ok(Math.abs(axis(tube).dot(axis(lens))) > .999, 'lens must face along tube, not vertically');
  assert.ok(center(lens).sub(center(tube)).cross(axis(tube)).length() < .001, 'lens must be centered on tube axis');
  assert.ok(Math.abs(axis(tube).y) > .15 && Math.abs(axis(tube).y) < .8, 'tube is inclined');
  const mount = g.getObjectByName('telescope-mount')!;
  assert.ok(caps(mount)[1].distanceTo(center(tube)) < .001, 'mount top reaches the optical pivot');
  const rim = g.getObjectByName('telescope-rim')!;
  assert.ok(caps(rim)[1].distanceTo(caps(lens)[0]) < .003, 'lens meets the objective rim cap');
  for (const name of ['telescope-rim','telescope-eyepiece','telescope-collar']) {
    const part = g.getObjectByName(name)!;
    assert.ok(Math.abs(axis(part).dot(axis(tube))) > .999);
    assert.ok(center(part).sub(center(tube)).cross(axis(tube)).length() < .001, `${name} is coaxial`);
  }
  connected(g);
  assert.ok(Math.abs(bounds(g).min.y) < .002, 'tripod feet sit on floor');
});
