import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DROP_MAX, DROP_MIN, devRoomObjects, dropKey, pickDrop } from '../src/core/random-drop';
import { GUEST_ROOM_ID, ROOM_DIRECTORY } from '../src/core/rooms';
import { randomSlot } from '../src/core/placement';
import { getLayout } from '../src/core/layout';
import { Store } from '../src/core/store';
import { DEMO_ROOM_ID, seedDemoRoom } from '../src/demo/demo-room';

const dir = join(process.cwd(), 'rooms');
const repo: Record<string, unknown> = Object.fromEntries(
  readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
);

/** A seeded stand-in for Math.random (mulberry32), so failures replay. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

test('the drop pool is every dev room (not My room), each with its placed objects', () => {
  const byRoom = devRoomObjects(repo);
  const devs = ROOM_DIRECTORY.filter((r) => r.id !== GUEST_ROOM_ID).map((r) => r.id);
  assert.deepEqual([...byRoom.keys()].sort(), [...devs].sort());
  for (const items of byRoom.values()) assert.ok(items.length > 0);
});

test('a drop is 4 to 8 objects from the devs, never repeating and never something the room already has', () => {
  const byRoom = devRoomObjects(repo);
  const room = seedDemoRoom();
  const sizes = new Set<number>();
  for (let seed = 1; seed <= 60; seed++) {
    const picked = pickDrop(byRoom, room, rng(seed));
    sizes.add(picked.length);
    assert.ok(picked.length >= DROP_MIN && picked.length <= DROP_MAX, `size ${picked.length}`);
    const keys = picked.map((p) => dropKey(p.content));
    assert.equal(new Set(keys).size, keys.length, 'no repeats');
    const had = new Set(room.contentItems.map(dropKey));
    assert.ok(keys.every((k) => !had.has(k)), 'nothing already in the room');
  }
  assert.ok(sizes.size > 1, 'the amount varies');
});

test('big things land on the floor, while there is floor left', () => {
  const layout = getLayout('cozy-loft')!;
  for (let seed = 1; seed <= 30; seed++) {
    const id = randomSlot('armchair', layout, new Set(), rng(seed))!;
    assert.ok(layout.slots.find((s) => s.id === id)!.pos[1] < 0.2, id);
  }
});

test('dropIn copies the objects onto free slots as one undo step, and stops when the room is full', () => {
  const store = new Store(seedDemoRoom(), DEMO_ROOM_ID);
  const before = store.state.contentItems.length;
  const picked = pickDrop(devRoomObjects(repo), store.state, rng(7));
  const placed = store.dropIn(picked, rng(8));
  assert.equal(placed.length, picked.length);
  assert.equal(new Set(placed.map((id) => store.slotOf(id))).size, placed.length, 'each on its own slot');
  assert.ok(picked.every((p, i) => store.content(store.state.representations.find((r) => r.id === placed[i])!.contentItemId)!.title === p.content.title));
  store.undo();
  assert.equal(store.state.contentItems.length, before);

  const free = store.freeSlotIds().length;
  const many = [...devRoomObjects(repo).values()].flat();
  assert.equal(store.dropIn(many, rng(9)).length, Math.min(free, many.length));
  assert.equal(store.freeSlotIds().length, Math.max(0, free - many.length));
});
