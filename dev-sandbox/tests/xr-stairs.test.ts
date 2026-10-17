import test from 'node:test';
import assert from 'node:assert/strict';
import * as interaction from '../src/xr/interaction';

test('stair walking continuously climbs and descends both landings without leaving route', () => {
  const walk = (interaction as any).walkStairs;
  assert.equal(typeof walk, 'function');
  let p = { x: .7, y: 0, z: 6.1 };
  for (let i=0;i<500;i++) {
    const next = walk(p, -1, .016);
    assert.ok(next.y >= p.y && next.y-p.y < .02);
    p = next;
  }
  assert.equal(p.y, 2.3);
  assert.equal(p.z, 2.6);
  for (let i=0;i<500;i++) {
    const next = walk(p, 1, .016);
    assert.ok(next.y <= p.y && p.y-next.y < .02);
    p = next;
  }
  assert.equal(p.y, 0);
  assert.equal(p.z, 6.2);
  for (const invalid of [{x:2,y:0,z:4}, {x:.7,y:0,z:4}, {x:.1,y:0,z:6}, {x:.7,y:4,z:3}]) {
    assert.deepEqual(walk(invalid,-1,.016), invalid);
  }
  assert.deepEqual(walk(p, .1, .016), p);
  assert.ok(Math.abs(walk(p,-1,10).z-p.z) <= .05);
});

test('stairs are walkable like the floor: teleport onto the ramp, not a special stick mode', () => {
  const mid = interaction.walkableAt({ x: 0.7, y: 1.2, z: 4.4 });
  assert.ok(mid);
  assert.equal(mid!.x, 0.7);
  assert.equal(mid!.z, 4.4);
  assert.ok(mid!.y > 0.3 && mid!.y < 2.3, `ramp height ${mid!.y}`);
  assert.deepEqual(interaction.stickForwardTeleport({ x: 0.7, y: 1.2, z: 4.4 }, false, -0.8), mid);
  assert.deepEqual(interaction.walkableAt({ x: 0.7, y: 0.02, z: 4.4 }), { x: 0.7, y: 0, z: 4.4 }, 'floor under the stairs stays floor');
  assert.equal(interaction.runPanelAction({} as never, 'stairs:bottom').stairs, undefined, 'stair buttons must not enter a special stick mode');
  assert.deepEqual(interaction.runPanelAction({} as never, 'stairs:bottom').teleport, { x: .7, y: 0, z: 6.2 });
});
