import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePhoto } from '../src/views/photo-upload';

test('preparePhoto rejects SVG and remote-looking non-raster types before decoding', async () => {
  await assert.rejects(
    () => preparePhoto(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })),
    /PNG or JPEG/,
  );
  await assert.rejects(
    () => preparePhoto(new File(['x'], 'x.webp', { type: 'image/webp' })),
    /PNG or JPEG/,
  );
});
