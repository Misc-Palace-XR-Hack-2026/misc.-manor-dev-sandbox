// Engine-free choreography. A flight is a pure function of time, so live playback,
// the scrubber and the frame-by-frame recorder all produce identical frames.
// Nothing here imports three or touches the DOM.

export type Vec3 = [number, number, number];
export type FlightEase = 'out' | 'in-out';
export const FLIGHT_EASES: readonly FlightEase[] = ['out', 'in-out'];

/** Seconds the landing bounce keeps going after the flight itself ends. */
export const SETTLE_SEC = 0.5;

const TAU = Math.PI * 2;

/** One object travelling from `from` to its resting spot (read live from its slot). */
export interface Flight {
  repId: string;
  /** Start point. Relative: an offset from the resting spot, so it follows slot changes. */
  from: Vec3;
  relative: boolean;
  /** Seconds before launch. */
  delay: number;
  duration: number;
  /** Extra height of the arc's control point. */
  arc: number;
  /** Whole yaw turns during the flight. */
  spin: number;
  /** Tilt amplitude in radians while airborne. */
  tumble: number;
  startScale: number;
  /** Invisible until launch (fling in from off-screen). False means it waits in view at `from`. */
  hiddenBefore: boolean;
  /** Rattle amplitude while waiting in view (the heap straining to hold everything). */
  strain: number;
  /** Landing bounce height. */
  bounce: number;
  ease: FlightEase;
}

export interface MotionPose {
  pos: Vec3;
  rotY: number;
  tilt: [number, number];
  scale: number;
  visible: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Stable 0..1 value from a string, for per-object variety that never changes between runs. */
export function hashUnit(text: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function flightEndSec(f: Flight): number {
  return f.delay + f.duration + (f.bounce > 0 ? SETTLE_SEC : 0);
}

export function motionLength(flights: readonly Flight[]): number {
  let end = 0;
  for (const f of flights) end = Math.max(end, flightEndSec(f));
  return end;
}

export function sampleFlight(f: Flight, rest: Vec3, restRotY: number, t: number): MotionPose {
  const start: Vec3 = f.relative
    ? [rest[0] + f.from[0], rest[1] + f.from[1], rest[2] + f.from[2]]
    : [f.from[0], f.from[1], f.from[2]];

  if (t < f.delay) {
    if (f.hiddenBefore) {
      return { pos: start, rotY: restRotY, tilt: [0, 0], scale: f.startScale, visible: false };
    }
    const wait = f.delay > 0 ? clamp(t / f.delay, 0, 1) : 1;
    const taper = clamp((f.delay - t) / 0.12, 0, 1);
    const amp = f.strain * (0.25 + 0.75 * wait * wait) * taper;
    const w = t * 38 + hashUnit(f.repId, 7) * TAU;
    return {
      pos: [
        start[0] + Math.sin(w) * amp,
        start[1] + Math.abs(Math.sin(w * 1.3 + 1)) * amp * 0.6,
        start[2] + Math.cos(w * 0.9) * amp,
      ],
      rotY: restRotY + Math.sin(w * 0.7) * amp * 2,
      tilt: [Math.sin(w * 1.1) * amp * 2, Math.cos(w) * amp * 2],
      scale: f.startScale,
      visible: true,
    };
  }

  const p = f.duration > 0 ? clamp((t - f.delay) / f.duration, 0, 1) : 1;
  const k = f.ease === 'out' ? 1 - Math.pow(1 - p, 3) : p * p * (3 - 2 * p);

  const mid: Vec3 = [(start[0] + rest[0]) / 2, (start[1] + rest[1]) / 2 + f.arc, (start[2] + rest[2]) / 2];
  const a = (1 - k) * (1 - k);
  const b = 2 * (1 - k) * k;
  const c = k * k;
  const pos: Vec3 = [
    a * start[0] + b * mid[0] + c * rest[0],
    a * start[1] + b * mid[1] + c * rest[1],
    a * start[2] + b * mid[2] + c * rest[2],
  ];

  if (p >= 1 && f.bounce > 0) {
    const s = clamp((t - f.delay - f.duration) / SETTLE_SEC, 0, 1);
    pos[1] += f.bounce * (1 - s) * (1 - s) * Math.abs(Math.sin(3 * Math.PI * s));
  }

  return {
    pos,
    rotY: restRotY + f.spin * TAU * (1 - k),
    tilt: [Math.sin(Math.PI * k) * f.tumble, Math.sin(TAU * k) * f.tumble * 0.4],
    scale: f.startScale + (1 - f.startScale) * k,
    visible: true,
  };
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function vec3(v: unknown): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [x, y, z] = v;
  if (![x, y, z].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return [x as number, y as number, z as number];
}

/** Repairs stored flights; entries that cannot be repaired are dropped. */
export function validateMotion(raw: unknown): Flight[] {
  if (!Array.isArray(raw)) return [];
  const out: Flight[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const from = vec3(e.from);
    if (typeof e.repId !== 'string' || !e.repId || !from) continue;
    out.push({
      repId: e.repId,
      from,
      relative: e.relative !== false,
      delay: clamp(num(e.delay, 0), 0, 600),
      duration: clamp(num(e.duration, 0.8), 0.05, 120),
      arc: clamp(num(e.arc, 0), -50, 50),
      spin: clamp(num(e.spin, 0), -10, 10),
      tumble: clamp(num(e.tumble, 0), 0, 3),
      startScale: clamp(num(e.startScale, 1), 0.05, 4),
      hiddenBefore: e.hiddenBefore !== false,
      strain: clamp(num(e.strain, 0), 0, 1),
      bounce: clamp(num(e.bounce, 0), 0, 3),
      ease: e.ease === 'in-out' ? 'in-out' : 'out',
    });
  }
  return out;
}

export interface MotionItem {
  repId: string;
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Objects arc in one after another from outside the frame and land on their slots.
 * `axes` are the camera's world-space right and up vectors; `reach` is how far off-screen to start.
 */
export function planFling(
  items: readonly MotionItem[],
  axes: { right: Vec3; up: Vec3 },
  reach: number,
  random: () => number,
): Flight[] {
  const n = items.length;
  if (n === 0) return [];
  const step = Math.min(0.3, 3.6 / n);
  // [right, up] weights for the entry direction.
  const entries: Array<[number, number]> = [[-1, 0.2], [1, 0.2], [-0.8, 0.9], [0.8, 0.9], [0, 1]];
  const order = shuffled(items, random);
  return order.map((item, i): Flight => {
    const [r, u] = entries[Math.floor(random() * entries.length)];
    const from: Vec3 = [
      axes.right[0] * r * reach + axes.up[0] * u * reach,
      axes.right[1] * r * reach + axes.up[1] * u * reach,
      axes.right[2] * r * reach + axes.up[2] * u * reach,
    ];
    return {
      repId: item.repId,
      from: [round(from[0]), round(from[1]), round(from[2])],
      relative: true,
      delay: round(0.2 + i * step),
      duration: round(0.65 + random() * 0.2),
      arc: round(0.8 + random() * 1.4),
      spin: Math.round((random() - 0.5) * 4) / 2,
      tumble: round(0.25 + random() * 0.35),
      startScale: 0.7,
      hiddenBefore: true,
      strain: 0,
      bounce: 0.12,
      ease: 'out',
    };
  });
}

/**
 * The "full box" without a box: every object sits shrunk in a straining heap around `hub`,
 * rattling, then bursts out on high arcs to its slot.
 */
export function planHeapLaunch(items: readonly MotionItem[], hub: Vec3, random: () => number): Flight[] {
  const n = items.length;
  if (n === 0) return [];
  const GOLDEN = 2.399963229728653;
  const step = Math.min(0.22, 2.6 / n);
  const order = shuffled(items, random);
  return order.map((item, i): Flight => {
    const angle = i * GOLDEN;
    const radius = 0.13 * Math.sqrt(i + 0.5);
    const height = Math.max(0, 0.5 - radius * 0.45) + (i % 3) * 0.04;
    return {
      repId: item.repId,
      from: [round(hub[0] + Math.cos(angle) * radius), round(hub[1] + height), round(hub[2] + Math.sin(angle) * radius)],
      relative: false,
      delay: round(1.8 + i * step),
      duration: round(1.2 + random() * 0.5),
      arc: round(2.4 + random() * 2.2),
      spin: Math.round((random() - 0.5) * 6) / 2,
      tumble: round(0.4 + random() * 0.5),
      startScale: 0.42,
      hiddenBefore: false,
      strain: 0.07,
      bounce: 0.1,
      ease: 'in-out',
    };
  });
}
