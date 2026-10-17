import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { seedRoom } from '../src/core/rooms';
import { THEMES } from '../src/core/themes';
const path = join(process.cwd(), 'rooms/matt.json');
const load = () => JSON.parse(readFileSync(path, 'utf8'));
test('Matt dedicated seed includes owner destinations, researched notes, and cyber look', () => {
  assert.ok(existsSync(path), 'Matt needs a dedicated repo seed');
  const raw = load();
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'docs/matt-research.json'), 'utf8'));
  assert.equal(manifest.length, raw.contentItems.length);
  assert.equal(new Set(manifest.map((r: any) => r.suppliedUrl)).size, manifest.length);
  assert.equal(validateRoom(raw), null);
  const room = seedRoom('matt', { matt: raw, 'vinyl-lounge': newRoom() });
  assert.equal(room.id, 'matt');
  assert.equal(room.contentItems.length, 16);
  assert.deepEqual(room.contentItems.map(c => c.sourceRef), manifest.map((r: any) => r.suppliedUrl));
  assert.equal(room.lighting, THEMES['look-cyber'].lighting);
  assert.deepEqual(room.surfaces, THEMES['look-cyber'].surfaces);
  assert.equal(room.representations.length, 16);
  assert.equal(room.placements.length, 16);
  assert.equal(new Set(room.placements.map(p => p.slotId)).size, 16);
  for (const c of room.contentItems) { assert.equal(c.type, 'link'); assert.equal(c.sourceKind, 'url'); assert.ok((c as any).notes?.length > 50); }
});
test('Every Matt object can pick up, place, undo and roundtrip without touching other saves', () => {
  assert.ok(existsSync(path), 'Matt needs a dedicated repo seed');
  const saved = new Map([['mp-sandbox:rooms:guest', JSON.stringify(newRoom('Personal guest'))]]);
  const untouched = saved.get('mp-sandbox:rooms:guest');
  globalThis.localStorage = {getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string,v: string) => saved.set(k,v)} as unknown as Storage;
  const store = new Store(seedRoom('matt', {matt: load()}), 'matt');
  for (const rep of [...store.state.representations]) {
    const before = store.exportJson();
    const slot = store.freeSlotIds()[0];
    store.pickUp(rep.id); assert.equal(store.holding, rep.id);
    store.place(rep.id, slot); assert.equal(store.slotOf(rep.id), slot);
    assert.equal(validateRoom(JSON.parse(store.exportJson())), null);
    store.undo(); store.undo(); // Undo place, then pickup (existing two-command history).
    const restored = JSON.parse(store.exportJson());
    const original = JSON.parse(before);
    const byId = (a: any, b: any) => a.representationId.localeCompare(b.representationId);
    restored.placements.sort(byId); original.placements.sort(byId);
    assert.deepEqual(restored, original);
  }
  assert.deepEqual(Store.loadSaved('matt'), store.state);
  assert.equal(saved.get('mp-sandbox:rooms:guest'), untouched);
  const custom = newRoom('Existing Matt save');
  saved.set('mp-sandbox:rooms:matt', JSON.stringify(custom));
  store.switchRoom('matt', seedRoom('matt', {matt: load()}));
  assert.deepEqual(store.state, custom, 'existing Matt saves win over new seed');
});

test('Matt music destinations use official Spotify albums and three exact YouTube playlist URLs', () => {
  const room = load();
  const byId = Object.fromEntries(room.contentItems.map((c: {id:string}) => [c.id, c]));
  assert.equal(byId['matt-cyber-funk'].sourceRef, 'https://open.spotify.com/album/3KU38XVnDkckuekCODiTLV');
  assert.equal(byId['matt-neon-arcade'].sourceRef, 'https://open.spotify.com/album/4FWcWAIGnKJfHNl4CUPYiC');
  assert.equal(byId['matt-tree-bar'].sourceRef, 'https://open.spotify.com/album/5AQx26eGwpzwacSP3hwclU');
  assert.equal(byId['matt-youtube'].sourceRef, 'https://www.youtube.com/watch?v=XRu8zJWARoQ&list=PLEx-1H24sof6xUZGC_gfBDxU1JRbokv8T');
  assert.equal(byId['matt-youtube-2'].sourceRef, 'https://www.youtube.com/watch?v=nW5NKWreRR0&list=PLEx-1H24sof5Eu36zAFmasugh8DmJjzg2');
  assert.equal(byId['matt-youtube-3'].sourceRef, 'https://youtube.com/playlist?list=PL34ED3BB8F4E0FAAA&si=e55QoOxOmn6ACuQY');
  for (const id of ['matt-cyber-funk','matt-neon-arcade','matt-tree-bar','matt-youtube']) {
    assert.ok(!String(byId[id].sourceRef).includes('distrokid.com'));
    assert.ok(!String(byId[id].sourceRef).includes('@thescoobmeisterm'));
  }
  const ids = room.contentItems.map((c: {id:string}) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(room.contentItems.length >= 16);
  const placed = new Set(room.placements.map((p: {slotId:string}) => p.slotId));
  assert.equal(placed.size, room.placements.length);
  assert.equal(room.representations.length, room.contentItems.length);
  assert.equal(room.placements.length, room.contentItems.length);
  assert.equal(room.representations.find((r: {contentItemId:string}) => r.contentItemId === 'matt-youtube').objectKind, 'tv');
});
