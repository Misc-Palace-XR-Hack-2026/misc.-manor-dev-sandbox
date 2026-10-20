import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { getLayout } from '../src/core/layout';
import { seedRoom, ROOM_DIRECTORY } from '../src/core/rooms';
import { guessType } from '../src/core/content';

// Fake localStorage for testing
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
} as unknown as Storage;

test('Layout integrity: getLayout cozy-loft has expected structure', () => {
  const layout = getLayout('cozy-loft');
  assert.ok(layout);

  // Slot IDs are unique
  const slotIds = layout.slots.map(s => s.id);
  const uniqueIds = new Set(slotIds);
  assert.equal(slotIds.length, uniqueIds.size, 'slot IDs must be unique');

  const slots = new Map(layout.slots.map(s => [s.id, s]));
  assert.ok(slots.has('floor-1'));
  assert.ok(slots.has('step-3'));
  assert.deepEqual(slots.get('step-3')!.pos, [0.7, 1.75, 3.925]);

  // Has more than 30 slots
  assert.ok(layout.slots.length > 30, `layout has ${layout.slots.length} slots, expected > 30`);

  // Every slot pos lies within floor box bounds in x/z
  const floorBox = layout.boxes.find(b => b.id === 'floor')!;
  const [minX, , minZ] = floorBox.min;
  const [sizeX, , sizeZ] = floorBox.size;
  const maxX = minX + sizeX;
  const maxZ = minZ + sizeZ;

  for (const slot of layout.slots) {
    const [x, , z] = slot.pos;
    assert.ok(x >= minX && x <= maxX && z >= minZ && z <= maxZ,
      `slot ${slot.id} at [${x}, ${z}] outside floor bounds [${minX}-${maxX}, ${minZ}-${maxZ}]`);
  }

  // Has focus and viewHeight
  assert.ok(layout.focus);
  assert.ok(typeof layout.viewHeight === 'number');
  assert.ok(layout.viewHeight > 0);
});

test('loft is a 3x2 grid and the old first floor is a 3x4 grid except under the stairs', () => {
  const layout = getLayout('cozy-loft')!;
  const slots = new Map(layout.slots.map((s) => [s.id, s]));
  const xs = (ids: string[]) => ids.map((id) => slots.get(id)!.pos[0]);
  const zs = (ids: string[]) => ids.map((id) => slots.get(id)!.pos[2]);
  const unique = (vals: number[]) => [...new Set(vals.map((v) => v.toFixed(3)))];
  const spaced = (vals: number[]) => {
    const sorted = [...new Set(vals.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((v, i) => v - sorted[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) assert.ok(Math.abs(g - mean) < 0.05, `uneven gap ${g} vs ${mean}`);
    return sorted;
  };

  const loftFront = ['loft-1', 'loft-2', 'loft-3'];
  for (const id of loftFront) assert.ok(slots.has(id), `missing ${id}`);
  assert.deepEqual(unique(xs(loftFront)).length, 3);
  spaced(xs(loftFront));
  for (const id of loftFront) assert.equal(slots.get(id)!.pos[1], 2.3);
  assert.ok(slots.has('loft-4'), 'back-left loft corner stays');
  assert.equal(slots.get('loft-4')!.pos[1], 2.3);
  assert.ok(slots.get('loft-4')!.pos[2] < slots.get('loft-1')!.pos[2], 'back-left corner sits on the back row');
  assert.equal(slots.has('loft-5'), false, 'loft floor under the peach shelf should be gone');
  assert.equal(slots.has('loft-6'), false, 'loft floor under the peach shelf should be gone');

  const oldFloor = [
    'floor-1', 'floor-2', 'floor-3', 'floor-4', 'floor-5', 'floor-6',
    'floor-old-7', 'floor-old-8', 'floor-old-9', 'floor-old-10', 'floor-old-11', 'floor-old-12',
  ];
  for (const id of oldFloor) assert.ok(slots.has(id), `missing ${id}`);
  assert.deepEqual(unique(xs(oldFloor)).length, 3);
  assert.deepEqual(unique(zs(oldFloor)).length, 4);
  spaced(xs(oldFloor));
  spaced(zs(oldFloor));
  const leftX = Math.min(...xs(oldFloor));
  const backZ = Math.min(...zs(oldFloor));
  assert.ok(leftX > 1.4, 'old-floor left column stays clear of the stair run');
  assert.ok(backZ > 0.6, 'old-floor back row stays off the window rail');
  assert.equal(oldFloor.length, 12, '3x4 has twelve cells once stairs are excluded');
});

test('peach-shelf pads stay; loft-under-shelf and front-strip pads go; two spots sit under the loft on the grid', () => {
  const layout = getLayout('cozy-loft')!;
  const slots = new Map(layout.slots.map((s) => [s.id, s]));
  for (const id of ['floor-16', 'floor-17', 'floor-18', 'loft-5', 'loft-6']) {
    assert.equal(slots.has(id), false, `${id} should be removed`);
  }
  assert.deepEqual(slots.get('block-1')!.pos, [1.8, 2.9, 0.55]);
  assert.deepEqual(slots.get('block-2')!.pos, [2.8, 2.9, 0.55]);
  const a = slots.get('floor-front-loft-1')!.pos;
  const b = slots.get('floor-front-loft-2')!.pos;
  assert.equal(a[1], 0);
  assert.equal(b[1], 0);
  assert.equal(a[0], b[0]);
  assert.equal(a[0], 1.2, 'one floor-grid step (1.4) left of the 3x4 at x=2.6');
  const zs = [a[2], b[2]].sort((l, r) => l - r);
  assert.deepEqual(zs, [1.0, 2.6]);
  assert.ok(a[0] <= 4 && zs[1] < 3, 'both new spots stay under the loft footprint');
});

test('seedRoom creates proper room instances', () => {
  // seedRoom('guest', {}) creates guest room with no content
  const guest = seedRoom('guest', {});
  assert.equal(guest.id, 'guest');
  assert.equal(guest.owner, 'Guest room');
  assert.equal(guest.contentItems.length, 0);
  assert.equal(guest.representations.length, 0);
  assert.equal(guest.placements.length, 0);

  // seedRoom('german', {'sample': <room>}) uses the repo seed
  const curioused = newRoom('Seeded');
  curioused.owner = 'Test';
  curioused.contentItems.push({ id: 'ci1', type: 'link', title: 'Test', sourceRef: 'https://example.com', tags: [], sourceKind: 'url', createdAt: new Date().toISOString() });

  const german = seedRoom('german', { 'sample': curioused });
  assert.equal(german.id, 'german');
  assert.equal(german.owner, "German's room");
  assert.equal(german.contentItems.length, 1);

  // A repo key equal to room id wins over the slot's seed
  const repo = { 'german': newRoom('Direct'), 'sample': newRoom('Fallback') };
  repo.german.contentItems.push({ id: 'ci2', type: 'link', title: 'Direct', sourceRef: 'https://direct.com', tags: [], sourceKind: 'url', createdAt: new Date().toISOString() });
  const germanDirect = seedRoom('german', repo);
  assert.equal(germanDirect.contentItems[0].title, 'Direct');

  // seedRoom('nobody', {}) throws
  assert.throws(() => seedRoom('nobody', {}), /Unknown room/);
});

test('ROOM_DIRECTORY has expected entries', () => {
  const roomIds = ROOM_DIRECTORY.map(r => r.id);
  assert.equal(roomIds.length, 5, 'should have 5 rooms');

  for (const id of ['guest', 'german', 'matt', 'levi', 'jawan']) {
    assert.ok(roomIds.includes(id), `missing room ${id}`);
  }
});

test('Per-room saves: Store saves to per-room keys and can switch rooms', () => {
  const saved = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); },
  } as unknown as Storage;

  // Create a store for matt's room
  const mattRoom = newRoom('Matt');
  const store = new Store(mattRoom, 'matt');
  store.addItem({ title: 'Matt link', sourceRef: 'https://matt.com' });

  // Check it saves under matt-specific key
  const mattKey = 'mp-sandbox:rooms:matt';
  assert.ok(saved.has(mattKey), `should save under ${mattKey}`);
  const mattSave = JSON.parse(saved.get(mattKey)!);
  assert.equal(mattSave.contentItems[0].title, 'Matt link');

  // Should not save under legacy key (using storage mock, which returns null for missing)
  const legacyValue = globalThis.localStorage.getItem('mp-sandbox:room');
  assert.equal(legacyValue, null, 'should not use legacy key');

  // Switch to german room (no prior save, use seed)
  const germanSeed = newRoom('German');
  germanSeed.contentItems.push({ id: 'ci3', type: 'link', title: 'German content', sourceRef: 'https://german.com', tags: [], sourceKind: 'url', createdAt: new Date().toISOString() });

  store.switchRoom('german', germanSeed);
  assert.equal(Store.activeRoomId(), 'german');
  assert.equal(store.state.owner, 'German');
  assert.equal(store.canUndo, false, 'undo history cleared on switch');
  assert.equal(store.selectedId, null, 'selection cleared on switch');

  // German room should save under german key
  store.addItem({ title: 'German new item', sourceRef: 'https://newtogerman.com' });
  const germanKey = 'mp-sandbox:rooms:german';
  assert.ok(saved.has(germanKey));

  // Switch back to matt - should restore saved content
  store.switchRoom('matt', mattRoom);
  assert.equal(store.state.contentItems[0].title, 'Matt link');
  assert.equal(store.state.contentItems.length, 1, 'should only have the original item');

  // switchRoom throws and leaves state untouched when save is corrupt
  saved.set('mp-sandbox:rooms:levi', 'corrupt json{');
  const leviBefore = store.state;
  assert.throws(() => store.switchRoom('levi', newRoom('Levi')), /could not be loaded/i);
  assert.equal(store.state, leviBefore, 'state should be unchanged after corrupt load');
});

test('quarantineSaved sets an unreadable save aside without losing it, so the room can reseed', () => {
  const saved = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); },
    removeItem: (k: string) => { saved.delete(k); },
  } as unknown as Storage;

  const key = 'mp-sandbox:rooms:german';
  saved.set(key, '{"schemaVersion": 999}');
  assert.throws(() => Store.loadSaved('german'), /could not be loaded/i);

  const copies = Store.quarantineSaved('german');
  assert.equal(copies.length, 1);
  assert.equal(saved.get(copies[0]), '{"schemaVersion": 999}', 'original data is kept');
  assert.equal(saved.has(key), false, 'broken save is cleared');
  assert.equal(Store.loadSaved('german'), null, 'room can now start from its seed');
});

test('Pickup safety: pick and place operations work correctly', () => {
  const store = new Store(newRoom());
  const repId = store.addItem({ title: 'My item', sourceRef: 'https://example.com' });

  // Item should be placed in a slot
  const slotBefore = store.slotOf(repId);
  assert.ok(slotBefore, 'item should be placed');

  // Record state before pickup
  const undoCountBefore = store.canUndo ? 1 : 0;
  const exportedBefore = store.exportJson();

  // Pick it up
  store.pickUp(repId);
  assert.equal(store.slotOf(repId), undefined, 'picked up item not in slot');
  assert.equal(store.holding, repId, 'holding should be the picked item');

  // select(null) should put it back in original slot without changing undo history
  store.select(null);
  assert.equal(store.slotOf(repId), slotBefore, 'selecting null restores to original slot');
  const undoCountAfter = store.canUndo ? 1 : 0;
  assert.equal(undoCountAfter, undoCountBefore, 'undo history unchanged from before pickup');
  assert.equal(store.exportJson(), exportedBefore, 'state identical to before pickup');

  // Pick up, place elsewhere
  store.pickUp(repId);
  const freeSlots = store.freeSlotIds();
  assert.ok(freeSlots.length > 0, 'should have free slots');
  const newSlot = freeSlots[0];
  store.place(repId, newSlot);
  assert.equal(store.slotOf(repId), newSlot, 'item placed in new slot');
  assert.equal(store.holding, null, 'holding cleared after place');

  // Pick up, then undo should restore the placement
  store.pickUp(repId);
  assert.equal(store.holding, repId, 'picked up item is holding');
  assert.equal(store.slotOf(repId), undefined, 'unplaced after pickup');
  store.undo();
  assert.equal(store.slotOf(repId), newSlot, 'undo restores original slot');
  assert.equal(store.holding, null, 'holding cleared by undo');
});

test('applyLook: applies surfaces and lighting in one undoable step', () => {
  const store = new Store(newRoom());
  store.addItem({ title: 'Item', sourceRef: 'https://example.com' });
  const contentBefore = store.state.contentItems.length;
  const layoutBefore = store.state.layoutId;

  const look = { surfaces: { floor: { preset: 'stone' } }, lighting: 'dawn' as const };
  store.applyLook(look);

  assert.equal(store.state.surfaces!.floor.preset, 'stone');
  assert.equal(store.state.lighting, 'dawn');
  assert.equal(store.state.contentItems.length, contentBefore, 'content unchanged');
  assert.equal(store.state.layoutId, layoutBefore, 'layout unchanged');

  // One undo should revert both
  store.undo();
  assert.equal(store.state.surfaces, undefined);
  assert.equal(store.state.lighting, undefined);

  // applyLook throws on invalid values
  assert.throws(() => store.applyLook({ lighting: 'invalid' as any }), /Invalid/);
});

test('importFiles: imports with proper deduplication and metadata', () => {
  const store = new Store(newRoom());
  const files = [
    { title: 'a.mp3', ref: 'music/a.mp3' },
    { title: 'b.pdf', ref: 'docs/b.pdf' },
  ];

  const result = store.importFiles(files);
  assert.equal(result.added, 2);
  assert.ok(result.placed > 0);

  // Check types and refs
  const items = store.state.contentItems;
  const aItem = items.find(i => i.title === 'a.mp3')!;
  const bItem = items.find(i => i.title === 'b.pdf')!;

  assert.equal(aItem.type, 'music');
  assert.equal(aItem.sourceKind, 'file');
  assert.equal(aItem.sourceRef, 'music/a.mp3');

  assert.equal(bItem.type, 'doc');
  assert.equal(bItem.sourceKind, 'file');
  assert.equal(bItem.sourceRef, 'docs/b.pdf');

  // Deduplication: second call with same ref should not add
  const result2 = store.importFiles(files);
  assert.equal(result2.added, 0, 'duplicate refs not added');

  // Caps at 200 entries per call
  const manyFiles = Array.from({ length: 210 }, (_, i) => ({ title: `file${i}`, ref: `path/${i}` }));
  const result3 = store.importFiles(manyFiles);
  assert.equal(result3.added, 200, 'capped at 200');

  // Is one undo step
  const beforeUndo = store.canUndo;
  const stateBeforeImport = store.state.contentItems.length;
  store.undo();
  assert.ok(store.state.contentItems.length < stateBeforeImport, 'undo reverts entire import');
});

test('guessType correctly identifies content types', () => {
  assert.equal(guessType('x.mp4'), 'video');
  assert.equal(guessType('x.mp3'), 'music');
  assert.equal(guessType('x.pdf'), 'doc');
  assert.equal(guessType('https://youtube.com/watch?v=abc'), 'video');
  assert.equal(guessType('https://example.com'), 'link');
});
