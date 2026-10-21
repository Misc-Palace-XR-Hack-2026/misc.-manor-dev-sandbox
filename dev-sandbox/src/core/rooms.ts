import { newRoom, normalizeRoom } from './store';
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

export const isRoomId = (id: string | null | undefined): id is string =>
  Boolean(id) && ROOM_DIRECTORY.some((r) => r.id === id);

/** Fresh starting state for a room: empty for Guest, starter content for devs. `repo` maps rooms/*.json name -> data. */
export function seedRoom(id: string, repo: Record<string, unknown>): RoomState {
  const slot = ROOM_DIRECTORY.find((r) => r.id === id);
  if (!slot) throw new Error(`Unknown room: ${id}`);
  const source = slot.seed === undefined ? undefined : (repo[id] ?? repo[slot.seed]);
  const room = source ? normalizeRoom(source) : newRoom(slot.defaultName);
  room.id = slot.id;
  room.owner = slot.defaultName;
  return room;
}
