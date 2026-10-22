import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ROOM_ID, SHELF_SLOTS, TRAY_SLOTS, TUTORIAL_SLOTS, prepareIntroReplayRoom, repIdFor, seedDemoRoom, tutorialDone } from '../src/demo/demo-room';
import { INTRO_OBJECTS } from '../src/demo/intro-objects';
import { Store, normalizeRoom, roomKeys } from '../src/core/store';
import { getLayout } from '../src/core/layout';
import { buildPreview } from '../src/core/preview';

test('the seeded demo room is a valid cozy-loft with the three starters in the tray', () => {
  const room = normalizeRoom(seedDemoRoom());
  assert.equal(room.layoutId, 'cozy-loft');
  assert.deepEqual(room.representations.map((r) => r.objectKind), ['rocket', 'drum', 'cassette']);
  assert.deepEqual(room.placements.map((p) => p.slotId), [...TRAY_SLOTS]);
});

test('tutorial slots all exist in the layout', () => {
  const ids = new Set(getLayout('cozy-loft')!.slots.map((s) => s.id));
  for (const id of TUTORIAL_SLOTS) assert.ok(ids.has(id), id);
  assert.equal(TUTORIAL_SLOTS.size, TRAY_SLOTS.length + SHELF_SLOTS.length);
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


test('explicit intro replay preserves My room customizations and only reboxes starters into free tray slots', () => {
  const room = seedDemoRoom();
  // Occupy the middle tray slot with a custom object.
  room.contentItems.push({
    id: 'custom-keep', type: 'note', title: 'Keep this', sourceKind: 'text', sourceRef: 'local note',
    tags: ['custom'], createdAt: new Date().toISOString(),
  } as never);
  room.representations.push({ id: 'rep-custom-keep', contentItemId: 'custom-keep', objectKind: 'book' } as never);
  room.placements.push({ representationId: 'rep-custom-keep', slotId: 'floor-8' } as never);

  // Move one starter away from the tray, as a user would.
  room.placements = room.placements.filter((p) => p.representationId !== repIdFor('intro-rocket'));
  room.placements.push({ representationId: repIdFor('intro-rocket'), slotId: 'shelf-1' } as never);

  const replay = prepareIntroReplayRoom(room);

  // User customization survives.
  assert.ok(replay.contentItems.some((c) => c.id === 'custom-keep'));
  assert.ok(replay.placements.some((p) => p.representationId === 'rep-custom-keep' && p.slotId === 'floor-8'));

  // Starters rebox into free tray slots only.
  const introSlots = new Map(replay.placements
    .filter((p) => p.representationId.startsWith('rep-intro-'))
    .map((p) => [p.representationId, p.slotId]));
  assert.equal(introSlots.get(repIdFor('intro-rocket')), 'floor-7');
  assert.equal(introSlots.get(repIdFor('intro-cassette')), 'floor-9');
  assert.equal(introSlots.get(repIdFor('intro-drum')), undefined, 'occupied tray slot stays with user content');
});
