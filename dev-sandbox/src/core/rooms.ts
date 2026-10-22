import { Store, newRoom, normalizeRoom, roomKeys } from './store';
import { seedRevision } from './seed-revision';
import type { RoomState } from './types';

// The sandbox's fixed set of rooms. A room belongs to one person; 'My room' is where new users land.
// Look and feel (theme, lighting) and layout are per-room selections, never tied to who owns the room.

export interface RoomSlot {
  id: string;
  /** Used until the owner renames the room. */
  defaultName: string;
  /** Starter content: rooms/<id>.json if committed, else this repo room. Guest has none (starts empty). */
  seed?: string;
}

export const GUEST_ROOM_ID = 'guest';

export const ROOM_DIRECTORY: readonly RoomSlot[] = [
  { id: GUEST_ROOM_ID, defaultName: 'My room' },
  { id: 'german', defaultName: "German's room", seed: 'sample' }, // placeholder template until German's own room is ready
  { id: 'matt', defaultName: "Matt's room", seed: 'vinyl-lounge' },
  { id: 'levi', defaultName: "Levi's room", seed: 'creative-atelier' },
  { id: 'jawan', defaultName: "Jawan's room", seed: 'garden-notebook' },
  { id: 'omari', defaultName: "Omari's room", seed: 'omari' },
];

/** Rooms picker order: keep My room first, then every other room in directory order. */
export const ROOMS_PICKER_ORDER: readonly RoomSlot[] = [
  ...ROOM_DIRECTORY.filter((r) => r.id === GUEST_ROOM_ID),
  ...ROOM_DIRECTORY.filter((r) => r.id !== GUEST_ROOM_ID),
];

export const isRoomId = (id: string | null | undefined): id is string =>
  Boolean(id) && ROOM_DIRECTORY.some((r) => r.id === id);

/**
 * The rooms whose content is committed to the repo and owned by the team: they follow rooms/*.json.
 * 'My room' (GUEST_ROOM_ID) is deliberately absent — that is the visitor's own room and is never reseeded.
 */
export const SHOWCASE_ROOM_IDS: readonly string[] = ROOM_DIRECTORY
  .filter((r) => r.id !== GUEST_ROOM_ID && r.seed !== undefined)
  .map((r) => r.id);

export const isShowcaseRoom = (id: string | null | undefined): boolean =>
  Boolean(id) && SHOWCASE_ROOM_IDS.includes(id!);

/** In the public demo, selecting 'My room' should return to demo-visit rather than switching to sandbox guest. */
export const isDemoHomeAlias = (currentRoomId: string | null | undefined, targetRoomId: string): boolean =>
  targetRoomId === GUEST_ROOM_ID && Boolean(currentRoomId?.startsWith('demo-'));

/**
 * Label shown in room pickers. Legacy saved guest names ('Guest room') are normalized to
 * the current product name ('My room') so old local saves don't resurrect old wording.
 */
export const displayRoomName = (roomId: string, defaultName: string, savedName: string | null): string => {
  const name = savedName?.trim();
  if (!name) return defaultName;
  if (roomId === GUEST_ROOM_ID && /^guest room$/i.test(name)) return defaultName;
  return name;
};

/** The committed JSON a room seeds from, or undefined for rooms that start empty. */
function seedSource(id: string, repo: Record<string, unknown>): unknown {
  const slot = ROOM_DIRECTORY.find((r) => r.id === id);
  if (!slot) throw new Error(`Unknown room: ${id}`);
  return slot.seed === undefined ? undefined : (repo[id] ?? repo[slot.seed]);
}

/** Fingerprint of the room's committed seed, or null when the room has no seed (Guest). */
export function seedRevisionFor(id: string, repo: Record<string, unknown>): string | null {
  const source = seedSource(id, repo);
  return source === undefined ? null : seedRevision(source);
}

/** Fresh starting state for a room: empty for Guest, starter content for devs. `repo` maps rooms/*.json name -> data. */
export function seedRoom(id: string, repo: Record<string, unknown>): RoomState {
  const slot = ROOM_DIRECTORY.find((r) => r.id === id);
  if (!slot) throw new Error(`Unknown room: ${id}`);
  const source = seedSource(id, repo);
  const room = source ? normalizeRoom(source) : newRoom(slot.defaultName);
  room.id = slot.id;
  room.owner = slot.defaultName;
  // Stamp which committed revision this content came from, so a later seed update can be spotted.
  if (source !== undefined) room.seedRevision = seedRevision(source);
  else delete room.seedRevision;
  return room;
}

/**
 * The state to open a room with: the local save, except when a showcase room's save was seeded from an
 * older committed revision (or from a build that recorded none). Then the save is copied to that room's
 * backup key and the room is refreshed from rooms/<id>.json, so the team's updates actually show up.
 *
 * 'My room' and any room without a seed are returned exactly as saved. An unreadable save still throws
 * rather than starting over (see Store.loadSaved and MenuView's quarantine path).
 */
export function openRoom(id: string, repo: Record<string, unknown>): RoomState {
  const saved = Store.loadSaved(id); // throws on an unreadable save: never reseed over data we cannot read
  if (!saved) return seedRoom(id, repo); // no save at all: a fresh seed, already stamped
  if (!isShowcaseRoom(id)) return saved;
  const revision = seedRevisionFor(id, repo);
  if (revision === null || saved.seedRevision === revision) return saved; // up to date: left untouched
  const refreshed = seedRoom(id, repo);
  const keys = roomKeys(id);
  try {
    const previous = localStorage.getItem(keys.main);
    // Keep the old room recoverable before the refreshed seed takes its place.
    if (previous !== null) localStorage.setItem(keys.backup, previous);
    localStorage.setItem(keys.main, JSON.stringify(refreshed));
  } catch {
    // Storage may be full or blocked. The refreshed room still opens; it just re-refreshes next load.
  }
  return refreshed;
}
