/**
 * Regenerates rooms/neat-stuff.json: one of every object kind, each linking to its Wikipedia article.
 * Placement comes from the app's own auto-placer, so the showroom follows the same rules players get.
 * Run: npx tsx scripts/build-neat-stuff.ts   (or via esbuild bundle, see docs/neat-stuff.md)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { Store } from '../src/core/store';
import { getLayout } from '../src/core/layout';
import { OBJECT_KINDS, type ObjectKind, type RoomState } from '../src/core/types';

const LAYOUT_ID = 'curio-hall';
const CREATED_AT = '2026-10-22T00:00:00.000Z';
const source: { kind: ObjectKind; title: string; url: string }[] = JSON.parse(
  readFileSync(new URL('./neat-stuff-source.json', import.meta.url), 'utf8'),
);

const missing = OBJECT_KINDS.filter((k) => !source.some((s) => s.kind === k));
if (missing.length) throw new Error('No Wikipedia article chosen for: ' + missing.join(', '));

const layout = getLayout(LAYOUT_ID);
if (!layout) throw new Error('Unknown layout ' + LAYOUT_ID);
if (layout.slots.length < OBJECT_KINDS.length) {
  throw new Error(`${LAYOUT_ID} has ${layout.slots.length} slots but there are ${OBJECT_KINDS.length} kinds`);
}

const blank: RoomState = {
  schemaVersion: 1, id: 'room_neat_stuff', owner: 'Neat stuff', layoutId: LAYOUT_ID,
  contentItems: [], representations: [], placements: [],
};
const store = new Store(blank);
for (const { kind, title, url } of source) store.addItem({ title, sourceRef: url, type: 'article', kind, place: true });

const state = JSON.parse(store.exportJson()) as RoomState;
// Stable ids and timestamps so regenerating produces no spurious diff.
const contentId = new Map(state.contentItems.map((c, i) => [c.id, `c${i + 1}`]));
const repId = new Map(state.representations.map((r, i) => [r.id, `r${i + 1}`]));
const room = {
  schemaVersion: 1,
  id: 'room_neat_stuff',
  owner: 'Neat stuff',
  layoutId: LAYOUT_ID,
  lighting: 'daylight',
  surfaces: { floor: { preset: 'gallery-limestone' }, wall: { preset: 'chalk-limewash' }, background: { preset: 'cumulus-sky' } },
  contentItems: state.contentItems.map((c) => ({ ...c, id: contentId.get(c.id)!, createdAt: CREATED_AT })),
  representations: state.representations.map((r) => ({ ...r, id: repId.get(r.id)!, contentItemId: contentId.get(r.contentItemId)! })),
  placements: state.placements.map((p) => ({ ...p, representationId: repId.get(p.representationId)! })),
};

const unplaced = room.representations.length - room.placements.length;
if (unplaced) throw new Error(`${unplaced} object(s) did not get a slot`);
writeFileSync(new URL('../rooms/neat-stuff.json', import.meta.url), JSON.stringify(room, null, 1) + '\n');
console.log('wrote rooms/neat-stuff.json', room.placements.length, 'objects in', layout.slots.length, 'slots');
