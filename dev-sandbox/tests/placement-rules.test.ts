import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';
import { getLayout, DEFAULT_LAYOUT_ID } from '../src/core/layout';
import { chooseSlot } from '../src/core/placement';
import type { ObjectKind } from '../src/core/types';

globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;

const layout = getLayout(DEFAULT_LAYOUT_ID)!;
const pos = (id: string) => layout.slots.find((s) => s.id === id)!.pos;
const occupied = (...ids: string[]) => new Set(ids);

test('large furniture prefers the back floor, not the first leftover loft/shelf slot', () => {
  for (const kind of ['armchair', 'turntable', 'box'] as ObjectKind[]) {
    const slot = chooseSlot(kind, layout, occupied(), []);
    assert.ok(slot, kind);
    const [, y, z] = pos(slot!);
    assert.ok(y < 0.2, `${kind} stays on the floor, got ${slot}`);
    assert.ok(z <= 2.7, `${kind} goes toward the back wall, got ${slot} z=${z}`);
  }
});

test('a rug prefers the isometric-diagonal floor in front of a chair', () => {
  const chair = 'floor-3';
  const slot = chooseSlot('rug', layout, occupied(chair), [{ kind: 'armchair', slotId: chair }]);
  assert.ok(slot);
  const [cx, , cz] = pos(chair);
  const [x, y, z] = pos(slot!);
  assert.ok(y < 0.2, 'rug stays on the floor');
  assert.ok(x + z > cx + cz + 0.8, `rug is further from the back corner than the chair (${slot})`);
  assert.ok(Math.abs(x - cx) > 0.5 && Math.abs(z - cz) > 0.5, `rug sits on the isometric diagonal, not the same aisle (${slot})`);
});

test('a rug can sit on the isometric diagonal in front of a fireplace', () => {
  const hearth = 'floor-1';
  const slot = chooseSlot('rug', layout, occupied(hearth), [{ kind: 'fireplace', slotId: hearth }]);
  assert.ok(slot);
  const [hx, , hz] = pos(hearth);
  const [x, y, z] = pos(slot!);
  assert.ok(y < 0.2);
  assert.ok(x + z > hx + hz + 0.8, `rug is in front of the fireplace (${slot})`);
  assert.ok(Math.abs(x - hx) > 0.5 && Math.abs(z - hz) > 0.5, `rug is diagonal from the fireplace (${slot})`);
});

test('a lamp or side table prefers a slot beside an existing chair', () => {
  const chair = 'floor-3';
  for (const kind of ['lamp', 'sideTable'] as ObjectKind[]) {
    const slot = chooseSlot(kind, layout, occupied(chair), [{ kind: 'armchair', slotId: chair }]);
    assert.ok(slot, kind);
    const [cx, cy, cz] = pos(chair);
    const [x, y, z] = pos(slot!);
    assert.ok(Math.abs(y - cy) < 0.6, `${kind} stays at sitting height`);
    assert.ok(Math.abs(z - cz) < 1.0, `${kind} stays in the chair's row`);
    assert.ok(Math.abs(x - cx) > 0.4 && Math.abs(x - cx) < 2.0, `${kind} sits beside the chair, not on it`);
  }
});

test('small items prefer shelves when those are free', () => {
  for (const kind of ['mug', 'cassette', 'clock'] as ObjectKind[]) {
    const slot = chooseSlot(kind, layout, occupied(), []);
    assert.ok(slot);
    assert.match(slot!, /^(shelf|block)-/, `${kind} should prefer a shelf, got ${slot}`);
  }
});

test('notebooks prefer the ground or a low shelf, not a wall shelf', () => {
  const slot = chooseSlot('notebook', layout, occupied(), []);
  assert.ok(slot);
  const y = pos(slot!).at(1)!;
  assert.ok(y <= 0.5, `notebook stays low, got ${slot} y=${y}`);
  assert.ok(!slot!.startsWith('shelf-'), 'wall shelves are too high for a notebook');
});

test('a TV prefers the back floor and a console sits on the isometric diagonal in front of it', () => {
  const tvSlot = chooseSlot('tv', layout, occupied(), []);
  assert.ok(tvSlot);
  const [, tvY, tvZ] = pos(tvSlot!);
  assert.ok(tvY < 0.2, `TV stays on the floor (${tvSlot})`);
  assert.ok(tvZ <= 1.2, `TV goes to the back row (${tvSlot} z=${tvZ})`);
  const consoleSlot = chooseSlot('console', layout, occupied(tvSlot!), [{ kind: 'tv', slotId: tvSlot! }]);
  assert.ok(consoleSlot);
  const [tx, , tz] = pos(tvSlot!);
  const [x, y, z] = pos(consoleSlot!);
  assert.ok(y < 0.2, 'console stays on the floor');
  assert.ok(x + z > tx + tz + 0.8, `console is in front of the TV (${consoleSlot})`);
  assert.ok(Math.abs(x - tx) > 0.5 && Math.abs(z - tz) > 0.5, `console is diagonal from the TV (${consoleSlot})`);
});

test('addItem follows the rules: chair on the back floor, rug in front, lamp beside', () => {
  const store = new Store(newRoom());
  const chair = store.addItem({ title: 'Chair', sourceRef: 'note:chair', type: 'note', kind: 'armchair' });
  const rug = store.addItem({ title: 'Rug', sourceRef: 'note:rug', type: 'note', kind: 'rug' });
  const lamp = store.addItem({ title: 'Lamp', sourceRef: 'note:lamp', type: 'note', kind: 'lamp' });
  const chairSlot = store.slotOf(chair)!;
  const [cx, , cz] = pos(chairSlot);
  assert.ok(cz <= 2.7, `chair ${chairSlot}`);
  const rugSlot = store.slotOf(rug)!;
  const [rx, , rz] = pos(rugSlot);
  assert.ok(rx + rz > cx + cz + 0.8, `rug ${rugSlot} in front of ${chairSlot}`);
  assert.ok(Math.abs(rx - cx) > 0.5 && Math.abs(rz - cz) > 0.5, `rug ${rugSlot} is diagonal from ${chairSlot}`);
  const lampSlot = store.slotOf(lamp)!;
  assert.ok(Math.abs(pos(lampSlot)[0] - pos(chairSlot)[0]) > 0.4, `lamp ${lampSlot} beside ${chairSlot}`);
});

test('auto-place prefers a wall slot over the open center', () => {
  const back = ['floor-1', 'floor-2', 'floor-3', 'floor-front-loft-1'];
  const slot = chooseSlot('box', layout, occupied(...back), []);
  assert.ok(slot);
  const [x, y, z] = pos(slot!);
  assert.ok(y < 0.2, `box stays on the floor (${slot})`);
  const wallDist = Math.min(x, z, 10.3 - x, 7.3 - z);
  assert.ok(wallDist < 2.0, `box hugs a wall, got ${slot} dist=${wallDist}`);
});
