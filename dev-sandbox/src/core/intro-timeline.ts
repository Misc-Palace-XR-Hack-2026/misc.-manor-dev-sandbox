// Scripted walk-in for the demo: a black fade into the dark, a door that swings open on bright light (everything else
// stays darkish), a straight walk through it from the open east side, then a look at the starter box and finally the
// shelf, where the camera stays for the locked tutorial.
// It plays inside the real room (its own lighting and background). Pure data + math (no three, no DOM) so it is
// unit-testable. World space matches core/layout.ts: back corner at the origin, +x east (the open side), +z toward the
// viewer, +y up.

export type Vec3 = [number, number, number];
export type IntroPhase = 'dark' | 'approach' | 'enter' | 'setpiece' | 'done';

interface Key<T> { t: number; v: T }

/** East edge of the room floor (layout W). The door, jukebox and walk path are placed relative to it. */
export const ROOM_EAST = 10.3;
const E = ROOM_EAST;

/** The door stands just outside the open east edge of the room. */
export const DOOR_POS: Vec3 = [E + 1.6, 0, 3.3];
/** Stands on the ground level beside the east end of the back-right wall, outside the room, facing into it. */
export const JUKEBOX_POS: Vec3 = [E + 1.1, 0, 1.3];
/** Middle of the starter box, in front of the bench and wall shelf. */
export const TRAY_POS: Vec3 = [8.2, 0, 2.6];
/** What the camera looks at while the starter objects are introduced. */
const BOX_LOOK: Vec3 = [TRAY_POS[0], 0.4, TRAY_POS[2]];

/** The locked tutorial camera: looks straight at the box, bench and shelf. */
export const TUTORIAL_VIEW = { camera: [8.2, 2.2, 6.2] as Vec3, lookAt: [8.2, 0.95, 1.2] as Vec3, fov: 46 };

// The camera path is one smooth curve (Catmull-Rom through the keys: no stop at each key, so no jank). Up to the
// doorway the look keys sit exactly AHEAD west of the camera keys, so the camera looks straight ahead and never flips.
const AHEAD = 4;
const POS: Key<Vec3>[] = [
  { t: 0, v: [E + 5.4, 1.6, 3.3] },
  { t: 1.9, v: [E + 1.6, 1.6, 3.3] }, // in the doorway
  { t: 2.8, v: [E - 0.6, 1.6, 3.3] }, // just inside the room
  { t: 4.0, v: [9.0, 1.7, 4.4] },
  { t: 5.4, v: TUTORIAL_VIEW.camera },
];

const LOOK: Key<Vec3>[] = [
  { t: 0, v: [E + 5.4 - AHEAD, 1.6, 3.3] },
  { t: 1.9, v: [E + 1.6 - AHEAD, 1.6, 3.3] },
  { t: 2.8, v: [E - 0.6 - AHEAD, 1.6, 3.3] },
  { t: 4.0, v: BOX_LOOK }, // inside: look at the objects
  { t: 5.4, v: TUTORIAL_VIEW.lookAt }, // then the shelf, where the camera stays
];

const FOV: Key<number>[] = [{ t: 0, v: 62 }, { t: 4.0, v: 62 }, { t: 5.4, v: TUTORIAL_VIEW.fov }];
/** Black overlay opacity: starts pure black so the first frame has no pop. */
const BLACK: Key<number>[] = [{ t: 0, v: 1 }, { t: 0.7, v: 0 }];
/** The door swings open (0 closed, 1 fully open) while the screen fades up. */
const DOOR_OPEN: Key<number>[] = [{ t: 0, v: 0 }, { t: 0.3, v: 0 }, { t: 1.3, v: 1 }];
/** The light filling the doorway stays blinding until the visitor is in the doorway, then gives way to the room. */
const DOOR_LIGHT: Key<number>[] = [{ t: 0, v: 1 }, { t: 1.6, v: 1 }, { t: 2.4, v: 0 }];
/** How much of the room (and everything around the door) is darkened, until the visitor walks through. */
const DARKNESS: Key<number>[] = [{ t: 0, v: 0.92 }, { t: 1.5, v: 0.92 }, { t: 2.3, v: 0 }];

/** When each phase begins, in seconds. 'done' is the resting frame: the intro is over and the tutorial begins. */
export const PHASE_STARTS: Record<IntroPhase, number> = { dark: 0, approach: 0.5, enter: 1.9, setpiece: 2.8, done: 5.4 };
export const INTRO_DURATION = PHASE_STARTS.done;

export interface IntroFrame {
  time: number;
  phase: IntroPhase;
  camera: Vec3;
  lookAt: Vec3;
  fov: number;
  black: number;
  /** 0 = closed, 1 = fully open. */
  doorOpen: number;
  /** Opacity of the bright light in the doorway. */
  doorLight: number;
  /** Opacity of the dark veil over the room and its surroundings. */
  darkness: number;
  /** True while the camera is walking (the caller adds a gentle head bob). */
  walking: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (n: number) => n * n * (3 - 2 * n);

function sample(keys: Key<number>[], time: number): number {
  if (time <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (time >= last.t) return last.v;
  let i = 0;
  while (time > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const k = smooth(clamp01((time - a.t) / (b.t - a.t)));
  return a.v + (b.v - a.v) * k;
}

/** Catmull-Rom through the keys, with zero velocity at the two ends: one continuous glide, no stop at each key. */
function glide(keys: Key<Vec3>[], time: number): Vec3 {
  if (time <= keys[0].t) return keys[0].v;
  const last = keys.length - 1;
  if (time >= keys[last].t) return keys[last].v;
  let i = 0;
  while (time > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const h = b.t - a.t, u = (time - a.t) / h;
  const tangent = (n: number, c: number) => {
    if (n === 0 || n === last) return 0;
    return (keys[n + 1].v[c] - keys[n - 1].v[c]) / (keys[n + 1].t - keys[n - 1].t);
  };
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  return [0, 1, 2].map((c) => h00 * a.v[c] + h10 * h * tangent(i, c) + h01 * b.v[c] + h11 * h * tangent(i + 1, c)) as Vec3;
}

export function phaseAt(time: number): IntroPhase {
  if (time >= PHASE_STARTS.done) return 'done';
  if (time >= PHASE_STARTS.setpiece) return 'setpiece';
  if (time >= PHASE_STARTS.enter) return 'enter';
  if (time >= PHASE_STARTS.approach) return 'approach';
  return 'dark';
}

/** Everything the walk-in needs to draw the intro at `time` seconds. Clamps to [0, INTRO_DURATION]. */
export function introFrame(time: number): IntroFrame {
  const t = Number.isFinite(time) ? Math.min(INTRO_DURATION, Math.max(0, time)) : 0;
  return {
    time: t,
    phase: phaseAt(t),
    camera: glide(POS, t),
    lookAt: glide(LOOK, t),
    fov: sample(FOV, t),
    black: sample(BLACK, t),
    doorOpen: sample(DOOR_OPEN, t),
    doorLight: sample(DOOR_LIGHT, t),
    darkness: sample(DARKNESS, t),
    walking: t > 0.6 && t < 2.8,
  };
}

// ---- first-visit flag --------------------------------------------------------

export const INTRO_SEEN_KEY = 'mp-demo:intro-seen';

interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Intro plays on a first visit, or when `?intro` is in the URL. Unreadable storage counts as "not seen". */
export function shouldPlayIntro(storage: KeyValueStore | null, search: string): boolean {
  if (new URLSearchParams(search).has('intro')) return true;
  try {
    return storage?.getItem(INTRO_SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markIntroSeen(storage: KeyValueStore | null): void {
  try { storage?.setItem(INTRO_SEEN_KEY, '1'); } catch { /* storage may be blocked; the intro just replays */ }
}
