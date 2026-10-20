import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const html = readFileSync(join(root, 'index.html'), 'utf8');
const manifestPath = join(root, 'public/site.webmanifest');

/** Width and height from a PNG IHDR header, so a placeholder cannot pass as an icon. */
function pngSize(path: string): { width: number; height: number; bytes: number } {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${path} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
  };
}

test('browser tab and iOS home screen have a real manor icon, not a blank placeholder', () => {
  assert.ok(!html.includes('href="data:,"'), 'the empty data: favicon is still in index.html');

  const expected: Array<[string, number]> = [
    ['public/icons/favicon-16.png', 16],
    ['public/icons/favicon-32.png', 32],
    ['public/icons/favicon-48.png', 48],
    ['public/icons/apple-touch-icon.png', 180],
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/icon-maskable-512.png', 512],
  ];
  for (const [rel, size] of expected) {
    const path = join(root, rel);
    assert.ok(existsSync(path), `missing ${rel}`);
    const png = pngSize(path);
    assert.equal(png.width, size, `${rel} width`);
    assert.equal(png.height, size, `${rel} height`);
    assert.ok(png.bytes > 500, `${rel} is too small to be real artwork`);
  }

  assert.ok(existsSync(join(root, 'public/icons/favicon.ico')), 'missing favicon.ico');

  // Every icon the document references must actually exist in public/.
  for (const match of html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(match[0])?.[1];
    assert.ok(href && href.startsWith('/'), `icon link needs a root-relative href: ${match[0]}`);
    assert.ok(existsSync(join(root, 'public', href.slice(1))), `index.html references missing ${href}`);
  }

  // iOS uses apple-touch-icon plus the standalone meta tags when saved to the home screen.
  assert.match(html, /rel="apple-touch-icon"[^>]*sizes="180x180"/);
  assert.match(html, /name="apple-mobile-web-app-capable"[^>]*content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title"[^>]*content="Misc\. Manor"/);
  assert.match(html, /name="theme-color"[^>]*content="#171933"/);
});

test('the web manifest installs as Misc. Manor with a maskable icon', () => {
  assert.ok(existsSync(manifestPath), 'missing public/site.webmanifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.name, 'Miscellaneous Manor');
  assert.equal(manifest.short_name, 'Misc. Manor');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.theme_color, '#171933');
  assert.equal(manifest.background_color, '#171933');

  const root512 = manifest.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && !i.purpose);
  const maskable = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
  assert.ok(root512, 'manifest needs a plain 512x512 icon');
  assert.ok(maskable, 'manifest needs a maskable icon so Android does not letterbox it');

  for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
    const path = join(root, 'public', icon.src.slice(1));
    assert.ok(existsSync(path), `manifest references missing ${icon.src}`);
    const png = pngSize(path);
    assert.equal(`${png.width}x${png.height}`, icon.sizes, `${icon.src} does not match its declared size`);
  }
});
