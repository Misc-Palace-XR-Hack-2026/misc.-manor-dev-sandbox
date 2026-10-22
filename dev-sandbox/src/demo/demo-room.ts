import { newRoom } from '../core/store';
import { guessType } from '../core/content';
import type { RoomState } from '../core/types';
import { INTRO_OBJECTS } from './intro-objects';

// The visitor's own room in the public demo: the regular cozy loft, seeded once with the three starter objects
// packed in a cardboard box (they have objects but no slot yet). Until they are all on the bench or shelf, the room
// is in its locked tutorial state.

/** The visitor's saved room. The 'demo-' prefix keeps it in the demo's own storage (see roomKeys). */
export const DEMO_ROOM_ID = 'demo-visit';

/** Where the starter objects are meant to end up: the bench and wall shelf. */
export const SHELF_SLOTS = ['shelf-1', 'shelf-2', 'shelf-3', 'bench-1', 'bench-2', 'bench-3'] as const;
/** During the locked tutorial an object may only be put on the bench or shelf. */
export const TUTORIAL_SLOTS: ReadonlySet<string> = new Set(SHELF_SLOTS);
/** Floor slots the starters sat on before the box (older saves). */
export const LEGACY_TRAY_SLOTS = ['floor-7', 'floor-8', 'floor-9'] as const;

export const repIdFor = (introId: string): string => `rep-${introId}`;
const STARTER_REPS = INTRO_OBJECTS.map((o) => repIdFor(o.id));

export function seedDemoRoom(): RoomState {
  const room = newRoom('Visitor');
  const createdAt = new Date().toISOString();
  for (const o of INTRO_OBJECTS) {
    room.contentItems.push({
      id: o.id, type: guessType(o.url), title: o.title, sourceKind: 'url', sourceRef: o.url, tags: ['intro'], createdAt, locked: o.locked,
    });
    room.representations.push({ id: repIdFor(o.id), contentItemId: o.id, objectKind: o.kind });
  }
  return room;
}

/** The tutorial is done once every starter object stands on the bench or shelf. */
export function tutorialDone(state: RoomState): boolean {
  const shelves = new Set<string>(SHELF_SLOTS);
  return STARTER_REPS.every((id) => state.placements.some((p) => p.representationId === id && shelves.has(p.slotId)));
}

/** Starter objects still in the box: they exist but have no slot. */
export function inBox(state: RoomState): string[] {
  return STARTER_REPS.filter((id) =>
    state.representations.some((r) => r.id === id) && !state.placements.some((p) => p.representationId === id));
}

/** An unfinished tutorial saved before the box had its starters on floor slots: pack those back in the box. */
export function migrateDemoRoom(state: RoomState): RoomState {
  if (tutorialDone(state)) return state;
  const tray = new Set<string>(LEGACY_TRAY_SLOTS);
  const starters = new Set(STARTER_REPS);
  const placements = state.placements.filter((p) => !(starters.has(p.representationId) && tray.has(p.slotId)));
  return placements.length === state.placements.length ? state : { ...state, placements };
}
