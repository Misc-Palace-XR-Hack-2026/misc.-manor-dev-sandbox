import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeRoom, validateRoom } from '../src/core/store';
import { seedRoom } from '../src/core/rooms';
import { embedFor } from '../src/core/preview';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'rooms/german.json'), 'utf8'));

test("German's committed room keeps the phone room and adds the new bookmarks", () => {
  assert.equal(validateRoom(raw), null);
  const room = seedRoom('german', { german: raw });
  assert.equal(room.id, 'german');
  assert.equal(room.owner, "German's room");
  const titles = room.contentItems.map((c) => c.title);
  assert.ok(titles.includes('mg wedding website 2027'));
  assert.ok(titles.includes('orbitals (to play)'));
  assert.ok(titles.some((t) => t.startsWith('gungo')));
  assert.ok(titles.includes('Cinejoy'));
  assert.ok(titles.includes('One Piece Chapter 1191 | TCB Scans'));
  assert.ok(titles.includes('infinite jest at DuckDuckGo'));
  const kinds = room.representations.map((r) => r.objectKind);
  assert.ok(kinds.includes('cat'));
  assert.ok(kinds.includes('soccerBall'));
  assert.ok(kinds.includes('flyingSaucer'));
  assert.ok(kinds.includes('lavaLamp'));
  assert.ok(kinds.includes('drum'));
  assert.equal(normalizeRoom(raw).id, 'german');
  assert.equal(raw.seedRevision, undefined);
});

test("German's SoundCloud short links use the visual player", () => {
  const refs = (raw.contentItems as { sourceRef?: string }[])
    .map((c) => c.sourceRef).filter((r): r is string => Boolean(r?.includes('soundcloud')));
  assert.ok(refs.length >= 3);
  for (const ref of refs) {
    const embed = embedFor(new URL(ref));
    assert.equal(embed?.provider, 'soundcloud', ref);
    assert.match(embed?.src ?? '', /visual=true/, ref);
  }
});
