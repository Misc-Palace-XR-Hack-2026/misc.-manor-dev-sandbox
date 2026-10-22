import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_ROOM_ID, LEGACY_TRAY_SLOTS, SHELF_SLOTS, TUTORIAL_SLOTS, inBox, migrateDemoRoom, prepareIntroReplayRoom, repIdFor,
  seedDemoRoom, tutorialDone,
} from '../src/demo/demo-room';
import { INTRO_OBJECTS } from '../src/demo/intro-objects';
import { Store, normalizeRoom, roomKeys } from '../src/core/store';
import { getLayout } from '../src/core/layout';
import { buildPreview } from '../src/core/preview';

test('the seeded demo room is a valid cozy-loft with the three starters packed in the box (no slots yet)', () => {
  const room = normalizeRoom(seedDemoRoom());
  assert.equal(room.layoutId, 'cozy-loft');
  assert.equal(room.surfaces?.floor?.preset, 'stone', 'slate floor so the loft edge reads against the walls');
  assert.deepEqual(room.representations.map((r) => r.objectKind), ['rocket', 'drum', 'cassette']);
  assert.deepEqual(room.placements, []);
  assert.deepEqual(inBox(room), INTRO_OBJECTS.map((o) => repIdFor(o.id)));
});

test('during the tutorial objects can only go on the bench or shelf, and those slots exist', () => {
  const ids = new Set(getLayout('cozy-loft')!.slots.map((s) => s.id));
  for (const id of TUTORIAL_SLOTS) assert.ok(ids.has(id), id);
  assert.deepEqual([...TUTORIAL_SLOTS], [...SHELF_SLOTS]);
});

test('taking objects out of the box and placing them empties it', () => {
  const store = new Store(seedDemoRoom(), DEMO_ROOM_ID);
  store.place(repIdFor('intro-drum'), 'shelf-2');
  assert.deepEqual(inBox(store.state), [repIdFor('intro-rocket'), repIdFor('intro-cassette')]);
  // Putting a held object on a taken spot sends the one there back into the box.
  store.place(repIdFor('intro-rocket'), 'shelf-2');
  assert.deepEqual(inBox(store.state), [repIdFor('intro-drum'), repIdFor('intro-cassette')]);
});

test('an unfinished tutorial saved with starters on the old floor tray goes back into the box', () => {
  const old = seedDemoRoom();
  old.placements = INTRO_OBJECTS.map((o, i) => ({ representationId: repIdFor(o.id), slotId: LEGACY_TRAY_SLOTS[i] }));
  old.placements[0].slotId = 'shelf-1';
  const migrated = migrateDemoRoom(old);
  assert.deepEqual(migrated.placements, [{ representationId: repIdFor('intro-rocket'), slotId: 'shelf-1' }]);
  assert.deepEqual(inBox(migrated), [repIdFor('intro-drum'), repIdFor('intro-cassette')]);
  assert.doesNotThrow(() => normalizeRoom(migrated));
});

test('a finished room is left alone', () => {
  const done = seedDemoRoom();
  done.placements = [
    { representationId: repIdFor('intro-rocket'), slotId: 'shelf-1' },
    { representationId: repIdFor('intro-drum'), slotId: 'shelf-2' },
    { representationId: repIdFor('intro-cassette'), slotId: 'bench-1' },
  ];
  assert.equal(migrateDemoRoom(done), done);
});

test('the tutorial is done only when every starter is on the bench or shelf', () => {
  const room = seedDemoRoom();
  assert.equal(tutorialDone(room), false);
  const store = new Store(room, DEMO_ROOM_ID);
  store.place(repIdFor(INTRO_OBJECTS[0].id), 'shelf-1');
  store.place(repIdFor(INTRO_OBJECTS[1].id), 'shelf-2');
  assert.equal(tutorialDone(store.state), false);
  store.place(repIdFor(INTRO_OBJECTS[2].id), 'bench-3');
  assert.equal(tutorialDone(store.state), true);
});

test('the demo room saves under its own prefix, apart from the dev sandbox', () => {
  assert.match(roomKeys(DEMO_ROOM_ID).main, /^mp-demo:/);
  assert.match(roomKeys('guest').main, /^mp-sandbox:/);
});

test('starter objects are fixed links: Unpacking, the about page, and a YouTube video that previews inline', () => {
  const room = normalizeRoom(seedDemoRoom());
  const byId = (id: string) => room.contentItems.find((c) => c.id === id)!;
  assert.equal(byId('intro-rocket').sourceRef, 'https://www.unpackinggame.com/');
  assert.equal(byId('intro-drum').sourceRef, 'https://misc-manor-demo.vercel.app/about');
  const cassette = byId('intro-cassette');
  assert.equal(cassette.sourceKind, 'url');
  assert.equal(buildPreview(cassette).kind, 'embed');
  assert.ok(room.contentItems.every((c) => c.locked === true));
});

test('a starter object can change kind and be stashed, but its link, text and existence are fixed', () => {
  const store = new Store(seedDemoRoom(), DEMO_ROOM_ID);
  const rep = repIdFor('intro-rocket');
  store.setKind(rep, 'lamp');
  assert.equal(store.state.representations.find((r) => r.id === rep)!.objectKind, 'lamp');
  assert.throws(() => store.updateContent('intro-rocket', { title: 'x', sourceRef: 'https://example.com' }), /fixed/);
  store.renameItem('intro-rocket', 'Renamed');
  assert.equal(store.content('intro-rocket')!.title, 'Unpacking');
  store.deleteContent('intro-rocket');
  assert.ok(store.content('intro-rocket'));
  store.stash(rep);
  assert.ok(store.content('intro-rocket'));
});


test('replaying the intro preserves My room customizations and puts only the starters back in the box', () => {
  const room = seedDemoRoom();
  // A finished tutorial plus something the visitor added.
  room.placements = [
    { representationId: repIdFor('intro-rocket'), slotId: 'shelf-1' },
    { representationId: repIdFor('intro-drum'), slotId: 'shelf-2' },
    { representationId: repIdFor('intro-cassette'), slotId: 'bench-1' },
  ];
  room.contentItems.push({
    id: 'custom-keep', type: 'note', title: 'Keep this', sourceKind: 'text', sourceRef: 'local note',
    tags: ['custom'], createdAt: new Date().toISOString(),
  } as never);
  room.representations.push({ id: 'rep-custom-keep', contentItemId: 'custom-keep', objectKind: 'book' } as never);
  room.placements.push({ representationId: 'rep-custom-keep', slotId: 'floor-8' } as never);
  // A starter whose kind the visitor changed keeps that kind.
  room.representations.find((r) => r.id === repIdFor('intro-drum'))!.objectKind = 'lamp';

  const replay = prepareIntroReplayRoom(room);

  // User customization survives.
  assert.ok(replay.contentItems.some((c) => c.id === 'custom-keep'));
  assert.ok(replay.placements.some((p) => p.representationId === 'rep-custom-keep' && p.slotId === 'floor-8'));
  assert.equal(replay.representations.find((r) => r.id === repIdFor('intro-drum'))!.objectKind, 'lamp');

  // Starters are back in the box: no placement, all three waiting.
  assert.ok(!replay.placements.some((p) => p.representationId.startsWith('rep-intro-')));
  assert.deepEqual(inBox(replay), INTRO_OBJECTS.map((o) => repIdFor(o.id)));
  assert.equal(tutorialDone(replay), false);
  assert.doesNotThrow(() => normalizeRoom(replay));
});

test('replaying restores a starter the visitor stashed', () => {
  const room = seedDemoRoom();
  room.representations = room.representations.filter((r) => r.id !== repIdFor('intro-cassette'));
  const replay = prepareIntroReplayRoom(room);
  assert.deepEqual(inBox(replay), INTRO_OBJECTS.map((o) => repIdFor(o.id)));
});
