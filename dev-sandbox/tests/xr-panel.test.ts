import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';
import { XrPanel } from '../src/xr/panel';

const painted: string[] = [];
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      fillRect() {},
      fillText(text: string) { painted.push(text); },
    }),
  }),
} as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;

test('VR panel title is Cozy Palace', () => {
  painted.length = 0;
  const store = new Store(newRoom());
  new XrPanel(store, () => {});
  assert.ok(painted.includes('Cozy Palace'));
  assert.equal(painted.includes('Misc. Palace'), false);
});
