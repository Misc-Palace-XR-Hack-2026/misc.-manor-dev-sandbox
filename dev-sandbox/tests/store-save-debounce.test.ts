import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom, roomKeys } from '../src/core/store';

const saved = new Map<string, string>();
let homeWrites = 0;
const homeKey = roomKeys('debounce-home').main;
globalThis.localStorage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (key === homeKey) homeWrites++;
    saved.set(key, value);
  },
} as unknown as Storage;

function holdTimers() {
  const queued: Array<() => void> = [];
  const origSet = globalThis.setTimeout;
  const origClear = globalThis.clearTimeout;
  let n = 1;
  const slots = new Map<number, number>();
  globalThis.setTimeout = ((fn: TimerHandler) => {
    const id = n++;
    const index = queued.length;
    queued.push(typeof fn === 'function' ? () => { (fn as () => void)(); } : () => {});
    slots.set(id, index);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => {
    const index = id == null ? undefined : slots.get(Number(id));
    if (index != null) queued[index] = () => {};
  }) as typeof clearTimeout;
  return {
    flush() {
      const fns = queued.splice(0);
      for (const fn of fns) fn();
    },
    restore() {
      globalThis.setTimeout = origSet;
      globalThis.clearTimeout = origClear;
    },
  };
}

function installPage() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const listeners = new Map<string, Set<() => void>>();
  const add = (type: string, fn: EventListener) => {
    const set = listeners.get(type) ?? new Set<() => void>();
    set.add(fn as () => void);
    listeners.set(type, set);
  };
  globalThis.window = {
    addEventListener: add,
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;
  let hidden = false;
  globalThis.document = {
    get visibilityState() { return hidden ? 'hidden' : 'visible'; },
    addEventListener: add,
    removeEventListener() {},
  } as unknown as Document;
  return {
    fire(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    hide() { hidden = true; },
    restore() {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

test('a page collapses rapid edits into one save and flushes before the room is left', () => {
  const page = installPage();
  const timers = holdTimers();
  try {
    saved.clear();
    homeWrites = 0;
    const roomId = 'debounce-home';
    const key = homeKey;
    const store = new Store(newRoom('Home'), roomId);
    store.addItem({ title: 'Lamp', sourceRef: 'https://lamp.example', kind: 'lamp' });
    store.addItem({ title: 'Book', sourceRef: 'https://book.example', kind: 'book' });
    assert.equal(saved.get(key) ?? null, null, 'the gesture frame does not stringify the room');

    timers.flush();
    const settled = saved.get(key);
    assert.ok(settled?.includes('Lamp') && settled.includes('Book'));
    assert.equal(homeWrites, 1, 'two edits during the wait become one write');

    saved.delete(key);
    store.addItem({ title: 'Mug', sourceRef: 'https://mug.example', kind: 'mug' });
    assert.equal(saved.get(key) ?? null, null);
    page.fire('pagehide');
    assert.ok(saved.get(key)?.includes('Mug'));
    timers.flush();
    assert.equal((saved.get(key)?.match(/Mug/g) ?? []).length, 1);

    saved.delete(key);
    store.addItem({ title: 'Spoon', sourceRef: 'https://spoon.example', kind: 'spoon' });
    page.hide();
    page.fire('visibilitychange');
    assert.ok(saved.get(key)?.includes('Spoon'));

    saved.delete(key);
    store.addItem({ title: 'Plant', sourceRef: 'https://plant.example', kind: 'plant' });
    store.switchRoom('debounce-other', newRoom('Other'));
    const home = saved.get(key);
    assert.ok(home?.includes('Plant') && home.includes('"owner":"Home"'));
    timers.flush();
    assert.equal(saved.get(key), home, 'the waiting timer must not overwrite the room after a switch');
    assert.equal(saved.get(roomKeys('debounce-other').main) ?? null, null);

    const back = new Store(JSON.parse(home!) as ReturnType<typeof newRoom>, roomId);
    back.addItem({ title: 'Chair', sourceRef: 'https://chair.example', kind: 'armchair' });
    back.visit(newRoom('Neighbor'), 'Neighbor');
    const kept = saved.get(key);
    assert.ok(kept?.includes('Chair') && kept.includes('"owner":"Home"'));
    assert.equal(kept?.includes('"owner":"Neighbor"'), false);
    timers.flush();
    assert.equal(saved.get(key), kept, 'a visit must not be written over the home save');
  } finally {
    timers.restore();
    page.restore();
  }
});
