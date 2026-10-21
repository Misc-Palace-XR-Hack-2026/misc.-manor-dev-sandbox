import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPreview } from '../src/core/preview';

const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

/** Playlist names read from YouTube itself (oEmbed title + playlist page <title>). */
const PLAYLIST_NOTES: Record<string, string> = {
  'matt-youtube': 'WilmU Ani321 IntroTo3D',
  'matt-youtube-2': 'Wilmington University - Ani 201 - Reels',
  'matt-youtube-3': 'Patchy the Peg-Legged Penguin Pirate',
};

test('Matt playlist notes carry the real playlist names, not generic blurbs', () => {
  const room = load('rooms/matt.json');
  const manifest = load('docs/matt-research.json');
  for (const [id, name] of Object.entries(PLAYLIST_NOTES)) {
    const item = room.contentItems.find((c: any) => c.id === id);
    assert.ok(item, `${id} must exist`);
    assert.equal(item.notes, name);
    const listId = new URL(item.sourceRef).searchParams.get('list');
    assert.ok(listId, `${id} must stay a playlist URL`);
    const entry = manifest.find((r: any) => r.suppliedUrl === item.sourceRef);
    assert.ok(entry, `${id} must stay in the research manifest`);
    assert.equal(entry.notes, name);
    assert.equal(entry.observedTitle, `${name} - YouTube`);
  }
  assert.equal(new Set(Object.values(PLAYLIST_NOTES)).size, 3);
});

test('Matt lamp keeps identity and lamp kind with exact note and official YouTube embed', () => {
  const room = load('rooms/matt.json');
  const before = load('tests/fixtures/matt-before-item-refresh.json');
  const lamp = room.contentItems.find((c: any) => c.id === 'matt-lamp');
  const original = before.contentItems.find((c: any) => c.id === 'matt-lamp');
  assert.deepEqual(lamp, { ...original, type: 'link', sourceKind: 'url',
    sourceRef: 'https://www.youtube.com/watch?v=Ld35lMnFQ10', notes: 'I love lamp' });
  assert.equal(room.representations.find((r: any) => r.contentItemId === lamp.id).objectKind, 'lamp');
  const preview = buildPreview(lamp);
  assert.equal(preview.kind, 'embed');
  if (preview.kind === 'embed') {
    assert.equal(preview.provider, 'youtube');
    assert.equal(preview.src, 'https://www.youtube-nocookie.com/embed/Ld35lMnFQ10');
  }
});

test('Matt refresh changes only requested kinds and swaps the unique box/turntable slots', () => {
  const before = load('tests/fixtures/matt-before-item-refresh.json');
  const actual = load('rooms/matt.json');
  assert.equal(before.representations.filter((r: any) => r.objectKind === 'fireplace').length, 0);
  for (const kind of ['box', 'turntable', 'headphones']) {
    assert.equal(before.representations.filter((r: any) => r.objectKind === kind).length, 1);
  }
  const expected = structuredClone(before);
  const changes: Record<string, string> = {
    'matt-youtube-3': 'lavaLamp', 'matt-apollo': 'flyingSaucer',
    'matt-solar-book': 'telescope', 'matt-os': 'fireplace',
  };
  for (const r of expected.representations) if (changes[r.contentItemId]) r.objectKind = changes[r.contentItemId];
  // Playlist notes were deliberately replaced with the verified playlist names.
  for (const c of expected.contentItems) if (PLAYLIST_NOTES[c.id]) c.notes = PLAYLIST_NOTES[c.id];
  expected.placements.find((p: any) => p.representationId === 'matt-object-os').slotId = 'floor-front-loft-1';
  expected.placements.find((p: any) => p.representationId === 'matt-object-cyber-funk').slotId = 'floor-front-loft-2';
  // The lamp is tested separately; every other byte of semantic room content must survive.
  actual.contentItems = actual.contentItems.filter((c: any) => c.id !== 'matt-lamp');
  expected.contentItems = expected.contentItems.filter((c: any) => c.id !== 'matt-lamp');
  assert.deepEqual(actual, expected);
});
