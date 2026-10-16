import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, validateRoom } from '../src/core/store';
globalThis.localStorage = {getItem: () => null, setItem: () => {}} as unknown as Storage;
test('Optional content notes validate, edit, export and undo independently of URLs', () => {
  const store = new Store(newRoom());
  const rep = store.addItem({title: 'Link', sourceRef: 'https://example.com'});
  const id = store.state.representations.find(r => r.id === rep)!.contentItemId;
  const invalid = JSON.parse(store.exportJson()); invalid.contentItems[0].notes = {bad: true};
  assert.match(validateRoom(invalid) ?? '', /notes/i);
  store.updateContent(id, {title: 'Link', sourceRef: 'https://example.com', notes: 'Researched description.'} as any);
  assert.equal((store.content(id) as any).notes, 'Researched description.');
  assert.equal(store.content(id)!.sourceRef, 'https://example.com/');
  assert.equal(validateRoom(JSON.parse(store.exportJson())), null);
  store.undo(); assert.equal((store.content(id) as any).notes, undefined);
});
