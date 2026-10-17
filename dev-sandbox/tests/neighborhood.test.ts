import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { OBJECT_KINDS } from '../src/core/types';
import { SURFACE_LOOKS } from '../src/core/surface-looks';
import { getLayout, DEFAULT_LAYOUT_ID } from '../src/core/layout';

const roomsDir = join(process.cwd(), 'rooms');
const files = readdirSync(roomsDir).filter((f) => f.endsWith('.json'));
const rooms = Object.fromEntries(files.map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(roomsDir, f), 'utf8'))]));

const EXPECTED = [
  'sample',
  'curious-web',
  'garden-notebook',
  'greenhouse-conservatory',
  'creative-atelier',
  'vinyl-lounge',
  'matt',
];

test('neighborhood example rooms are valid JSON configs with themed furnishings', () => {
  assert.deepEqual(Object.keys(rooms).sort(), [...EXPECTED].sort());
  for (const name of EXPECTED) {
    const room = rooms[name];
    assert.equal(validateRoom(room), null, `${name} failed validation: ${validateRoom(room)}`);
    assert.equal(room.layoutId, 'cozy-loft');
    assert.ok(room.contentItems.length >= 3, `${name} needs example content`);
    assert.ok(room.placements.length >= 3, `${name} needs placed objects`);
    for (const rep of room.representations) {
      assert.ok((OBJECT_KINDS as readonly string[]).includes(rep.objectKind), `${name} unknown kind ${rep.objectKind}`);
    }
  }
  assert.equal(rooms['greenhouse-conservatory'].lighting, 'emerald');
  assert.equal(rooms['greenhouse-conservatory'].surfaces.floor.preset, 'moss-slate');
  assert.ok(rooms['greenhouse-conservatory'].representations.some((r: {objectKind: string}) => r.objectKind === 'plant'));
  assert.equal(rooms['vinyl-lounge'].lighting, 'twilight');
  assert.ok(rooms['vinyl-lounge'].representations.some((r: {objectKind: string}) => r.objectKind === 'turntable' || r.objectKind === 'record'));
  assert.equal(rooms['creative-atelier'].lighting, 'sunset');
  assert.equal(rooms['garden-notebook'].lighting, 'dawn');
  assert.equal(rooms['curious-web'].lighting, 'daylight');
});

const COZY = new Set(['armchair','sideTable','rug','lamp','plant','mug','cat','fireplace','cushion','coffeeMaker']);
test('starter rooms form sit-spots, use unused cozy kinds, and match lighting finishes', () => {
  const themed = ['curious-web','garden-notebook','greenhouse-conservatory','creative-atelier','vinyl-lounge','sample','matt'];
  const used = new Set<string>();
  const slotSets: string[][] = [];
  for (const name of themed) {
    const room = rooms[name];
    const look = SURFACE_LOOKS[(room.lighting ?? 'daylight') as keyof typeof SURFACE_LOOKS];
    if (room.lighting) {
      assert.equal(room.surfaces.floor.preset, look.floor.id, `${name} floor should match ${room.lighting}`);
      assert.equal(room.surfaces.wall.preset, look.wall.id, `${name} wall should match ${room.lighting}`);
      assert.equal(room.surfaces.background.preset, look.background.id, `${name} sky should match ${room.lighting}`);
    }
    const kinds = room.representations.map((r: {objectKind:string}) => r.objectKind);
    kinds.forEach((k:string) => used.add(k));
    assert.ok(kinds.some((k:string) => COZY.has(k)), `${name} needs a sit/cozy object`);
    const slots = room.placements.map((p: {slotId:string}) => p.slotId);
    slotSets.push(slots.sort().join(','));
    assert.ok(slots.some((s:string) => s.startsWith('bench') || s.startsWith('shelf') || s.startsWith('floor-old') || s.startsWith('floor-7')), `${name} should use bench/shelf/east floor, not only loft`);
    assert.ok(new Set(slots).size === slots.length);
  }
  assert.ok(new Set(slotSets).size === themed.length, 'rooms should not share the same placement pattern');
  for (const kind of ['lamp','rug','cat','fireplace','coffeeMaker']) {
    assert.ok(used.has(kind), `unused cozy kind ${kind} should appear in a starter room`);
  }
});

test('seed rooms follow sit-spot layout rules and Matt has one TV', () => {
  const layout = getLayout(DEFAULT_LAYOUT_ID)!;
  const pos = (id: string) => layout.slots.find((s: {id:string}) => s.id === id).pos;
  const themed = ['curious-web','garden-notebook','greenhouse-conservatory','creative-atelier','vinyl-lounge','sample','matt'];
  for (const name of themed) {
    const room = rooms[name];
    const byRep = Object.fromEntries(room.representations.map((r: {id:string}) => [r.id, r]));
    const placed = room.placements.map((p: {representationId:string, slotId:string}) => ({
      kind: byRep[p.representationId].objectKind as string,
      slotId: p.slotId,
      pos: pos(p.slotId) as [number, number, number],
    }));
    const chairs = placed.filter((p: {kind:string}) => p.kind === 'armchair');
    for (const p of placed) {
      if (p.kind === 'armchair' || p.kind === 'turntable' || p.kind === 'box' || p.kind === 'fireplace') {
        assert.ok(p.pos[1] < 0.2, `${name} ${p.kind} stays on the floor (${p.slotId})`);
        assert.ok(p.pos[2] <= 2.7, `${name} ${p.kind} goes toward the back (${p.slotId})`);
      }
      if (p.kind === 'notebook') {
        assert.ok(p.pos[1] <= 0.5, `${name} notebook stays low (${p.slotId})`);
        assert.ok(!p.slotId.startsWith('shelf-'), `${name} notebook is not on a wall shelf`);
      }
      if (['mug','cassette','clock','cartridge','headphones'].includes(p.kind)) {
        assert.match(p.slotId, /^(shelf|block)-/, `${name} ${p.kind} prefers a shelf (${p.slotId})`);
      }
    }
    if (chairs.length) {
      const [cx, , cz] = chairs[0].pos;
      for (const p of placed.filter((x: {kind:string}) => x.kind === 'rug')) {
        assert.ok(p.pos[2] > cz + 0.5, `${name} rug in front of chair`);
        assert.ok(Math.abs(p.pos[0] - cx) < 1.0, `${name} rug in the chair aisle`);
      }
      for (const p of placed.filter((x: {kind:string}) => x.kind === 'lamp' || x.kind === 'sideTable')) {
        assert.ok(Math.abs(p.pos[0] - cx) > 0.4 && Math.abs(p.pos[0] - cx) < 2.0, `${name} ${p.kind} beside chair`);
        assert.ok(Math.abs(p.pos[2] - cz) < 1.0, `${name} ${p.kind} in the chair row`);
      }
    }
  }
  const tvs = rooms.matt.representations.filter((r: {objectKind:string}) => r.objectKind === 'tv');
  assert.equal(tvs.length, 1, 'Matt should not stack three TVs');
  assert.equal(tvs[0].contentItemId, 'matt-youtube');
});

test('visiting a neighborhood room does not overwrite the personal save; return home restores it', () => {
  const saved = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); },
  } as unknown as Storage;
  const home = new Store(newRoom('Mine'));
  home.addItem({ title: 'My link', sourceRef: 'https://example.com/mine' });
  const personal = JSON.parse(home.exportJson());
  assert.deepEqual(JSON.parse(saved.get('mp-sandbox:room')!), personal);

  home.visit(rooms['greenhouse-conservatory'], 'greenhouse-conservatory');
  assert.equal(home.state.owner, rooms['greenhouse-conservatory'].owner);
  assert.equal(home.visiting, 'greenhouse-conservatory');
  assert.deepEqual(JSON.parse(saved.get('mp-sandbox:room')!), personal);
  assert.ok(home.state.contentItems.some((c) => /garden|kew|seed|canopy|plant/i.test(c.title + c.sourceRef)));

  home.returnHome();
  assert.equal(home.visiting, null);
  assert.deepEqual(JSON.parse(home.exportJson()), personal);
  assert.equal(home.state.owner, 'Mine');
});
