import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObject } from '../src/views/objects';
import type { ContentItem } from '../src/core/types';

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {}, measureText: () => ({ width: 10 }), drawImage() {}, font: '', fillStyle: '', textAlign: '', strokeStyle: '', lineWidth: 0, strokeRect() {} }) }) } as unknown as Document;

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: 'c1', type: 'link', title: 'Visible without click', sourceKind: 'url', sourceRef: 'https://dvgpro.com', tags: [], createdAt: '2026-01-01', ...over,
});

test('TV, picture frame, vinyl, notebook and book show a still preview snapshot without selecting', () => {
  for (const kind of ['tv', 'photoFrame', 'record', 'notebook', 'book'] as const) {
    const mesh = buildObject(kind, item());
    assert.ok(mesh.getObjectByName('preview-snapshot'), kind);
  }
  assert.equal(buildObject('clock', item()).getObjectByName('preview-snapshot'), undefined);
});
