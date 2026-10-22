import { GUEST_ROOM_ID, ROOM_DIRECTORY, seedRoom } from './rooms';
import { type ContentItem, type ObjectKind, type RoomState } from './types';

// Random drop (the demo's save point): a handful of objects from the devs' rooms, picked at random, no repeats.

export const DROP_MIN = 4;
export const DROP_MAX = 8;

export interface DropItem {
  content: ContentItem;
  kind: ObjectKind;
  /** The dev room it came from. */
  room: string;
}

/** Every object set out in each dev's room (their committed starter content). `repo` maps rooms/*.json name -> data. */
export function devRoomObjects(repo: Record<string, unknown>): Map<string, DropItem[]> {
  const byRoom = new Map<string, DropItem[]>();
  for (const { id } of ROOM_DIRECTORY) {
    if (id === GUEST_ROOM_ID) continue;
    const room = seedRoom(id, repo);
    const items = room.placements.flatMap((p) => {
      const rep = room.representations.find((r) => r.id === p.representationId);
      const content = rep && room.contentItems.find((c) => c.id === rep.contentItemId);
      return rep && content ? [{ content, kind: rep.objectKind, room: id }] : [];
    });
    if (items.length) byRoom.set(id, items);
  }
  return byRoom;
}

/** Two objects are "the same" when they point at the same thing (or, with nothing to point at, share a title). */
export const dropKey = (c: ContentItem): string =>
  c.sourceRef ? `ref:${c.sourceRef.trim().toLowerCase()}` : `title:${c.title.trim().toLowerCase()}`;

/**
 * Pick DROP_MIN..DROP_MAX objects: each draw picks a dev at random, then one of their objects. Nothing repeats, and
 * nothing the room already has comes in again. Fewer come back only when the devs' rooms run out.
 */
export function pickDrop(byRoom: ReadonlyMap<string, readonly DropItem[]>, room: RoomState, random: () => number = Math.random): DropItem[] {
  const taken = new Set(room.contentItems.map(dropKey));
  const count = DROP_MIN + Math.floor(random() * (DROP_MAX - DROP_MIN + 1));
  const picked: DropItem[] = [];
  while (picked.length < count) {
    const devs = [...byRoom.values()].map((items) => items.filter((i) => !taken.has(dropKey(i.content)))).filter((items) => items.length);
    if (!devs.length) break;
    const items = devs[Math.floor(random() * devs.length)];
    const item = items[Math.floor(random() * items.length)];
    taken.add(dropKey(item.content));
    // Someone else's object arrives exactly as they set it out: same link, same title, same model.
    picked.push({ ...item });
  }
  return picked;
}
