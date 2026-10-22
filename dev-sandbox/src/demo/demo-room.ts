import { newRoom, roomKeys } from '../core/store';
import { guessType } from '../core/content';
import type { RoomState } from '../core/types';
import { INTRO_OBJECTS } from './intro-objects';

// The visitor's own room in the public demo: the regular cozy loft, seeded once with the three starter objects
// packed in a cardboard box (they have objects but no slot yet). Until they are all on the bench or shelf, the room
// is in its locked tutorial state.

/** The visitor's saved room. The 'demo-' prefix keeps it in the demo's own storage (see roomKeys). */
export const DEMO_ROOM_ID = 'demo-visit';
export const DEMO_OWNER = 'My room';

/** Where the starter objects are meant to end up: the bench and wall shelf. */
export const SHELF_SLOTS = ['shelf-1', 'shelf-2', 'shelf-3', 'bench-1', 'bench-2', 'bench-3'] as const;
/** During the locked tutorial an object may only be put on the bench or shelf. */
export const TUTORIAL_SLOTS: ReadonlySet<string> = new Set(SHELF_SLOTS);
/** Floor slots the starters sat on before the box (older saves). */
export const LEGACY_TRAY_SLOTS = ['floor-7', 'floor-8', 'floor-9'] as const;

export const repIdFor = (introId: string): string => `rep-${introId}`;
const STARTER_REPS = INTRO_OBJECTS.map((o) => repIdFor(o.id));

export function seedDemoRoom(): RoomState {
  const room = newRoom(DEMO_OWNER);
  const createdAt = new Date().toISOString();
  for (const o of INTRO_OBJECTS) {
    room.contentItems.push({
      id: o.id, type: guessType(o.url), title: o.title, sourceKind: 'url', sourceRef: o.url, tags: ['intro'], createdAt, locked: o.locked,
    });
    room.representations.push({ id: repIdFor(o.id), contentItemId: o.id, objectKind: o.kind });
  }
  return room;
}

/**
 * Replaying the intro must not wipe My room customizations: only the starter objects are restored (if stashed or
 * edited) and go back in the cardboard box (no placement). Everything the visitor added stays where it is.
 */
export function prepareIntroReplayRoom(current: RoomState): RoomState {
  const room: RoomState = JSON.parse(JSON.stringify(current));
  const createdAt = new Date().toISOString();
  const introRepIds: string[] = [];

  INTRO_OBJECTS.forEach((o) => {
    const expectedRepId = repIdFor(o.id);
    let item = room.contentItems.find((c) => c.id === o.id);
    if (!item) {
      item = {
        id: o.id,
        type: guessType(o.url),
        title: o.title,
        sourceKind: 'url',
        sourceRef: o.url,
        tags: ['intro'],
        createdAt,
        locked: o.locked,
      };
      room.contentItems.push(item);
    } else {
      item.locked = o.locked;
    }

    const rep = room.representations.find((r) => r.contentItemId === o.id) ?? room.representations.find((r) => r.id === expectedRepId);
    if (!rep) {
      room.representations.push({ id: expectedRepId, contentItemId: o.id, objectKind: o.kind });
      introRepIds.push(expectedRepId);
    } else {
      rep.contentItemId = o.id;
      introRepIds.push(rep.id);
    }
  });

  // Back in the box: a starter in the box has no placement.
  room.placements = room.placements.filter((p) => !introRepIds.includes(p.representationId));

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
