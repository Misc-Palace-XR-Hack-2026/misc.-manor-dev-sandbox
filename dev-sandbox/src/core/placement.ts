import type { RoomLayout } from './layout';
import type { ObjectKind } from './types';

export interface Occupant {
  kind: ObjectKind;
  slotId: string;
}

const LARGE = new Set<ObjectKind>([
  'armchair', 'turntable', 'box', 'tv', 'record', 'boombox', 'console', 'fireplace',
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

/** Pick a free slot for auto-placement. Manual place() still accepts any slot. */
export function chooseSlot(
  kind: ObjectKind,
  layout: RoomLayout,
  occupied: Set<string>,
  occupants: Occupant[],
): string | undefined {
  const free = layout.slots.filter((s) => !occupied.has(s.id));
  if (!free.length) return undefined;
  const chairs = occupants
    .filter((o) => o.kind === 'armchair')
    .map((o) => posOf(layout, o.slotId))
    .filter((p): p is [number, number, number] => Boolean(p));
  let best = free[0];
  let bestScore = -Infinity;
  for (const slot of free) {
    const score = scoreSlot(kind, slot.id, slot.pos, chairs);
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
  chairs: [number, number, number][],
): number {
  const [x, y, z] = pos;
  let score = 0;
  if (LARGE.has(kind)) {
    score += y < 0.2 ? 80 : -40;
    score += (3 - z) * 12;
  }
  if (kind === 'rug') {
    score += y < 0.2 ? 50 : -80;
    for (const [cx, , cz] of chairs) {
      if (z > cz + 0.5 && Math.abs(x - cx) < 1) score += 200 - (z - cz);
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
