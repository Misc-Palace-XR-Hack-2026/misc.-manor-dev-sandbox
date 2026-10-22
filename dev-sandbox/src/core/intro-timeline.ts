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
/**
 * The save point (the "portal" to visitors) stands off the room like the jukebox, but on the other side: just past
 * the open front edge on the stairs half (the west side itself is walled, which would hide it from the dollhouse), at
 * ground-floor level. Across the room from where the tutorial leaves the visitor, within reach from the floor's edge.
 */
export const SAVE_POINT_POS: Vec3 = [2.6, 0, 8.45];
/** Walking, the save point opens from this close (metres, measured on the floor plan); farther taps say walk closer. */
export const SAVE_POINT_REACH = 3;
/** The cardboard box of starter objects, on the floor in front of the bench and wall shelf. */
export const BOX_POS: Vec3 = [8.3, 0, 2.2];
/** What the camera looks at while the starter objects are introduced. */
const BOX_LOOK: Vec3 = [BOX_POS[0], 0.4, BOX_POS[2]];

// ---- tutorial framing ----------------------------------------------------------
// Led from mobile: the camera is solved for a narrow phone screen, so the bench, shelf and box always fit there.
// Wider screens keep the same pose and simply see more around it; narrower ones back off further.

export interface View { camera: Vec3; lookAt: Vec3; fov: number }

/** The screen shape the framing is designed for (a portrait phone browser). */
export const DESIGN_ASPECT = 0.46;
/** Vertical field of view of the tutorial camera, degrees. */
export const TUTORIAL_FOV = 55;
/** How far the tutorial camera looks down, degrees. Steep enough that the top shelf faces the visitor. */
export const TUTORIAL_PITCH = 32;
/** Share of the frustum width the framed points may use; the rest is breathing room at the edges. */
const FILL = 0.9;
/**
 * Screen bands the framed points stay out of, as shares of the screen height. The bottom band holds the visitor's
 * hands, the dock and the preview card, so a slot or the box is never under them; the top band holds Skip.
 */
export const FRAME_BANDS = { top: 0.07, bottom: 0.4 };

const corners = (min: Vec3, max: Vec3): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);

/** Everything that must be on screen in the tutorial: bench and shelf with room for objects on them, and the box. */
export const FRAME_POINTS: readonly Vec3[] = [
  ...corners([6.8, 0, 0], [9.8, 2.4, 0.9]),
  ...corners([BOX_POS[0] - 0.7, 0, BOX_POS[2] - 0.6], [BOX_POS[0] + 0.7, 0.8, BOX_POS[2] + 0.6]),
];

const FRAME_CENTER: Vec3 = [0, 1, 2].map((c) => {
  const vs = FRAME_POINTS.map((p) => p[c]);
  return (Math.min(...vs) + Math.max(...vs)) / 2;
}) as Vec3;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The locked tutorial camera for a screen aspect (width / height): looks north and down at the frame points, which
 * sit between the screen bands (`FRAME_BANDS`), so on a phone the bench, shelf and box fill the upper part of the
 * screen and the UI below never covers them.
 */
export function tutorialView(aspect: number): View {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(aspect, DESIGN_ASPECT) : DESIGN_ASPECT;
  const tan = Math.tan(rad(TUTORIAL_FOV) / 2);
  const tanH = tan * FILL * a;
  // Allowed vertical screen range in normalized device coordinates (-1 bottom, 1 top).
  const lo = (-1 + 2 * FRAME_BANDS.bottom) * tan, hi = (1 - 2 * FRAME_BANDS.top) * tan;
  const s = Math.sin(rad(TUTORIAL_PITCH)), c = Math.cos(rad(TUTORIAL_PITCH));
  // Camera basis: forward (0, -s, -c), up (0, c, -s), right (1, 0, 0). The camera sits `d` back from the frame centre
  // along the view and `e` along its up axis (same look direction). Each point (up offset v, depth z + d) needs
  // lo * (z + d) <= v - e <= hi * (z + d).
  const pts = FRAME_POINTS.map((p) => {
    const ry = p[1] - FRAME_CENTER[1], rz = p[2] - FRAME_CENTER[2];
    return { x: Math.abs(p[0] - FRAME_CENTER[0]), v: ry * c - rz * s, z: -ry * s - rz * c };
  });
  /** The range of `e` that fits every point at distance `d` (empty when min > max). */
  const shift = (d: number) => ({
    min: Math.max(...pts.map((p) => p.v - hi * (p.z + d))),
    max: Math.min(...pts.map((p) => p.v - lo * (p.z + d))),
  });
  let d = Math.max(0, ...pts.map((p) => p.x / tanH - p.z));
  if (shift(d).min > shift(d).max) {
    let far = d + 1;
    while (shift(far).min > shift(far).max) far *= 2;
    for (let i = 0; i < 50; i++) {
      const mid = (d + far) / 2;
      if (shift(mid).min > shift(mid).max) d = mid; else far = mid;
    }
    d = far;
  }
  const range = shift(d);
  const e = (range.min + range.max) / 2;
  const center: Vec3 = [FRAME_CENTER[0], FRAME_CENTER[1] + c * e, FRAME_CENTER[2] - s * e];
  return {
    camera: [center[0], center[1] + s * d, center[2] + c * d],
    lookAt: center,
    fov: TUTORIAL_FOV,
  };
}

/** How far the visitor may turn the tutorial camera by dragging, degrees. */
export const LOOK_LIMITS = { yaw: 25, pitch: 12 };

export function clampLook(yaw: number, pitch: number): { yaw: number; pitch: number } {
  const clamp = (n: number, limit: number) => (Number.isFinite(n) ? Math.min(limit, Math.max(-limit, n)) : 0);
  return { yaw: clamp(yaw, rad(LOOK_LIMITS.yaw)), pitch: clamp(pitch, rad(LOOK_LIMITS.pitch)) };
}

/**
 * Where to look when the view is turned by (yaw, pitch) radians from its framing. Same convention as three.js
 * cameras: positive yaw turns left (toward -x when looking north), positive pitch looks up.
 */
export function lookAround(view: View, yaw: number, pitch: number): Vec3 {
  const [cx, cy, cz] = view.camera;
  const dx = view.lookAt[0] - cx, dy = view.lookAt[1] - cy, dz = view.lookAt[2] - cz;
  const len = Math.hypot(dx, dy, dz) || 1;
  const turned = clampLook(yaw, pitch);
  const y = Math.atan2(-dx, -dz) + turned.yaw;
  const p = Math.asin(Math.max(-1, Math.min(1, dy / len))) + turned.pitch;
  return [cx - Math.sin(y) * Math.cos(p) * len, cy + Math.sin(p) * len, cz - Math.cos(y) * Math.cos(p) * len];
}

/** The framing used when the screen shape is unknown (tests, first frame). */
export const TUTORIAL_VIEW: View = tutorialView(DESIGN_ASPECT);

// The camera path is one smooth curve (Catmull-Rom through the keys: no stop at each key, so no jank). Up to the
// doorway the look keys sit exactly AHEAD west of the camera keys, so the camera looks straight ahead and never flips.
// Inside, it rises and steps back to the tutorial view, which depends on the screen shape.
const AHEAD = 4;
const posKeys = (view: View): Key<Vec3>[] => [
  { t: 0, v: [E + 5.4, 1.6, 3.3] },
  { t: 1.9, v: [E + 1.6, 1.6, 3.3] }, // in the doorway
  { t: 2.8, v: [E - 0.6, 1.6, 3.3] }, // just inside the room
  { t: 4.0, v: [9.0, 2.6, 5.4] },
  { t: 5.4, v: view.camera },
];

const lookKeys = (view: View): Key<Vec3>[] => [
  { t: 0, v: [E + 5.4 - AHEAD, 1.6, 3.3] },
  { t: 1.9, v: [E + 1.6 - AHEAD, 1.6, 3.3] },
  { t: 2.8, v: [E - 0.6 - AHEAD, 1.6, 3.3] },
  { t: 4.0, v: BOX_LOOK }, // inside: look at the box
  { t: 5.4, v: view.lookAt }, // then the shelf, where the camera stays
];

const fovKeys = (view: View): Key<number>[] => [{ t: 0, v: 62 }, { t: 4.0, v: 62 }, { t: 5.4, v: view.fov }];
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

/**
 * Everything the walk-in needs to draw the intro at `time` seconds, ending on `view` (the tutorial framing for the
 * current screen). Clamps to [0, INTRO_DURATION].
 */
export function introFrame(time: number, view: View = TUTORIAL_VIEW): IntroFrame {
  const t = Number.isFinite(time) ? Math.min(INTRO_DURATION, Math.max(0, time)) : 0;
  return {
    time: t,
    phase: phaseAt(t),
    camera: glide(posKeys(view), t),
    lookAt: glide(lookKeys(view), t),
    fov: sample(fovKeys(view), t),
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

/** The visitor asked for the intro: `?intro`, or `/intro/` which forwards to `/?intro`. */
export function introRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).has('intro');
  } catch {
    return false;
  }
}

/**
 * Intro plays on an explicit request, or on a first visit. `hasSavedRoom` is what makes a real data clear
 * work: clearing the browser *cache* leaves localStorage (and this flag) in place, so a visitor with no
 * saved demo room is treated as a first visit even when the stale flag says the intro was seen. Leave it
 * out to keep the flag-only behaviour. Unreadable storage counts as "not seen".
 */
export function shouldPlayIntro(
  storage: KeyValueStore | null, search: string, opts?: { hasSavedRoom?: boolean },
): boolean {
  if (introRequested(search)) return true;
  if (opts?.hasSavedRoom === false) return true;
  try {
    return storage?.getItem(INTRO_SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markIntroSeen(storage: KeyValueStore | null): void {
  try { storage?.setItem(INTRO_SEEN_KEY, '1'); } catch { /* storage may be blocked; the intro just replays */ }
}
