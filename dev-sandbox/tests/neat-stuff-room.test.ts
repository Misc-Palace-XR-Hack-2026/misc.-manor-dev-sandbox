import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRoom } from '../src/core/store';
import { getLayout } from '../src/core/layout';
import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../src/core/types';

const room = JSON.parse(readFileSync(join(process.cwd(), 'rooms', 'neat-stuff.json'), 'utf8'));
const source: { kind: ObjectKind; title: string; url: string }[] =
  JSON.parse(readFileSync(join(process.cwd(), 'scripts', 'neat-stuff-source.json'), 'utf8'));

test('the neat stuff room is a valid room that sets out every object kind exactly once', () => {
  assert.equal(validateRoom(room), null, String(validateRoom(room)));
  const kinds = room.representations.map((r: { objectKind: ObjectKind }) => r.objectKind);
  assert.deepEqual([...kinds].sort(), [...OBJECT_KINDS].sort(), 'one of every model, no repeats');
  assert.equal(room.placements.length, OBJECT_KINDS.length, 'every model is out on display, none packed away');
});

test('every neat stuff object is on its own real slot of its layout', () => {
  const layout = getLayout(room.layoutId)!;
  const slotIds = new Set(layout.slots.map((s) => s.id));
  const used = room.placements.map((p: { slotId: string }) => p.slotId);
  for (const id of used) assert.ok(slotIds.has(id), `unknown slot ${id}`);
  assert.equal(new Set(used).size, used.length, 'no two objects share a slot');
  assert.ok(layout.slots.length >= OBJECT_KINDS.length, 'the layout has room for every model');
});

test('each object links to a Wikipedia article for that thing, and is titled with the model name', () => {
  const byId = new Map(room.contentItems.map((c: { id: string }) => [c.id, c]));
  const chosen = new Map(source.map((s) => [s.kind, s]));
  const refs = new Set<string>();
  for (const rep of room.representations as { contentItemId: string; objectKind: ObjectKind }[]) {
    const item = byId.get(rep.contentItemId) as { title: string; sourceRef: string; type: string };
    assert.ok(item, `representation ${rep.objectKind} has no content item`);
    assert.equal(item.title, OBJECT_LABELS[rep.objectKind], 'titled with the model name');
    assert.equal(item.sourceRef, chosen.get(rep.objectKind)!.url, `wrong article for ${rep.objectKind}`);
    assert.match(item.sourceRef, /^https:\/\/en\.wikipedia\.org\/wiki\/[^?#]+$/, 'a plain Wikipedia article URL');
    assert.equal(item.type, 'article');
    refs.add(item.sourceRef);
  }
  assert.equal(refs.size, OBJECT_KINDS.length, 'no two models share an article');
});

test('curio-hall keeps the cozy loft shell, so stairs, loft and the walk area are unchanged', () => {
  const base = getLayout('cozy-loft')!;
  const hall = getLayout('curio-hall')!;
  for (const box of base.boxes) assert.ok(hall.boxes.some((b) => b.id === box.id), `curio-hall lost ${box.id}`);
  for (const slot of base.slots) assert.ok(hall.slots.some((s) => s.id === slot.id), `curio-hall lost ${slot.id}`);
  assert.ok(hall.boxes.some((b) => b.id === 'loft') && hall.boxes.some((b) => b.id === 'step-1'));
  assert.equal(new Set(hall.slots.map((s) => s.id)).size, hall.slots.length, 'slot ids are unique');
  assert.equal(base.slots.length, 38, 'adding display slots must not change the plain loft');
});
