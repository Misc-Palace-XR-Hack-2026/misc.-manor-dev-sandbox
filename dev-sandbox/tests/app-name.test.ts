import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (path.endsWith('.ts')) acc.push(path);
  }
  return acc;
}

test('the app is named Misc. Manor everywhere a person can read it', () => {
  // Provenance comments may cite the old DataMemoryPalace / xrMindPalace repos; display strings may not.
  const offenders: string[] = [];
  for (const path of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(path, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/Misc\.? ?Palace/i.test(line)) offenders.push(`${path.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `old product name still visible:\n${offenders.join('\n')}`);

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(!/Misc\.? ?Palace/i.test(html), 'index.html still says Misc. Palace');
  assert.match(html, /<title>Misc\. Manor<\/title>/);
});

test('the desktop header and the VR panel show the same name', () => {
  const menu = readFileSync(join(root, 'src/views/menu.ts'), 'utf8');
  const panel = readFileSync(join(root, 'src/xr/panel.ts'), 'utf8');
  assert.ok(menu.includes("textContent: 'Misc. Manor'"), 'desktop header name');
  assert.ok(panel.includes("fillText('Misc. Manor'"), 'VR panel name');
});

test('a shared room photo is named for the manor', () => {
  const capture = readFileSync(join(root, 'src/views/room-capture.ts'), 'utf8');
  assert.ok(capture.includes("'misc-manor-room.png'"), 'share filename');
  assert.ok(capture.includes("My Misc. Manor room"), 'share sheet title');
});
