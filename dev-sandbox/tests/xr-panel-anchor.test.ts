import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Store, newRoom } from '../src/core/store';
import { XrPanel } from '../src/xr/panel';
import { panelPose, panelFollowsSelection, panelPillarKind, objectMenuAnchor } from '../src/xr/interaction';

globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) }),
} as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;

const PILLAR = { x: 7.4, y: 1.05, z: 1.2 };

test('an anchored panel stands in front of its pillar, on the viewer side, not at the viewer', () => {
  const viewer = { x: 4.0, y: 1.6, z: 4.0 };
  const pose = panelPose(PILLAR, viewer);
  const toViewer = Math.hypot(viewer.x - pose.x, viewer.z - pose.z);
  const toPillar = Math.hypot(PILLAR.x - pose.x, PILLAR.z - pose.z);
  assert.ok(toPillar < toViewer, 'the panel belongs to the pillar, not to the face');
  assert.ok(toPillar > 0.25 && toPillar <= 0.9, `stands clear of the pillar, got ${toPillar}`);
  // On the segment between pillar and viewer, so it never ends up behind the pillar.
  const span = Math.hypot(viewer.x - PILLAR.x, viewer.z - PILLAR.z);
  assert.ok(Math.abs(toPillar + toViewer - span) < 1e-6, 'sits on the line between the two');
});

test('an anchored panel turns its face to the viewer from any side', () => {
  for (const viewer of [{ x: 0, y: 1.6, z: 0 }, { x: 9, y: 1.6, z: 6 }, { x: 7.4, y: 1.6, z: 7 }, { x: 1, y: 1.6, z: 1.2 }]) {
    const pose = panelPose(PILLAR, viewer);
    const facing = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, pose.yaw, 0));
    const toViewer = new THREE.Vector3(viewer.x - pose.x, 0, viewer.z - pose.z).normalize();
    assert.ok(facing.dot(toViewer) > 0.999, `panel must face the viewer, got ${facing.dot(toViewer)}`);
  }
});

test('an anchored panel never lands behind a viewer standing on top of the anchor', () => {
  const pose = panelPose(PILLAR, { x: PILLAR.x + 0.2, y: 1.6, z: PILLAR.z });
  const toPillar = Math.hypot(PILLAR.x - pose.x, PILLAR.z - pose.z);
  assert.ok(toPillar >= 0.2999 && toPillar <= 0.35, `clamped close, got ${toPillar}`);
  const degenerate = panelPose(PILLAR, { ...PILLAR });
  assert.ok(Number.isFinite(degenerate.x) && Number.isFinite(degenerate.yaw), 'no NaN when viewer shares the anchor');
});

test('an anchored panel stays at a reachable height however high or low its anchor is', () => {
  assert.ok(panelPose({ x: 2, y: 0.1, z: 2 }, { x: 4, y: 1.6, z: 4 }).y >= 0.95, 'a floor object does not sink the panel');
  assert.ok(panelPose({ x: 2, y: 2.9, z: 2 }, { x: 4, y: 1.6, z: 4 }).y <= 2.0, 'a loft shelf does not push it overhead');
});

test('placeAt puts the panel face exactly on the pose and turns the whole group', () => {
  const panel = new XrPanel(new Store(newRoom()), () => {});
  for (const pose of [{ x: 7.0, y: 1.3, z: 1.9, yaw: 0.8 }, { x: 1.2, y: 1.1, z: 5.5, yaw: -2.4 }]) {
    panel.placeAt(pose);
    const face = panel.faceAt();
    assert.ok(face.distanceTo(new THREE.Vector3(pose.x, pose.y, pose.z)) < 1e-6, 'face lands on the pose');
    assert.equal(panel.group.rotation.y, pose.yaw);
    const guide = panel.group.children.find((o) => o.name === 'xr-tutorial')!;
    assert.ok(guide.position.x > 0, 'the tutorial card keeps its spot beside the menu');
  }
});

test('pages belong to the pillar that opens them, or to the selected object', () => {
  assert.equal(panelPillarKind('portal'), 'portal');
  assert.equal(panelPillarKind('inbox'), 'portal', 'the Unpack tray lives in the item pillar');
  assert.equal(panelPillarKind('jukebox'), 'jukebox');
  assert.equal(panelPillarKind('music'), 'jukebox');
  assert.equal(panelPillarKind('room-portal'), 'room-portal');
  assert.equal(panelPillarKind('rooms'), 'room-portal');
  assert.equal(panelPillarKind('repo-rooms'), 'room-portal');
  assert.equal(panelPillarKind('home'), null, 'the wrist menu has no pillar');
  assert.equal(panelPillarKind('howto'), null);

  assert.equal(panelFollowsSelection('object', false), true, 'object actions ride with the object');
  assert.equal(panelFollowsSelection('create', true), true, 'editing an item pops up at that item');
  assert.equal(panelFollowsSelection('create', false), false, 'a fresh Add belongs to the item pillar');
  assert.equal(panelFollowsSelection('portal', true), false);
});

test('an object edit panel sits under that object, close enough to read as one stack', () => {
  const object = { x: 4.0, y: 0.9, z: 2.6 };
  const pills = objectMenuAnchor(object);
  const pose = panelPose(pills, { x: 4.0, y: 1.6, z: 5.0 }, { standoff: 0.62, lift: -0.52, minHeight: 0.8 });
  assert.ok(pose.y < pills.y, 'the panel hangs below the action pills, not over them');
  assert.ok(Math.hypot(pose.x - object.x, pose.z - object.z) < 0.7, 'stays with the object');
  assert.ok(pose.y > 0.5, 'does not sink into the floor');
});
