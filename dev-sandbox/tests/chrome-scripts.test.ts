import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const file of ['browser-desktop-chrome.mjs', 'browser-mobile-chrome.mjs']) {
  test(`${file} matches current overlay chrome, not removed neighborhood UI`, () => {
    const text = readFileSync(join(process.cwd(), 'tests', file), 'utf8');
    assert.doesNotMatch(text, /name: 'Close neighborhood'/);
    assert.doesNotMatch(text, /dataset\.inspectX/, 'camera no longer frames selection');
    assert.doesNotMatch(text, /dataset\.inspectY/);
    assert.doesNotMatch(text, /neighborhood\.(click|isVisible|waitFor)/);
    assert.match(text, /Edit room/);
    assert.match(text, /Switch room/);
    assert.match(text, /Visit neighborhood[\s\S]{0,120}\.count\(\),\s*0\)/, 'assert neighborhood control is absent');
  });
}
