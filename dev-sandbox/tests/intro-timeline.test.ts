import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOOR_POS, INTRO_DURATION, INTRO_SEEN_KEY, JUKEBOX_POS, PHASE_STARTS, ROOM_EAST, TRAY_POS, TUTORIAL_VIEW,
  introFrame, markIntroSeen, phaseAt, shouldPlayIntro,
} from '../src/core/intro-timeline';
import { getLayout } from '../src/core/layout';

const fake = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};

test('intro starts black, with the camera far east of the room and the doorway already hiding the room', () => {
  const f = introFrame(0);
  assert.equal(f.phase, 'dark');
  assert.equal(f.black, 1);
  assert.equal(f.doorLight, 1);
  assert.ok(f.camera[0] > ROOM_EAST + 5);
});

test('the doorway hides the room while approaching and is gone once the visitor is through', () => {
  assert.ok(introFrame(1.2).doorLight > 0.99);
  assert.equal(introFrame(4).doorLight, 0);
  assert.equal(introFrame(1.5).black, 0);
});

test('the door starts closed in the dark, swings open on bright light, and the room lights up once through', () => {
  const start = introFrame(0), open = introFrame(1.5), through = introFrame(4);
  assert.equal(start.doorOpen, 0);
  assert.ok(start.darkness > 0.8, 'everything but the doorway is dark at first');
  assert.equal(open.doorOpen, 1);
  assert.equal(open.doorLight, 1);
  assert.equal(through.darkness, 0);
  assert.equal(through.doorLight, 0);
});

test('camera walks west through the door and into the room', () => {
  const xs = [0, 1, 2, 3, 4, 5].map((t) => introFrame(t).camera[0]);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] < xs[i - 1], `x should keep decreasing: ${xs}`);
  assert.ok(introFrame(0).camera[0] > DOOR_POS[0]);
  assert.ok(introFrame(3).camera[0] < DOOR_POS[0]);
});

test('the camera looks straight ahead (west) all the way through the door, without flipping', () => {
  for (const t of [0, 0.4, 0.9, 1.4, 1.9]) {
    const f = introFrame(t);
    const d = [f.lookAt[0] - f.camera[0], f.lookAt[1] - f.camera[1], f.lookAt[2] - f.camera[2]];
    assert.ok(Math.abs(d[0] + 4) < 1e-9 && Math.abs(d[1]) < 1e-9 && Math.abs(d[2]) < 1e-9, `t=${t}: ${d}`);
  }
});

test('inside the room the camera looks at the starter objects, then settles on the shelf', () => {
  const f = introFrame(4.0);
  assert.ok(Math.abs(f.lookAt[0] - TRAY_POS[0]) < 0.1 && Math.abs(f.lookAt[2] - TRAY_POS[2]) < 0.1);
  assert.ok(f.camera[0] < ROOM_EAST, 'camera is inside the room by then');
});

test('phases advance in order and the last frame is the locked tutorial view', () => {
  const order = ['dark', 'approach', 'enter', 'setpiece', 'done'];
  const seen = [0, 1, 2.2, 4, INTRO_DURATION].map(phaseAt);
  assert.deepEqual(seen, order);
  assert.equal(INTRO_DURATION, PHASE_STARTS.done);
  const end = introFrame(INTRO_DURATION);
  assert.deepEqual(end.camera, TUTORIAL_VIEW.camera);
  assert.deepEqual(end.lookAt, TUTORIAL_VIEW.lookAt);
  assert.equal(end.fov, TUTORIAL_VIEW.fov);
  assert.equal(end.walking, false);
});

test('frames clamp out-of-range and bad times instead of extrapolating', () => {
  assert.deepEqual(introFrame(-5), introFrame(0));
  assert.deepEqual(introFrame(999), introFrame(INTRO_DURATION));
  assert.deepEqual(introFrame(NaN), introFrame(0));
});

test('the door stands right at the edge of the room, not far from it', () => {
  assert.ok(DOOR_POS[0] > ROOM_EAST && DOOR_POS[0] - ROOM_EAST < 2);
});

test('scene anchors line up with the real room layout', () => {
  const layout = getLayout('cozy-loft')!;
  const floor = layout.boxes.find((b) => b.id === 'floor')!;
  assert.ok(Math.abs(floor.min[0] + floor.size[0] - 0.3 - ROOM_EAST) < 1e-9, 'ROOM_EAST must match layout width');
  const bench = layout.boxes.find((b) => b.id === 'bench')!;
  assert.ok(TRAY_POS[0] >= bench.min[0] && TRAY_POS[0] <= bench.min[0] + bench.size[0], 'box sits in front of the bench');
  assert.ok(JUKEBOX_POS[0] > ROOM_EAST, 'jukebox stands just outside the open east side');
  assert.ok(JUKEBOX_POS[0] < ROOM_EAST + 2, 'jukebox sits right beside the end of the wall');
  assert.equal(JUKEBOX_POS[1], 0, 'jukebox stands at ground level');
  assert.ok(JUKEBOX_POS[2] < 3, 'jukebox is by the back-right wall, not out front');
});

test('first visit plays the intro; after it is seen, it does not, unless ?intro is given', () => {
  const s = fake();
  assert.equal(shouldPlayIntro(s, ''), true);
  markIntroSeen(s);
  assert.equal(s.data[INTRO_SEEN_KEY], '1');
  assert.equal(shouldPlayIntro(s, ''), false);
  assert.equal(shouldPlayIntro(s, '?foo=1'), false);
  assert.equal(shouldPlayIntro(s, '?intro'), true);
});

test('blocked storage never throws', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(shouldPlayIntro(broken, ''), true);
  assert.doesNotThrow(() => markIntroSeen(broken));
  assert.equal(shouldPlayIntro(null, ''), true);
});
