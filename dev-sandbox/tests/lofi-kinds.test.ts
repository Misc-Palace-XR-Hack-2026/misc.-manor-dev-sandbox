import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { OBJECT_KINDS, OBJECT_LABELS } from '../src/core/types';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

const LOFI = ['cat', 'teapot', 'lantern', 'headphones', 'cassette', 'cushion'] as const;

test('lofi object kinds are labeled, assignable, placeable, and roundtrip', () => {
  for (const kind of LOFI) {
    assert.ok((OBJECT_KINDS as readonly string[]).includes(kind), `${kind} missing from OBJECT_KINDS`);
    assert.equal(typeof OBJECT_LABELS[kind], 'string');
    assert.ok(OBJECT_LABELS[kind].length > 0);
  }

  const store = new Store(newRoom());
  const slot = store.layout.slots[0].id;
  const repId = store.addItem({ title: 'Noodle', sourceRef: 'note:cat', type: 'note', kind: 'cat' });
  store.place(repId, slot);
  assert.equal(store.state.representations.find((r) => r.id === repId)?.objectKind, 'cat');
  assert.equal(store.slotOf(repId), slot);

  for (const kind of LOFI) store.setKind(repId, kind);
  assert.equal(store.state.representations.find((r) => r.id === repId)?.objectKind, 'cushion');
  store.unplace(repId);
  assert.equal(store.slotOf(repId), undefined);

  const copy = new Store(newRoom());
  copy.replaceState(JSON.parse(store.exportJson()));
  assert.equal(copy.state.representations.find((r) => r.id === repId)?.objectKind, 'cushion');
  assert.equal(validateRoom(store.state), null);
});
