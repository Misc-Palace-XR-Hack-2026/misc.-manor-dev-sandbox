import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLayout } from '../src/core/layout';
import {
  BOUNDS_INSET,
  clampInRegion,
  clampPitch,
  dollyLens,
  EYE_HEIGHT,
  FLAT_FOV,
  overviewExitEnd,
  floorRegionsFromBoxes,
  glidePose,
  horizontalYaw,
  overviewEntryStart,
  regionForPoint,
  sanitizePose,
  shortestYawDelta,
  stepWalk,
  WALK_FOV,
  ZOOM_TOP,
  blockedAbove,
  ceilingAt,
  eyeYForFloor,
  insetOf,
  dragLook,
  popLanding,
  slabAbove,
  slideBack,
  walkClear,
  zoomEyeY,
  zoomTilt,
} from '../src/core/walk';

const cozy = () => floorRegionsFromBoxes(getLayout('cozy-loft')!.boxes);
const STAND = { x: 8.3, y: EYE_HEIGHT, z: 4.8, yaw: 0, pitch: -0.12 };

test('drag grabs the world: right turns left, down tilts up', () => {
  const r = dragLook(0, 0, 50, 0);
  assert.ok(r.yaw > 0, 'positive yaw turns toward -x, i.e. left when facing north');
  assert.ok(dragLook(0, 0, 0, 50).pitch > 0);
});

test('zoom lifts the eye up to the room top, and only the ceiling stops it', () => {
  const regions = cozy();
  assert.equal(zoomEyeY(regions, 0, 0, STAND.x, STAND.z), EYE_HEIGHT);
  const half = zoomEyeY(regions, 0, 0.5, STAND.x, STAND.z);
  const full = zoomEyeY(regions, 0, 1, STAND.x, STAND.z);
  assert.ok(half > EYE_HEIGHT && full > half && full <= ZOOM_TOP);
  // Under the loft the eye stops just below its underside (2.0).
  const under = zoomEyeY(regions, 0, 1, 2, 1.5);
  assert.ok(under < 2 && under >= EYE_HEIGHT);
  assert.equal(ceilingAt(regions, 0, 2, 1.5), under);
});

test('stepping back stops at the wall instead of pushing the visitor anywhere else', () => {
  const regions = cozy();
  const ground = regions.find((r) => r.floorY === 0)!;
  const [x, z] = slideBack(regions, ground, STAND.x, EYE_HEIGHT, 6.5, 0, 3.5);
  assert.equal(x, STAND.x);
  assert.ok(z <= ground.maxZ - BOUNDS_INSET + 1e-6 && z > 6.5 - 1e-9);
  const [fx, fz] = slideBack(regions, ground, STAND.x, EYE_HEIGHT, STAND.z, 0, 1);
  assert.equal(fx, STAND.x);
  assert.ok(Math.abs(fz - (STAND.z + 1)) < 1e-9, 'open floor: steps the full distance');
});

test('a lifted visitor cannot step in under the loft, a standing one can', () => {
  const regions = cozy();
  const ground = regions.find((r) => r.floorY === 0)!;
  // East of the loft, facing east: stepping back heads under it.
  const [lx] = slideBack(regions, ground, 5, 3.2, 2, -Math.PI / 2, 2);
  assert.ok(lx >= 4.3 - 1e-9, `stopped at the loft edge, got x ${lx}`);
  const [sx] = slideBack(regions, ground, 5, EYE_HEIGHT, 2, -Math.PI / 2, 2);
  assert.ok(Math.abs(sx - 3) < 1e-9);
  assert.equal(walkClear(regions, ground, 3, 3.2, 2), false);
  assert.equal(walkClear(regions, ground, 3, EYE_HEIGHT, 2), true);
});

test('stair steps are standable: tapping a step top finds that step, not the floor or the loft', () => {
  const layout = getLayout('cozy-loft')!;
  const regions = floorRegionsFromBoxes(layout.boxes);
  const steps = layout.boxes.filter((b) => b.id.startsWith('step-'));
  assert.equal(steps.length, 4);
  for (const b of steps) {
    const top = b.min[1] + b.size[1];
    const cx = b.min[0] + b.size[0] / 2, cz = b.min[2] + b.size[2] / 2;
    const r = regionForPoint(regions, cx, top, cz)!;
    assert.equal(r.floorY, top, b.id);
    assert.equal(r.minZ, b.min[2], `${b.id}: its own footprint`);
    // The eye can stand there, off the wall.
    const [x, z] = clampInRegion(cx, cz, r, insetOf(r));
    assert.ok(walkClear(regions, r, x, eyeYForFloor(top), z), b.id);
    assert.ok(x >= 0.3 - 1e-9);
  }
  // The loft itself still resolves to the loft, even though the landing step is level with it.
  assert.equal(regionForPoint(regions, 2, 2.3, 1.8)?.maxX, 4);
});

test('the low stair steps are obstacles, not ceilings, for someone on the ground', () => {
  const regions = cozy();
  // Under the third step (bottom at 1.45) is below eye height: it never becomes the ceiling.
  assert.equal(ceilingAt(regions, 0, 0.7, 3.9), ZOOM_TOP);
});

test('zooming out under the loft is blocked above; in the open it is not', () => {
  const regions = cozy();
  assert.equal(blockedAbove(regions, 0, 0.5, 2, 1.5), true);
  assert.equal(blockedAbove(regions, 0, 0, 2, 1.5), false, 'standing still fits under it');
  assert.equal(blockedAbove(regions, 0, 1, STAND.x, STAND.z), false);
  assert.equal(slabAbove(regions, 0, 2, 1.5)?.floorY, 2.3);
  assert.equal(slabAbove(regions, 2.3, 2, 1.5), null, 'nothing above the loft itself');
});

test('popping up lands on the loft, in from its edge and out of the block on it', () => {
  const layout = getLayout('cozy-loft')!;
  const regions = floorRegionsFromBoxes(layout.boxes);
  const loft = regions.find((r) => r.floorY === 2.3)!;
  const onLoft = (x: number, z: number) =>
    x >= loft.minX + BOUNDS_INSET - 1e-9 && x <= loft.maxX - BOUNDS_INSET + 1e-9 &&
    z >= loft.minZ + BOUNDS_INSET - 1e-9 && z <= loft.maxZ - BOUNDS_INSET + 1e-9;
  const [ox, oz] = popLanding(loft, layout.boxes, 1, 2);
  assert.deepEqual([ox, oz], [1, 2], 'open spot: straight up');
  const [ex, ez] = popLanding(loft, layout.boxes, 4.2, 2);
  assert.ok(onLoft(ex, ez), 'nudged in from the edge');
  // Under the peach block (x 1.3..3.3, z 0.1..1.0): lands beside it, not inside.
  const [bx, bz] = popLanding(loft, layout.boxes, 2.2, 0.7);
  assert.ok(onLoft(bx, bz));
  assert.ok(bz >= 1.0 + 0.3 || bx <= 1.3 - 0.3, `got ${bx}, ${bz}`);
});

test('lifting tilts the view down a little, never up', () => {
  assert.ok(zoomTilt(0, 2) < 0);
  assert.equal(zoomTilt(0.1, -1), 0.1);
});

test('floor regions come from floor material boxes only', () => {
  const layout = getLayout('cozy-loft')!;
  const regions = floorRegionsFromBoxes(layout.boxes).filter((r) => r.inset === undefined);
  assert.equal(regions.length, 2);
  const ground = regions.find((r) => r.floorY === 0)!;
  assert.ok(ground.maxX - ground.minX > 10);
  const loft = regions.find((r) => r.floorY === 2.3)!;
  assert.ok(loft.maxX - loft.minX <= 4.1);
});

test('walk taps clamp inside the active floor with inset', () => {
  const layout = getLayout('cozy-loft')!;
  const ground = floorRegionsFromBoxes(layout.boxes).find((r) => r.floorY === 0)!;
  const [x, z] = clampInRegion(-5, 99, ground, BOUNDS_INSET);
  assert.equal(x, ground.minX + BOUNDS_INSET);
  assert.equal(z, ground.maxZ - BOUNDS_INSET);
});

test('regionForPoint picks ground vs loft from hit height', () => {
  const layout = getLayout('cozy-loft')!;
  const regions = floorRegionsFromBoxes(layout.boxes);
  assert.equal(regionForPoint(regions, 2, 0, 2)?.floorY, 0);
  assert.equal(regionForPoint(regions, 2, 2.3, 2)?.floorY, 2.3);
});

test('glide eases between poses and wraps yaw the short way', () => {
  const from = { x: 0, y: 1.6, z: 0, yaw: 0.2, pitch: 0 };
  const to = { x: 4, y: 1.6, z: 3, yaw: -0.1, pitch: -0.1 };
  assert.ok(Math.abs(shortestYawDelta(from.yaw, to.yaw)) < 0.4);
  const mid = glidePose(from, to, 0.45, 0.9);
  assert.ok(mid.x > 1 && mid.x < 3);
  const end = glidePose(from, to, 0.9, 0.9);
  assert.equal(end.x, to.x);
  assert.equal(end.z, to.z);
  assert.ok(Math.abs(end.yaw - to.yaw) < 1e-9);
});

test('overview entry starts pulled back toward the iso camera and looks at the destination', () => {
  const cam = [17, 15, 17] as const;
  const target = [3, 1.6, 3] as const;
  const { pos, lookAt } = overviewEntryStart(cam, target, 5, 4, 0);
  assert.ok(Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]) > 8);
  assert.equal(lookAt[1], EYE_HEIGHT);
  assert.equal(lookAt[0], 5);
  assert.equal(lookAt[2], 4);
});

test('horizontal yaw follows three.js cameras (yaw 0 looks down -z, +yaw turns toward -x)', () => {
  assert.ok(Math.abs(horizontalYaw([0, 0, 0], [0, 0, -1]) - 0) < 1e-9);
  assert.ok(Math.abs(horizontalYaw([0, 0, 0], [-1, 0, 0]) - Math.PI / 2) < 1e-9);
});

test('walking forward moves where the camera faces', () => {
  const ground = floorRegionsFromBoxes(getLayout('cozy-loft')!.boxes).find((r) => r.floorY === 0)!;
  const yaw = horizontalYaw([5, 0, 5], [3, 0, 3]);
  const [x, z] = stepWalk(5, 5, yaw, 1, 0, 0.1, ground);
  assert.ok(x < 5 && z < 5);
});

test('pitch clamps and bad numbers sanitize instead of propagating NaN', () => {
  assert.equal(clampPitch(99), Math.PI / 3);
  const p = sanitizePose({ x: NaN, y: 1, z: 2, yaw: 0, pitch: NaN });
  assert.equal(p.x, 0);
  assert.equal(p.pitch, 0);
});

test('keyboard step stays inside the loft footprint', () => {
  const layout = getLayout('cozy-loft')!;
  const loft = floorRegionsFromBoxes(layout.boxes).find((r) => r.floorY === 2.3)!;
  const [x, z] = stepWalk(2, 1.5, 0, 10, 10, 0.5, loft);
  assert.ok(x <= loft.maxX - BOUNDS_INSET);
  assert.ok(z <= loft.maxZ - BOUNDS_INSET);
});

test('exported camera constants match the walk spec', () => {
  assert.equal(WALK_FOV, 65);
});

test('the dolly runs from the walk lens at the overview pullback to a long lens framing the isometric view', () => {
  const cam: [number, number, number] = [17.8, 15.4, 17.6], target: [number, number, number] = [3.8, 1.4, 3.6];
  const ortho = { height: 14, near: 0.1, far: 120 };
  const start = dollyLens(cam, target, ortho, 0);
  const exit = overviewExitEnd(cam, target);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(start.pos[c] - exit.pos[c]) < 1e-9, 'starts where the exit glide ends');
  assert.ok(Math.abs(start.fov - WALK_FOV) < 1e-9);
  const end = dollyLens(cam, target, ortho, 1);
  assert.ok(Math.abs(end.fov - FLAT_FOV) < 1e-9);
  const dist = (l: { pos: number[] }) => Math.hypot(...l.pos.map((p, i) => p - target[i]));
  const height = (l: { pos: number[]; fov: number }) => 2 * dist(l) * Math.tan((l.fov * Math.PI) / 360);
  assert.ok(Math.abs(height(end) - ortho.height) < 1e-6, 'frames what the orthographic camera frames');
  const camDist = Math.hypot(...cam.map((p, i) => p - target[i]));
  assert.ok(Math.abs(end.near - (dist(end) - camDist + ortho.near)) < 1e-6, 'clips where the orthographic camera clips');
  let prev = start;
  for (let i = 1; i <= 20; i++) {
    const l = dollyLens(cam, target, ortho, i / 20);
    assert.ok(dist(l) > dist(prev) && l.fov < prev.fov, 'backs off while the lens narrows');
    prev = l;
  }
  assert.deepEqual(dollyLens(cam, target, ortho, 2), end);
});
