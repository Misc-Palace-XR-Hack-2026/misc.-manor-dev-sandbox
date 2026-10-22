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

/**
 * Replaying ?intro should not wipe My room customizations.
 * It only restores the starter intro objects and re-boxes them into free tray slots.
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

  // Remove existing starter placements, then put them back only where tray slots are free.
  room.placements = room.placements.filter((p) => !introRepIds.includes(p.representationId));
  const occupied = new Set(room.placements.map((p) => p.slotId));

  introRepIds.forEach((repId, i) => {
    const traySlot = TRAY_SLOTS[i];
    if (!occupied.has(traySlot)) {
      room.placements.push({ representationId: repId, slotId: traySlot });
      occupied.add(traySlot);
    }
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
