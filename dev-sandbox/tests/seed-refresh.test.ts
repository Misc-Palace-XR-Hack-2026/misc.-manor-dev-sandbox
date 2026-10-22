import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store, roomKeys, normalizeRoom, validateRoom } from '../src/core/store';
import { seedRevision, canonicalJson } from '../src/core/seed-revision';
import {
  GUEST_ROOM_ID, SHOWCASE_ROOM_IDS, displayRoomName, isDemoHomeAlias, isShowcaseRoom, openRoom, seedRoom, seedRevisionFor,
} from '../src/core/rooms';

// Defect: a localStorage save always beat the committed rooms/*.json, so returning visitors never saw
// updated showcase rooms. These tests pin the seed-revision refresh, including that 'guest' never reseeds
// and that a replaced save is recoverable from the backup key.

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
} as unknown as Storage;

const roomsDir = join(process.cwd(), 'rooms');
const readRoom = (name: string): unknown => JSON.parse(readFileSync(join(roomsDir, `${name}.json`), 'utf8'));
const repo = (): Record<string, unknown> => Object.fromEntries(
  ['matt', 'levi', 'omari', 'sample', 'garden-notebook', 'vinyl-lounge', 'creative-atelier']
    .map((n) => [n, readRoom(n)]),
);

/** An older save of Matt's room: the real committed room minus the recent items, with no revision stamp. */
function legacyMattSave(): Record<string, unknown> {
  const room = normalizeRoom(readRoom('matt')) as unknown as Record<string, unknown>;
  const keptItems = (room.contentItems as { id: string; notes?: string }[])
    .filter((c) => c.notes !== 'I love lamp').slice(0, 3);
  const keptIds = new Set(keptItems.map((c) => c.id));
  const keptReps = (room.representations as { id: string; contentItemId: string }[])
    .filter((r) => keptIds.has(r.contentItemId));
  const repIds = new Set(keptReps.map((r) => r.id));
  room.contentItems = keptItems;
  room.representations = keptReps;
  room.placements = (room.placements as { representationId: string }[])
    .filter((p) => repIds.has(p.representationId));
  delete room.seedRevision;
  return room;
}

beforeEach(() => store.clear());

test('a seed revision is stable, order-independent, and moves when the JSON moves', () => {
  const a = { b: 1, a: [1, { y: 2, x: 3 }] };
  const b = { a: [1, { x: 3, y: 2 }], b: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(seedRevision(a), seedRevision(b));
  assert.equal(seedRevision(a), seedRevision(a), 'same input, same revision');
  assert.notEqual(seedRevision(a), seedRevision({ ...a, b: 2 }));
  assert.match(seedRevision(a), /^r1-[0-9a-f]{8}-/);
});

test('showcase rooms are exactly the five seeded dev rooms; My room is never one of them', () => {
  assert.deepEqual([...SHOWCASE_ROOM_IDS].sort(), ['german', 'jawan', 'levi', 'matt', 'omari']);
  assert.equal(isShowcaseRoom(GUEST_ROOM_ID), false);
  assert.equal(isShowcaseRoom('matt'), true);
  assert.equal(isShowcaseRoom('nope'), false);
});

test('demo treats guest as an alias for demo-visit home, not a room switch target', () => {
  assert.equal(isDemoHomeAlias('demo-visit', 'guest'), true);
  assert.equal(isDemoHomeAlias('demo-visit', 'matt'), false);
  assert.equal(isDemoHomeAlias('guest', 'guest'), false);
  assert.equal(isDemoHomeAlias(undefined, 'guest'), false);
});

test("legacy saved guest label 'Guest room' is shown as 'My room' in room pickers", () => {
  assert.equal(displayRoomName('guest', 'My room', 'Guest room'), 'My room');
  assert.equal(displayRoomName('guest', 'My room', '  guest room  '), 'My room');
  assert.equal(displayRoomName('guest', 'My room', 'My custom room name'), 'My custom room name');
  assert.equal(displayRoomName('matt', "Matt's room", 'Guest room'), 'Guest room');
  assert.equal(displayRoomName('guest', 'My room', null), 'My room');
});

test('a freshly seeded showcase room records the revision it came from', () => {
  const room = seedRoom('matt', repo());
  assert.equal(room.seedRevision, seedRevisionFor('matt', repo()));
  assert.ok(room.seedRevision);
  // Guest has no seed at all, so there is nothing to stamp.
  assert.equal(seedRoom(GUEST_ROOM_ID, repo()).seedRevision, undefined);
  assert.equal(seedRevisionFor(GUEST_ROOM_ID, repo()), null);
});

test("a legacy save with no revision is refreshed, so Matt's room shows 'I love lamp' again", () => {
  const keys = roomKeys('matt');
  const legacy = legacyMattSave();
  localStorage.setItem(keys.main, JSON.stringify(legacy));
  const before = Store.loadSaved('matt')!;
  assert.equal(before.contentItems.some((c) => c.notes === 'I love lamp'), false, 'stale save lacks the lamp note');

  const opened = openRoom('matt', repo());
  assert.equal(opened.contentItems.some((c) => c.notes === 'I love lamp'), true, 'refreshed room carries the lamp note');
  assert.equal(opened.seedRevision, seedRevisionFor('matt', repo()));
  const kinds = new Set(opened.representations.map((r) => r.objectKind));
  for (const kind of ['lavaLamp', 'flyingSaucer', 'telescope', 'fireplace']) {
    assert.ok(kinds.has(kind as never), `refreshed room keeps the ${kind}`);
  }
  // The refresh is persisted, so the next load matches and nothing is rewritten.
  assert.equal(JSON.parse(localStorage.getItem(keys.main)!).seedRevision, opened.seedRevision);
});

test('the replaced save is recoverable from the room backup key', () => {
  const keys = roomKeys('matt');
  const legacy = legacyMattSave();
  localStorage.setItem(keys.main, JSON.stringify(legacy));
  openRoom('matt', repo());
  const backup = localStorage.getItem(keys.backup);
  assert.ok(backup, 'the old save is copied to the backup key before being replaced');
  assert.deepEqual(JSON.parse(backup!), legacy, 'backup is the exact old save');
  assert.equal(JSON.parse(backup!).contentItems.length, legacy.contentItems!.length);
});

test('a save whose revision already matches is left byte-for-byte alone', () => {
  const keys = roomKeys('matt');
  const current = seedRoom('matt', repo());
  current.owner = 'Matt (renamed by the visitor)';
  const raw = JSON.stringify(current);
  localStorage.setItem(keys.main, raw);
  const opened = openRoom('matt', repo());
  assert.equal(opened.owner, 'Matt (renamed by the visitor)', 'a matching save is not reseeded');
  assert.equal(localStorage.getItem(keys.main), raw, 'the save is not rewritten');
  assert.equal(localStorage.getItem(keys.backup), null, 'no needless backup is written');
});

test("the same stale-save scenario never touches 'guest' (My room)", () => {
  const keys = roomKeys(GUEST_ROOM_ID);
  const mine = normalizeRoom(readRoom('matt'));
  mine.owner = 'My room';
  delete mine.seedRevision;
  const raw = JSON.stringify(mine);
  localStorage.setItem(keys.main, raw);
  const opened = openRoom(GUEST_ROOM_ID, repo());
  assert.equal(localStorage.getItem(keys.main), raw, 'My room is never reseeded');
  assert.equal(localStorage.getItem(keys.backup), null);
  assert.equal(opened.owner, 'My room');
});

test('a showcase room with no save just seeds fresh, writing nothing extra', () => {
  const keys = roomKeys('levi');
  const opened = openRoom('levi', repo());
  assert.ok(opened.contentItems.length > 0);
  assert.equal(opened.seedRevision, seedRevisionFor('levi', repo()));
  assert.equal(localStorage.getItem(keys.backup), null, 'nothing to back up when there was no save');
});

test('an unreadable save still refuses to reseed silently', () => {
  localStorage.setItem(roomKeys('matt').main, '{ not json');
  assert.throws(() => openRoom('matt', repo()), /could not be loaded/i);
});

test('the persisted shape stays loadable by a validator that predates the revision field', () => {
  const room = seedRoom('matt', repo());
  assert.equal(room.schemaVersion, 1, 'no schema bump: old builds still load these saves');
  const { seedRevision: _dropped, ...withoutRevision } = room as Record<string, unknown>;
  assert.equal(validateLike(withoutRevision), null, 'a save from an older build (no revision) still validates');
  assert.equal(validateLike(room as unknown as Record<string, unknown>), null);
});

/** validateRoom is the shared gate for both directions of compatibility. */
function validateLike(room: Record<string, unknown>): string | null {
  return validateRoom(room);
}
