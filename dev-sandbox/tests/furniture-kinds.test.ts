import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { OBJECT_KINDS, DEFAULT_OBJECT } from '../src/core/types';
import { LIGHTING_PRESETS } from '../src/core/appearance';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

const FURNITURE = ['armchair', 'sideTable', 'turntable', 'rug'] as const;

test('study furniture kinds are assignable, placeable, and roundtrip like other objects', () => {
  for (const kind of FURNITURE) {
    assert.ok((OBJECT_KINDS as readonly string[]).includes(kind), `${kind} missing from OBJECT_KINDS`);
  }
  assert.equal(DEFAULT_OBJECT.music, 'turntable');

  const store = new Store(newRoom());
  const slot = store.layout.slots[0].id;
  const repId = store.addItem({ title: 'Reading chair', sourceRef: 'note:armchair', type: 'tool', kind: 'armchair' });
  store.place(repId, slot);
  assert.equal(store.state.representations.find((r) => r.id === repId)?.objectKind, 'armchair');
  assert.equal(store.slotOf(repId), slot);

  store.setKind(repId, 'turntable');
  assert.equal(store.state.representations.find((r) => r.id === repId)?.objectKind, 'turntable');
  store.setKind(repId, 'rug');
  store.setKind(repId, 'sideTable');
  store.unplace(repId);
  assert.equal(store.slotOf(repId), undefined);

  const copy = new Store(newRoom());
  copy.replaceState(JSON.parse(store.exportJson()));
  assert.equal(copy.state.representations.find((r) => r.id === repId)?.objectKind, 'sideTable');
  assert.equal(validateRoom(store.state), null);
});

test('rooms have no appearance theme; lighting is optional and furniture is not gated by it', () => {
  const store = new Store(newRoom());
  assert.equal('appearance' in store.state ? store.state.appearance : undefined, undefined);
  assert.equal(typeof (store as { setAppearance?: unknown }).setAppearance, 'undefined');

  const previous = store.exportJson();
  store.setLighting('dawn');
  assert.equal(store.state.lighting, 'dawn');
  assert.ok(Object.hasOwn(LIGHTING_PRESETS, 'dawn'));
  store.undo();
  assert.equal(store.exportJson(), previous);

  const legacy = JSON.parse(previous) as Record<string, unknown>;
  legacy.appearance = { theme: 'study', lighting: 'dawn' };
  const migrated = new Store(newRoom());
  migrated.replaceState(legacy);
  assert.equal(migrated.state.lighting, 'dawn');
  assert.equal(migrated.state.appearance, undefined);

  assert.match(validateRoom({ ...store.state, lighting: 'evil' })!, /lighting/i);
});
