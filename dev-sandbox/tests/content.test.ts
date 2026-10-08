import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessType, safeUrl, normalizeRef } from '../src/core/content';
import { Store, newRoom } from '../src/core/store';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

test('pasted web URLs stay links with a clickable http(s) address', () => {
  assert.equal(guessType('https://threejs.org/docs/'), 'link');
  assert.equal(guessType('https://github.com/mrdoob/three.js'), 'link');
  assert.equal(guessType('github.com/mrdoob/three.js'), 'link');
  assert.equal(guessType('threejs.org/docs/'), 'link');
  assert.equal(safeUrl(normalizeRef('https://github.com/mrdoob/three.js')), 'https://github.com/mrdoob/three.js');
  assert.equal(safeUrl(normalizeRef('threejs.org/docs/')), 'https://threejs.org/docs/');

  const store = new Store(newRoom());
  const github = store.addItem({ title: 'three.js', sourceRef: 'https://github.com/mrdoob/three.js' });
  const content = store.content(store.state.representations.find((r) => r.id === github)!.contentItemId)!;
  assert.equal(content.type, 'link');
  assert.equal(content.sourceKind, 'url');
  assert.equal(content.title, 'three.js');
  assert.equal(safeUrl(content.sourceRef), 'https://github.com/mrdoob/three.js');

  const bare = store.addItem({ title: '', sourceRef: 'threejs.org/docs/' });
  const docs = store.content(store.state.representations.find((r) => r.id === bare)!.contentItemId)!;
  assert.equal(docs.type, 'link');
  assert.equal(docs.sourceKind, 'url');
  assert.equal(safeUrl(docs.sourceRef), 'https://threejs.org/docs/');

  assert.equal(guessType('https://www.youtube.com/watch?v=abc'), 'video');
  assert.equal(guessType('https://example.com/photo.jpg'), 'image');
});
