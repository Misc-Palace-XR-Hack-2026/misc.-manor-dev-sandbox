import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaArt } from '../src/core/media-art';
import { CONTENT_TYPES, type ContentItem } from '../src/core/types';

const item = (over: Partial<ContentItem>): ContentItem => ({
  id: 'c1', type: 'link', title: 'T', sourceKind: 'url', sourceRef: 'https://example.com/a', tags: [], createdAt: '2026-01-01', ...over,
});

test('every content type has its own media icon, regardless of object', () => {
  const glyphs = new Set<string>();
  for (const type of CONTENT_TYPES) {
    const a = mediaArt(item({ type, sourceKind: 'note', sourceRef: 'x' }));
    assert.equal(a.type, type);
    assert.ok(a.glyph.length > 0 && a.label.length > 0, type);
    glyphs.add(a.glyph);
  }
  assert.equal(glyphs.size, CONTENT_TYPES.length, 'icons are distinct per media type');
});

test('links are refined by host or extension and captioned with the host', () => {
  assert.deepEqual(mediaArt(item({ sourceRef: 'https://www.github.com/a/b' })), { glyph: '💻', label: 'Code repository · github.com', type: 'link' });
  assert.equal(mediaArt(item({ sourceRef: 'https://example.com/paper.pdf' })).glyph, '📕');
  assert.equal(mediaArt(item({ sourceRef: 'https://example.com/a' })).label, 'Link · example.com');
});

test('the chosen content type keeps its name even when the host suggests another', () => {
  const a = mediaArt(item({ type: 'article', sourceRef: 'https://github.com/a/b' }));
  assert.equal(a.label, 'Article · github.com');
});

test('files use their extension; unsafe URLs fall back to the type icon', () => {
  assert.deepEqual(mediaArt(item({ type: 'file', sourceKind: 'file', sourceRef: 'docs/a.pdf' })), { glyph: '📕', label: 'PDF', type: 'file' });
  assert.equal(mediaArt(item({ type: 'file', sourceKind: 'file', sourceRef: 'thing.unknown' })).glyph, '📁');
  assert.equal(mediaArt(item({ sourceRef: 'javascript:alert(1)' })).label, 'Link');
});
