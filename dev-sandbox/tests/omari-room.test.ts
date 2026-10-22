import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { seedRoom, ROOM_DIRECTORY, isRoomId } from '../src/core/rooms';
import { getLayout, DEFAULT_LAYOUT_ID } from '../src/core/layout';
import { embedFor, youtubeId } from '../src/core/preview';

const path = join(process.cwd(), 'rooms/omari.json');
const load = () => JSON.parse(readFileSync(path, 'utf8'));

const MATRIX_URL = 'https://www.youtube.com/watch?v=XO0pcWxcROI';
const NO_SPOON = 'There is no spoon';

test('Omari is a registered room with a committed repo seed that loads', () => {
  assert.ok(existsSync(path), 'Omari needs a dedicated repo seed at rooms/omari.json');
  const slot = ROOM_DIRECTORY.find((r) => r.id === 'omari');
  assert.ok(slot, 'omari must be in ROOM_DIRECTORY so it shows in the room picker');
  assert.equal(slot!.defaultName, "Omari's room");
  assert.ok(isRoomId('omari'));
  const raw = load();
  assert.equal(validateRoom(raw), null);
  const room = seedRoom('omari', { omari: raw });
  assert.equal(room.id, 'omari');
  assert.equal(room.owner, "Omari's room");
  assert.equal(room.layoutId, DEFAULT_LAYOUT_ID);
});

test('Every slot the cozy-loft layout exposes holds exactly one spoon', () => {
  const room = seedRoom('omari', { omari: load() });
  const layout = getLayout(room.layoutId)!;
  const slotIds = layout.slots.map((s) => s.id);
  assert.equal(room.placements.length, slotIds.length, 'every placeable slot must be filled');
  assert.deepEqual(
    [...room.placements.map((p) => p.slotId)].sort(),
    [...slotIds].sort(),
    'placements must cover the layout slots exactly',
  );
  assert.equal(room.representations.length, slotIds.length);
  assert.equal(room.contentItems.length, slotIds.length);
  for (const rep of room.representations) assert.equal(rep.objectKind, 'spoon', `${rep.id} must be a spoon`);
});

test('Exactly one spoon carries the "There is no spoon" note and the Matrix clip URL', () => {
  const room = seedRoom('omari', { omari: load() });
  const noSpoon = room.contentItems.filter((c) => c.notes === NO_SPOON);
  assert.equal(noSpoon.length, 1, 'exactly one spoon says there is no spoon');
  assert.equal(noSpoon[0].sourceRef, MATRIX_URL);
  assert.equal(noSpoon[0].sourceKind, 'url');
  assert.equal(noSpoon[0].type, 'video');
  const carriers = room.contentItems.filter((c) => c.sourceRef.includes('XO0pcWxcROI'));
  assert.deepEqual(carriers.map((c) => c.id), [noSpoon[0].id], 'only that spoon carries the Matrix URL');
  for (const c of room.contentItems) {
    if (c.id === noSpoon[0].id) continue;
    assert.equal(c.sourceKind, 'note', 'quote spoons are notes, not links');
    assert.ok(!/youtube\.com|youtu\.be/.test(c.sourceRef), `${c.id} must not link to YouTube`);
  }
});

test('The Matrix spoon routes through the official YouTube embed provider', () => {
  const room = seedRoom('omari', { omari: load() });
  const item = room.contentItems.find((c) => c.notes === NO_SPOON)!;
  const url = new URL(item.sourceRef);
  assert.equal(youtubeId(url), 'XO0pcWxcROI');
  const embed = embedFor(url);
  assert.ok(embed, 'the Matrix clip must be embeddable');
  assert.equal(embed!.provider, 'youtube');
  assert.equal(embed!.src, 'https://www.youtube-nocookie.com/embed/XO0pcWxcROI');
});

test('Every other spoon has a distinct non-empty attributed philosophical quote', () => {
  const room = seedRoom('omari', { omari: load() });
  const quotes = room.contentItems.filter((c) => c.notes !== NO_SPOON);
  assert.equal(quotes.length, room.contentItems.length - 1);
  const notes: string[] = [];
  for (const c of quotes) {
    assert.ok(typeof c.notes === 'string' && c.notes.trim().length > 20, `${c.id} needs a substantive quote note`);
    assert.ok(/\u2014/.test(c.notes!), `${c.id} quote must carry an em-dash attribution`);
    notes.push(c.notes!);
  }
  assert.equal(new Set(notes).size, notes.length, 'quote notes must all be distinct');
  const allNotes = room.contentItems.map((c) => c.notes);
  assert.equal(new Set(allNotes).size, allNotes.length, 'all notes across the room are distinct');
  const authors = quotes.map((c) => c.notes!.split('\u2014').pop()!.trim());
  const counts = new Map<string, number>();
  for (const a of authors) counts.set(a, (counts.get(a) ?? 0) + 1);
  for (const [a, n] of counts) assert.ok(n <= 2, `source variety: ${a} is quoted ${n} times`);
  assert.ok(counts.size >= 20, `expected varied sources, got ${counts.size}`);
});

test('The hidden spoon sits mid-pack, not first, last or a showcase slot', () => {
  const room = seedRoom('omari', { omari: load() });
  const idx = room.contentItems.findIndex((c) => c.notes === NO_SPOON);
  assert.ok(idx > 0, 'not the first item');
  assert.ok(idx < room.contentItems.length - 1, 'not the last item');
  const rep = room.representations.find((r) => r.contentItemId === room.contentItems[idx].id)!;
  const slotId = room.placements.find((p) => p.representationId === rep.id)!.slotId;
  assert.equal(slotId, 'floor-10');
  const layout = getLayout(room.layoutId)!;
  const order = layout.slots.findIndex((s) => s.id === slotId);
  assert.ok(order > 2 && order < layout.slots.length - 3, 'hidden spoon sits mid-pack in the slot order');
});

test('Loading Omari leaves other repo seeds and other rooms untouched', () => {
  const before = Object.fromEntries(
    ['matt', 'levi', 'sample', 'vinyl-lounge', 'creative-atelier', 'garden-notebook', 'curious-web', 'greenhouse-conservatory']
      .map((n) => [n, readFileSync(join(process.cwd(), `rooms/${n}.json`), 'utf8')]),
  );
  const saved = new Map<string, string>([['mp-sandbox:rooms:guest', JSON.stringify(newRoom('Personal guest'))]]);
  const guestBefore = saved.get('mp-sandbox:rooms:guest');
  globalThis.localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); },
  } as unknown as Storage;
  const repo = Object.fromEntries(Object.entries(before).map(([n, raw]) => [n, JSON.parse(raw)]));
  repo.omari = load();
  const store = new Store(seedRoom('omari', repo), 'omari');
  assert.equal(validateRoom(JSON.parse(store.exportJson())), null);
  assert.equal(store.freeSlotIds().length, 0, 'a full room has no free slots');
  // The committed matt seed and every other repo seed are byte-identical afterwards.
  for (const [n, raw] of Object.entries(before)) {
    assert.equal(readFileSync(join(process.cwd(), `rooms/${n}.json`), 'utf8'), raw, `rooms/${n}.json changed`);
  }
  const matt = seedRoom('matt', repo);
  assert.equal(matt.id, 'matt');
  assert.ok(matt.contentItems.length >= 16, 'matt seed still intact');
  assert.ok(!matt.representations.every((r) => r.objectKind === 'spoon'));
  assert.equal(saved.get('mp-sandbox:rooms:guest'), guestBefore, 'personal guest save untouched');
});

test('Omari spoons can be picked up and placed back without corrupting the room', () => {
  const saved = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); },
  } as unknown as Storage;
  const store = new Store(seedRoom('omari', { omari: load() }), 'omari');
  const rep = store.state.representations[5];
  const slot = store.slotOf(rep.id)!;
  const before = store.exportJson();
  store.pickUp(rep.id);
  assert.equal(store.slotOf(rep.id), undefined);
  store.place(rep.id, slot);
  assert.equal(store.slotOf(rep.id), slot);
  assert.equal(validateRoom(JSON.parse(store.exportJson())), null);
  store.undo();
  store.undo();
  assert.equal(JSON.parse(store.exportJson()).placements.length, JSON.parse(before).placements.length);
});
