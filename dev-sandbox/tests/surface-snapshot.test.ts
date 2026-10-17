import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObject } from '../src/views/objects';
import type { ContentItem } from '../src/core/types';

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fillRect() {}, fillText() {}, measureText: () => ({ width: 10 }), drawImage() {}, font: '', fillStyle: '', textAlign: '', strokeStyle: '', lineWidth: 0, strokeRect() {} }) }) } as unknown as Document;

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: 'c1', type: 'link', title: 'Visible without click', sourceKind: 'url', sourceRef: 'https://dvgpro.com', tags: [], createdAt: '2026-01-01', ...over,
});

test('TV, picture frame, vinyl, notebook and book show a still preview snapshot without selecting', () => {
  for (const kind of ['tv', 'photoFrame', 'recordSleeve', 'notebook', 'book'] as const) {
    const mesh = buildObject(kind, item());
    assert.ok(mesh.getObjectByName('preview-snapshot'), kind);
  }
  assert.equal(buildObject('clock', item()).getObjectByName('preview-snapshot'), undefined);
});

test('record players have no jacket preview attached', () => {
  for (const kind of ['record', 'turntable'] as const) assert.equal(buildObject(kind, item()).getObjectByName('preview-snapshot'), undefined);
});

test('notebook has only one textured cover plane', () => {
  const g = buildObject('notebook', item());
  assert.ok(g.getObjectByName('preview-snapshot'));
  assert.equal(g.getObjectByName('book-title'), undefined);
});
