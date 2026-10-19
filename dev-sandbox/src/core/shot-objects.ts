// Objects for trailer shots that need a full-looking room. Plain data plus a slot picker; nothing here touches
// three or the DOM, and the store does the actual adding.
import type { Slot } from './layout';
import type { ObjectKind } from './types';

export interface ShotLink {
  title: string;
  url: string;
  kind: ObjectKind;
}

/** Shot 4 (whole-room reveal): the links that fill the room. Kinds are picked to hint at what each link is. */
export const SHOT4_LINKS: readonly ShotLink[] = [
  { title: 'Newgrounds', url: 'https://www.newgrounds.com/', kind: 'console' },
  { title: 'GMTK: How to Make a Trailer', url: 'https://www.youtube.com/watch?v=4CSYA9R70R8', kind: 'vhs' },
  { title: 'Unpacking', url: 'https://www.unpackinggame.com/', kind: 'box' },
  { title: 'One Piece (TCB Scans)', url: 'https://tcbonepiecechapters.com/mangas/5/one-piece', kind: 'book' },
  { title: 'Infinite Jest', url: 'https://duckduckgo.com/?q=infinite+jest&atb=v507-1&ia=web', kind: 'book' },
  { title: 'VFX Breakdowns', url: 'https://beforesandafters.com/category/vfx-breakdowns/page/2/', kind: 'tv' },
  { title: 'Everybody\'s Free (To Wear Sunscreen) - Baz Luhrmann', url: 'https://youtu.be/sTJ7AzBIJoI?si=BUnzpkroFsi-xo87', kind: 'cassette' },
  { title: 'Nujabes - Feather (sample)', url: 'https://youtu.be/RZZRu5q63r4?si=eCNYNKuuHASrOYaL', kind: 'recordSleeve' },
  { title: 'How to dribble and create space like Xavi and Iniesta', url: 'https://youtu.be/8G3f_RM7Eew?si=oD8D5BP57jcoweCM', kind: 'trophy' },
  { title: 'Soundbyte Vault', url: 'https://vaultsoundbyte.vercel.app/library', kind: 'boombox' },
  { title: 'Moonloops "Samples"', url: 'https://gungo06.itch.io/moonloops-samples', kind: 'headphones' },
];

/**
 * The magic scene: new objects that start as a heap (standing in for the full box, which is never drawn) and fly
 * out to organize themselves. Placeholder addresses, only used so each toy is its own item in the room.
 */
export const MAGIC_TOYS: readonly ShotLink[] = [
  { title: 'Goldfish', url: 'https://example.com/magic/fish-bowl', kind: 'fishBowl' },
  { title: 'Yo-yo tricks', url: 'https://example.com/magic/yoyo', kind: 'yoyo' },
  { title: 'Skate clips', url: 'https://example.com/magic/skateboard', kind: 'skateboard' },
  { title: 'Match highlights', url: 'https://example.com/magic/soccer-ball', kind: 'soccerBall' },
  { title: 'UFO sightings', url: 'https://example.com/magic/flying-saucer', kind: 'flyingSaucer' },
  { title: 'Lava lamp loops', url: 'https://example.com/magic/lava-lamp', kind: 'lavaLamp' },
  { title: 'Cube solving guide', url: 'https://example.com/magic/puzzle-cube', kind: 'rubiksCube' },
  { title: 'Debugging duck', url: 'https://example.com/magic/rubber-duck', kind: 'rubberDuck' },
  { title: 'World atlas', url: 'https://example.com/magic/globe', kind: 'globe' },
  { title: 'Desert plants', url: 'https://example.com/magic/cactus', kind: 'cactus' },
  { title: 'Board game night', url: 'https://example.com/magic/dice', kind: 'dice' },
  { title: 'Space race', url: 'https://example.com/magic/rocket', kind: 'rocket' },
];

/** Big objects only go on the floor; small ones can sit on shelves, the bench, the loft or the stairs. */
const FLOOR_ONLY: ReadonlySet<ObjectKind> = new Set<ObjectKind>(['tv', 'console', 'boombox', 'box', 'synthesizer']);

export interface Placement {
  link: ShotLink;
  /** Undefined means "no suitable slot was left": the store then uses the first free slot. */
  slotId: string | undefined;
}

/** Fisher-Yates, so every press of the button scatters differently. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick a random free slot for each link. Floor slots in front of the fireplace are skipped so nothing sits in the
 * flames. Big objects are handed floor slots first so they don't lose them to small ones.
 */
export function planShotPlacements(
  links: readonly ShotLink[],
  slots: readonly Slot[],
  freeSlotIds: readonly string[],
  fireplaceX: number | undefined,
  random: () => number = Math.random,
): Placement[] {
  const free = new Set(freeSlotIds);
  const usable = slots.filter((slot) => {
    if (!free.has(slot.id)) return false;
    const [x, y, z] = slot.pos;
    const nearFire = fireplaceX !== undefined && y < 1 && z < 2.0 && Math.abs(x - fireplaceX) < 1.5;
    return !nearFire;
  });
  const pool = shuffled(usable, random);
  const taken = new Set<string>();
  const take = (accept: (slot: Slot) => boolean): string | undefined => {
    const slot = pool.find((s) => !taken.has(s.id) && accept(s));
    if (slot) taken.add(slot.id);
    return slot?.id;
  };

  const result = new Map<ShotLink, string | undefined>();
  // Big first, so they get floor slots before small objects use them up.
  for (const link of links.filter((l) => FLOOR_ONLY.has(l.kind))) result.set(link, take((s) => s.id.startsWith('floor')));
  for (const link of links.filter((l) => !FLOOR_ONLY.has(l.kind))) result.set(link, take(() => true));
  return links.map((link) => ({ link, slotId: result.get(link) }));
}
