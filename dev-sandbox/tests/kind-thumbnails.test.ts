import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_KINDS, OBJECT_LABELS } from '../src/core/types';
import { kindThumbnail } from '../src/views/kind-thumbnail';

globalThis.document = {
  createElement: (tag: string) => {
    const attrs: Record<string, string> = {};
    return {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      dataset: {} as Record<string, string>,
      setAttribute(name: string, value: string) { attrs[name] = value; },
      getAttribute(name: string) { return attrs[name] ?? null; },
    };
  },
} as unknown as Document;

test('every object kind has a labeled thumbnail for the edit picker', () => {
  for (const kind of OBJECT_KINDS) {
    const thumb = kindThumbnail(kind);
    assert.equal(thumb.getAttribute('aria-hidden'), 'true');
    assert.ok((thumb.textContent ?? '').length > 0, `${kind} thumbnail is empty`);
    assert.ok(OBJECT_LABELS[kind].length > 0);
    assert.equal(thumb.dataset.kind, kind);
  }
});
