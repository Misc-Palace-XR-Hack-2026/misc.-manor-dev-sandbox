import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, roomKeys } from '../src/core/store';

const saved = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
} as unknown as Storage;

test('a batch of stashes is one undo and one save', () => {
  saved.clear();
  const roomId = 'batch-clean';
  const store = new Store(newRoom(), roomId);
  const a = store.addItem({ title: 'A', sourceRef: 'https://a.example', kind: 'mug' });
  const b = store.addItem({ title: 'B', sourceRef: 'https://b.example', kind: 'cat' });
  const key = roomKeys(roomId).main;
  const writes: string[] = [];
  const inner = globalThis.localStorage.setItem.bind(globalThis.localStorage);
  globalThis.localStorage.setItem = (k: string, v: string) => {
    if (k === key) writes.push(v);
    inner(k, v);
  };

  store.beginBatch();
  store.stash(a);
  store.stash(b);
  assert.equal(store.state.representations.length, 0);
  assert.equal(writes.length, 0, 'no localStorage write until the hold ends');
  store.endBatch();
  assert.equal(writes.length, 1, 'one save when the hold ends');

  store.undo();
  assert.equal(store.state.representations.length, 2, 'one undo puts both objects back');
});
