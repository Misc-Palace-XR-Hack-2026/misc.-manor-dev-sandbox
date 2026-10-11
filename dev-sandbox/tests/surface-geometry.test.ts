import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { getLayout, DEFAULT_LAYOUT_ID } from '../src/core/layout';

test('top stair joins loft without overlapping equal-height tread faces', () => {
  const layout = getLayout(DEFAULT_LAYOUT_ID)!;
  const mesh = (id: string) => {
    const b = layout.boxes.find(b => b.id === id)!;
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size));
    m.position.set(...b.min).add(new THREE.Vector3(...b.size).multiplyScalar(.5));
    return bounds(m);
  };
  const stair = mesh('step-4'), loft = mesh('loft');
  assert.ok(Math.abs(stair.max.y-loft.max.y)<1e-6, 'landing height is preserved');
  assert.ok(Math.abs(stair.min.z-loft.max.z)<1e-6, 'tread begins at loft edge: neither overlap nor gap');
  assert.ok(Math.abs(stair.max.z-3.55)<1e-6, 'outer edge still meets next stair');
});

test('headphone band arches above cups and both ends enter the earcups', () => {
  const g = buildObject('headphones');
  const band = g.children[0] as THREE.Mesh<THREE.TorusGeometry>;
  const cups = g.children.slice(1,3);
  const b = bounds(band);
  assert.ok(b.max.y > Math.max(...cups.map(c => bounds(c).max.y)) + .08, 'headband crown must rise above earcups');
  for (const [i, angle] of [Math.PI, 0].entries()) {
    const endpoint = band.localToWorld(new THREE.Vector3(.11*Math.cos(angle),0,0));
    assert.ok(bounds(cups[i]).containsPoint(endpoint), 'band endpoint must enter corresponding earcup');
  }
});

const bounds = (o: THREE.Object3D) => { o.updateWorldMatrix(true,true); return new THREE.Box3().setFromObject(o); };
test('teapot handle lies in the spout plane and penetrates the body at two attachments', () => {
  const g = buildObject('teapot');
  const handle = g.children.find(o => o instanceof THREE.Mesh && o.geometry instanceof THREE.TorusGeometry)!;
  const b = bounds(g.children[0]), h = bounds(handle);
  const normal = new THREE.Vector3(0,0,1).applyQuaternion(handle.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(Math.abs(normal.z) > .999, 'handle opening faces forward in XY, not sideways in YZ');
  assert.ok(h.min.x < b.min.x - .03 && h.max.x > b.min.x + .02, 'handle embeds in body and extends outward');
  // Two points on the inward side of the tube must lie inside the tapered body.
  for (const angle of [-Math.PI/4, Math.PI/4]) {
    const p = handle.localToWorld(new THREE.Vector3(.05*Math.cos(angle), .05*Math.sin(angle),0));
    g.worldToLocal(p);
    const radius = .07 + .02*(p.y-.02)/.14;
    assert.ok(p.y > .02 && p.y < .16 && Math.hypot(p.x,p.z) < radius, 'upper/lower handle attachments enter ceramic');
  }
});
