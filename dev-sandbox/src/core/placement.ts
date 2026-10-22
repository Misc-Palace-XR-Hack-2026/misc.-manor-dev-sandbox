import type { RoomLayout } from './layout';
import type { ObjectKind } from './types';

export interface Occupant {
  kind: ObjectKind;
  slotId: string;
}

const LARGE = new Set<ObjectKind>([
  'armchair', 'turntable', 'box', 'tv', 'record', 'boombox', 'fireplace',
  'guitar', 'synthesizer', 'drum', 'car', 'motorcycle',
]);
const SMALL = new Set<ObjectKind>([
  'mug', 'cassette', 'clock', 'cartridge', 'headphones', 'spoon', 'trophy', 'photoFrame', 'igniteLogo',
]);
const BESIDE = new Set<ObjectKind>(['lamp', 'sideTable', 'coffeeMaker']);
const LOW = new Set<ObjectKind>(['notebook', 'book', 'recordSleeve']);

function posOf(layout: RoomLayout, id: string): [number, number, number] | undefined {
  return layout.slots.find((s) => s.id === id)?.pos;
}

function isoFront(from: [number, number, number], to: [number, number, number]): boolean {
  const [fx, , fz] = from;
  const [x, y, z] = to;
  return y < 0.2
    && x + z > fx + fz + 0.8
    && Math.abs(x - fx) > 0.5
    && Math.abs(z - fz) > 0.5;
}

function isoDist(from: [number, number, number], to: [number, number, number]): number {
  return Math.abs(to[0] - from[0]) + Math.abs(to[2] - from[2]);
}

function ofKind(
  occupants: Occupant[],
  layout: RoomLayout,
  kind: ObjectKind,
): [number, number, number][] {
  return occupants
    .filter((o) => o.kind === kind)
    .map((o) => posOf(layout, o.slotId))
    .filter((p): p is [number, number, number] => Boolean(p));
}

const FLOOR_ONLY = new Set<ObjectKind>([...LARGE, 'rug', 'console']);

/** A random free slot (Random drop). Big things and rugs stay on the floor while there is floor left. */
export function randomSlot(
  kind: ObjectKind,
  layout: RoomLayout,
  occupied: Set<string>,
  random: () => number = Math.random,
): string | undefined {
  const free = layout.slots.filter((s) => !occupied.has(s.id));
  const floor = FLOOR_ONLY.has(kind) ? free.filter((s) => s.pos[1] < 0.2) : free;
  const pool = floor.length ? floor : free;
  return pool.length ? pool[Math.floor(random() * pool.length)].id : undefined;
}

/** Pick a free slot for auto-placement. Manual place() still accepts any slot. */
export function chooseSlot(
  kind: ObjectKind,
  layout: RoomLayout,
  occupied: Set<string>,
  occupants: Occupant[],
): string | undefined {
  const free = layout.slots.filter((s) => !occupied.has(s.id));
  if (!free.length) return undefined;
  let best = free[0];
  let bestScore = -Infinity;
  for (const slot of free) {
    const score = scoreSlot(kind, slot.id, slot.pos, occupants, layout);
    if (score > bestScore) {
      bestScore = score;
      best = slot;
    }
  }
  return best.id;
}

function scoreSlot(
  kind: ObjectKind,
  id: string,
  pos: [number, number, number],
  occupants: Occupant[],
  layout: RoomLayout,
): number {
  const [x, y, z] = pos;
  const chairs = ofKind(occupants, layout, 'armchair');
  const hearths = ofKind(occupants, layout, 'fireplace');
  const tvs = ofKind(occupants, layout, 'tv');
  let score = 0;
  const wallDist = Math.min(x, z, 10.3 - x, 7.3 - z);
  score += Math.max(0, 2.5 - wallDist) * 16;
  if (LARGE.has(kind)) {
    score += y < 0.2 ? 80 : -40;
    score += (3 - z) * 12;
    if (kind === 'tv' && z <= 1.2) score += 40;
  }
  if (kind === 'console') {
    score += y < 0.2 ? 50 : -40;
    for (const tv of tvs) {
      if (isoFront(tv, pos)) score += 220 - isoDist(tv, pos);
    }
  }
  if (kind === 'rug') {
    score += y < 0.2 ? 50 : -80;
    const anchors = chairs.length ? chairs : hearths;
    for (const anchor of anchors) {
      if (isoFront(anchor, pos)) score += 220 - isoDist(anchor, pos);
    }
  }
  if (BESIDE.has(kind)) {
    for (const [cx, cy, cz] of chairs) {
      const dx = Math.abs(x - cx), dz = Math.abs(z - cz), dy = Math.abs(y - cy);
      if (dy < 0.6 && dz < 1 && dx > 0.4 && dx < 2) score += 200 - dx;
    }
    if (y < 0.6) score += 20;
  }
  if (SMALL.has(kind)) score += /^(shelf|block)-/.test(id) ? 150 : -10;
  if (LOW.has(kind)) {
    if (y <= 0.5) score += 150;
    if (id.startsWith('shelf-')) score -= 80;
  }
  return score;
}
