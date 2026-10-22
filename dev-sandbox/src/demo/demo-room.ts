import { newRoom, roomKeys } from '../core/store';
import { guessType } from '../core/content';
import type { RoomState } from '../core/types';
import { INTRO_OBJECTS } from './intro-objects';

// The visitor's own room in the public demo: the regular cozy loft, seeded once with the three starter objects
// sitting in a tray on the floor. Until they are all on the bench or shelf, the room is in its locked tutorial state.

/** The visitor's saved room. The 'demo-' prefix keeps it in the demo's own storage (see roomKeys). */
export const DEMO_ROOM_ID = 'demo-visit';
export const DEMO_OWNER = 'My room';

/** Where the starter objects begin: three floor slots in a row in front of the bench. */
export const TRAY_SLOTS = ['floor-7', 'floor-8', 'floor-9'] as const;
/** Where they are meant to end up: the bench and wall shelf. */
export const SHELF_SLOTS = ['shelf-1', 'shelf-2', 'shelf-3', 'bench-1', 'bench-2', 'bench-3'] as const;
/** During the locked tutorial an object may only move between the tray and the shelves. */
export const TUTORIAL_SLOTS: ReadonlySet<string> = new Set([...TRAY_SLOTS, ...SHELF_SLOTS]);

export const repIdFor = (introId: string): string => `rep-${introId}`;

export function seedDemoRoom(): RoomState {
  const room = newRoom(DEMO_OWNER);
  const createdAt = new Date().toISOString();
  INTRO_OBJECTS.forEach((o, i) => {
    room.contentItems.push({
      id: o.id, type: guessType(o.url), title: o.title, sourceKind: 'url', sourceRef: o.url, tags: ['intro'], createdAt, locked: o.locked,
    });
    room.representations.push({ id: repIdFor(o.id), contentItemId: o.id, objectKind: o.kind });
    room.placements.push({ representationId: repIdFor(o.id), slotId: TRAY_SLOTS[i] });
  });
  return room;
}

/** Whether this browser holds a saved demo room at all. No save = a first visit, whatever the intro flag says. */
export function hasSavedDemoRoom(): boolean {
  try {
    const keys = roomKeys(DEMO_ROOM_ID);
    return localStorage.getItem(keys.main) !== null || localStorage.getItem(keys.backup) !== null;
  } catch {
    return false; // storage is blocked: nothing was kept, so treat it as a first visit
  }
}

/**
 * Old demo saves used owner 'Visitor'. Keep showing 'My room' without breaking the saved content.
 * Returns true when the room was changed so callers can persist the repaired owner label.
 */
export function normalizeDemoOwner(room: RoomState): boolean {
  if (/^visitor$/i.test((room.owner ?? '').trim())) {
    room.owner = DEMO_OWNER;
    return true;
  }
  return false;
}

/** The tutorial is done once every starter object stands on the bench or shelf. */
export function tutorialDone(state: RoomState): boolean {
  const shelves = new Set<string>(SHELF_SLOTS);
  return INTRO_OBJECTS.every((o) =>
    state.placements.some((p) => p.representationId === repIdFor(o.id) && shelves.has(p.slotId)));
}
