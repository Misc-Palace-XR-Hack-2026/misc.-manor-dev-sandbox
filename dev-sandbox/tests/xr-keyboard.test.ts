import test from 'node:test';
import assert from 'node:assert/strict';
import { XrCreation, keyboardRows, URL_PUNCT } from '../src/xr/creation';
import { XrPanel } from '../src/xr/panel';
import { Store, newRoom } from '../src/core/store';

globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      fillRect() {}, clearRect() {}, fillText() {},
      measureText: (t: string) => ({ width: t.length * 14 }),
      save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {},
      set font(_v: string) {}, get font() { return ''; },
      set textAlign(_v: string) {}, get textAlign() { return 'left'; },
      set textBaseline(_v: string) {}, get textBaseline() { return 'top'; },
    }),
  }),
} as unknown as Document;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

test('the VR keyboard is a real grid: rows of keys, not one giant button per line', () => {
  const draft = new XrCreation();
  const rows = keyboardRows(draft);
  assert.ok(Array.isArray(rows) && rows.length > 0, 'keyboardRows must return rows');
  assert.ok(rows.length <= 7, `expected at most 7 rows, got ${rows.length}`);
  for (const row of rows) {
    assert.ok(Array.isArray(row));
    assert.ok(row.length >= 2, 'a row with one key is the defect we are fixing: ' + JSON.stringify(row));
    assert.ok(row.length <= 14, 'rows must stay thumb/ray sized: ' + row.length);
  }

  const flat = rows.flat();
  // Top letter row is QWERTY, not alphabetical.
  assert.equal(rows[0].slice(0, 6).join(''), 'qwerty');
  for (const c of LETTERS) assert.equal(flat.filter((k) => k === c).length, 1, `letter ${c} appears exactly once`);
  for (const c of DIGITS) assert.ok(flat.includes(c), `digit ${c} must be on the keyboard`);
  for (const c of URL_PUNCT) assert.ok(flat.includes(c), `punctuation ${c} must be on the keyboard`);
  for (const c of ['space', 'backspace', 'caps']) assert.ok(flat.includes(c), `${c} must be on the keyboard`);
});

test('caps flips the rendered letter rows so typed capitals survive into the stored value', () => {
  const draft = new XrCreation();
  assert.ok(keyboardRows(draft).flat().includes('q'));
  draft.key('caps');
  assert.ok(keyboardRows(draft).flat().includes('Q'));
  assert.ok(!keyboardRows(draft).flat().includes('q'));

  // Every character of a mixed-case URL is reachable from the rendered rows, and survives storage.
  const url = 'https://example.com/Watch?v=AbC_dE&list=PL%2F1#t=1';
  const typing = new XrCreation();
  typing.title = 'Mixed';
  typing.field = 'text';
  for (const c of url) {
    const upper = /[A-Z]/.test(c);
    if (upper !== typing.caps) typing.key('caps');
    assert.ok(keyboardRows(typing).flat().includes(c), `${c} must be visible on the current layout`);
    typing.key(c);
  }
  assert.equal(typing.text, url);
  const store = new Store(newRoom());
  assert.ok(typing.create(store));
  assert.equal(store.state.contentItems[0].sourceRef, url, 'typed === stored');
});

test('URL shortcuts cut typing without replacing the keyboard', () => {
  const draft = new XrCreation();
  draft.field = 'text';
  draft.key('https');
  assert.equal(draft.text, 'https://');
  draft.key('e');
  draft.key('com');
  assert.equal(draft.text, 'https://e.com');
  draft.key('backspace');
  assert.equal(draft.text, 'https://e.co');
  assert.ok(keyboardRows(draft).flat().includes('https'));
  assert.ok(keyboardRows(draft).flat().includes('com'));
});

test('the create panel paints every key at once with no "More" paging for the keyboard', () => {
  const store = new Store(newRoom());
  const panel = new XrPanel(store, () => {});
  panel.show('create');
  const shown = (panel as unknown as { shown: Array<{ id: string; x: number; y: number; w: number; h: number }> }).shown;

  for (const token of [...LETTERS, ...DIGITS, ...URL_PUNCT, 'space', 'backspace', 'caps']) {
    assert.ok(shown.some((b) => b.id === 'key:' + token), `key:${token} must be on screen without paging`);
  }
  // The form fields and the submit/cancel actions stay reachable at the same time.
  for (const id of ['create:title', 'create:text', 'create:mode', 'create:field-title', 'create:field-text', 'create:submit', 'create:cancel']) {
    assert.ok(shown.some((b) => b.id === id), `${id} must be on screen`);
  }

  const keys = shown.filter((b) => b.id.startsWith('key:'));
  // Keys are laid out in rows: several distinct x positions share a y.
  const byRow = new Map<number, number>();
  for (const k of keys) byRow.set(k.y, (byRow.get(k.y) ?? 0) + 1);
  assert.ok(Math.max(...byRow.values()) >= 7, 'at least one row holds many keys side by side');
  // VR ray targets stay big: no key narrower than 60px on a 1024px canvas.
  for (const k of keys) {
    assert.ok(k.w >= 60, `key ${k.id} too narrow for a controller ray: ${k.w}`);
    assert.ok(k.h >= 44, `key ${k.id} too short for a controller ray: ${k.h}`);
  }
  // Rects must not overlap, or a ray hits the wrong letter.
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
    }
  }
  // Everything stays inside the panel canvas.
  for (const b of shown) {
    assert.ok(b.y - b.h / 2 >= 0 && b.y + b.h / 2 <= 1408, `${b.id} off-canvas vertically`);
    assert.ok(b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= 1024, `${b.id} off-canvas horizontally`);
  }
});

test('activating a key by its own rect types that key, not its neighbour', () => {
  const store = new Store(newRoom());
  const panel = new XrPanel(store, () => {});
  panel.show('create');
  const press = (id: string) => {
    const shown = (panel as unknown as { shown: Array<{ id: string; x: number; y: number }> }).shown;
    const b = shown.find((k) => k.id === id);
    assert.ok(b, 'missing ' + id);
    panel.activate({ x: b.x / 1024, y: 1 - b.y / 1408 });
  };
  press('create:field-title');
  for (const c of 'vr') press('key:' + c);
  assert.equal(panel.draft.title, 'vr');
  press('key:backspace');
  assert.equal(panel.draft.title, 'v');
  press('key:caps');
  press('key:R');
  assert.equal(panel.draft.title, 'vR');
});
