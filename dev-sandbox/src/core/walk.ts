// First-person walk helpers: floor bounds, glides, look angles. Pure math (no three, no DOM).
// Yaw/pitch follow three.js cameras (rotation order YXZ): yaw 0 looks down -z, positive yaw turns toward -x,
// positive pitch looks up.

import type { Box, Vec3 } from './layout';

export const WALK_FOV = 65;
export const WALK_NEAR = 0.05;
export const WALK_FAR = 120;
export const EYE_HEIGHT = 1.6;
export const GLIDE_ENTER_S = 0.9;
export const GLIDE_MOVE_S = 0.7;
export const GLIDE_EXIT_S = 0.9;
export const PITCH_LIMIT = (60 * Math.PI) / 180;
/** Floor slabs run 0.3 under the walls, so this keeps the eye about 0.35 clear of a wall's inner face. */
export const BOUNDS_INSET = 0.65;
export const OVERVIEW_PULLBACK = 9;
export const FLOOR_NORMAL_MIN = 0.7;
/** Slight downward tilt when landing from overview. */
export const ENTRY_PITCH = -0.12;
export const MOVE_SPEED = 3.5;
export const LOOK_SENS = 0.0022;
/** Fully zoomed out: this far behind the visitor and this much higher, never above ZOOM_TOP (walls top out at 4.2). */
export const ZOOM_BACK = 3.5;
export const ZOOM_UP = 2.0;
export const ZOOM_TOP = 4.0;
/** Downward tilt per metre of lift, radians. */
export const ZOOM_TILT = 0.15;
/** Clearance kept under an overhead slab (the loft). */
const SLAB_CLEAR = 0.2;

export interface FloorRegion {
  /** Underside of the slab; defaults to 0.3 below the top. */
  underY?: number;
  floorY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** How far the eye keeps from the edges; defaults to BOUNDS_INSET (floors run under the walls). */
  inset?: number;
}

/** Stair steps are small and end at the wall's inner face, so the eye keeps just this far from their edges. */
export const STEP_INSET = 0.3;

export const insetOf = (r: FloorRegion): number => r.inset ?? BOUNDS_INSET;

export interface WalkPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Everything a visitor can stand on: floor slabs, plus walkable boxes such as stair steps. */
export function floorRegionsFromBoxes(boxes: readonly Box[]): FloorRegion[] {
  return boxes
    .filter((b) => b.material === 'floor' || b.walkable)
    .map((b) => ({
      underY: b.min[1],
      floorY: b.min[1] + b.size[1],
      minX: b.min[0],
      maxX: b.min[0] + b.size[0],
      minZ: b.min[2],
      maxZ: b.min[2] + b.size[2],
      ...(b.material === 'floor' ? {} : { inset: STEP_INSET }),
    }));
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export const smooth = (n: number) => {
  const t = clamp01(n);
  return t * t * (3 - 2 * t);
};

/** Standable range along one axis; a surface narrower than its insets (the landing step) is stood on its centre line. */
function span(min: number, max: number, inset: number): [number, number] {
  const lo = min + inset, hi = max - inset;
  return lo <= hi ? [lo, hi] : [(min + max) / 2, (min + max) / 2];
}

export function clampInRegion(x: number, z: number, region: FloorRegion, inset: number): [number, number] {
  const [loX, hiX] = span(region.minX, region.maxX, inset);
  const [loZ, hiZ] = span(region.minZ, region.maxZ, inset);
  return [
    Math.min(hiX, Math.max(loX, Number.isFinite(x) ? x : loX)),
    Math.min(hiZ, Math.max(loZ, Number.isFinite(z) ? z : loZ)),
  ];
}

/** Pick the walkable floor under a shell hit (y ≈ floor top, x/z inside). */
export function regionForPoint(regions: readonly FloorRegion[], x: number, y: number, z: number): FloorRegion | null {
  let best: FloorRegion | null = null;
  let bestDy = Infinity;
  for (const r of regions) {
    const dy = Math.abs(y - r.floorY);
    if (dy > 0.2 || dy >= bestDy) continue;
    if (x < r.minX - 0.05 || x > r.maxX + 0.05 || z < r.minZ - 0.05 || z > r.maxZ + 0.05) continue;
    best = r;
    bestDy = dy;
  }
  return best;
}

export function regionAtHeight(regions: readonly FloorRegion[], floorY: number): FloorRegion | null {
  let best: FloorRegion | null = null;
  let bestDy = Infinity;
  for (const r of regions) {
    const dy = Math.abs(r.floorY - floorY);
    if (dy < bestDy) {
      best = r;
      bestDy = dy;
    }
  }
  return bestDy <= 0.05 ? best : null;
}

/** Yaw that faces from `from` toward `to` on the horizontal plane. */
export function horizontalYaw(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
}

export function forwardToYawPitch(fx: number, fy: number, fz: number): { yaw: number; pitch: number } {
  const h = Math.hypot(fx, fz);
  const pitch = Math.atan2(Number.isFinite(fy) ? fy : 0, h || 1);
  return { yaw: Math.atan2(-fx, -fz), pitch };
}

export function clampPitch(pitch: number, limit = PITCH_LIMIT): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.min(limit, Math.max(-limit, pitch));
}

export function shortestYawDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function glidePose(from: WalkPose, to: WalkPose, elapsed: number, duration: number): WalkPose {
  const u = duration <= 0 ? 1 : smooth(clamp01(elapsed / duration));
  const dyaw = shortestYawDelta(from.yaw, to.yaw);
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u,
    z: from.z + (to.z - from.z) * u,
    yaw: from.yaw + dyaw * u,
    pitch: from.pitch + (to.pitch - from.pitch) * u,
  };
}

export function poseFromLookAt(pos: Vec3, lookAt: Vec3): WalkPose {
  const dx = lookAt[0] - pos[0], dy = lookAt[1] - pos[1], dz = lookAt[2] - pos[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const { yaw, pitch } = forwardToYawPitch(dx / len, dy / len, dz / len);
  return { x: pos[0], y: pos[1], z: pos[2], yaw, pitch: clampPitch(pitch) };
}

/** Start high like the iso view, looking at the standing point on the floor. */
export function overviewEntryStart(
  cam: Vec3,
  target: Vec3,
  destX: number,
  destZ: number,
  destFloorY: number,
  pullback = OVERVIEW_PULLBACK,
): { pos: Vec3; lookAt: Vec3 } {
  const dx = cam[0] - target[0], dy = cam[1] - target[1], dz = cam[2] - target[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const eyeY = destFloorY + EYE_HEIGHT;
  const lookAt: Vec3 = [destX, eyeY, destZ];
  const pos: Vec3 = [
    target[0] + (dx / len) * pullback,
    target[1] + (dy / len) * pullback,
    target[2] + (dz / len) * pullback,
  ];
  return { pos, lookAt };
}

export function overviewExitEnd(cam: Vec3, target: Vec3, pullback = OVERVIEW_PULLBACK): { pos: Vec3; lookAt: Vec3 } {
  const dx = cam[0] - target[0], dy = cam[1] - target[1], dz = cam[2] - target[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    pos: [target[0] + (dx / len) * pullback, target[1] + (dy / len) * pullback, target[2] + (dz / len) * pullback],
    lookAt: [target[0], target[1], target[2]],
  };
}

/** Grab-the-world drag (like Street View): drag right and the view turns left, drag down and it tilts up. */
export function dragLook(yaw: number, pitch: number, dx: number, dy: number, sens = LOOK_SENS): { yaw: number; pitch: number } {
  return {
    yaw: Number.isFinite(yaw) ? yaw + dx * sens : 0,
    pitch: clampPitch(Number.isFinite(pitch) ? pitch + dy * sens : 0),
  };
}

const inside = (r: FloorRegion, x: number, z: number, margin: number) =>
  x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin;

// Zoom moves the visitor: out steps them back along where they face and lifts them (0 at the eye .. 1 is ZOOM_BACK
// back and ZOOM_UP up). Walls stop the step and ceilings stop the lift; nothing pushes them elsewhere instead.

const SLAB_MARGIN = 0.3;
const slabUnder = (r: FloorRegion) => r.underY ?? r.floorY - 0.3;
const slabCeiling = (r: FloorRegion) => slabUnder(r) - SLAB_CLEAR;
/** Slabs a visitor on this floor can stand under (lower ones, like the bottom stair steps, are obstacles instead). */
const overheadSlabs = (regions: readonly FloorRegion[], floorY: number) =>
  regions.filter((r) => r.floorY > floorY + 0.5 && slabUnder(r) >= eyeYForFloor(floorY));

/** Highest the eye can go at (x, z): under an overhead slab (the loft) its underside, otherwise ZOOM_TOP. */
export function ceilingAt(regions: readonly FloorRegion[], floorY: number, x: number, z: number): number {
  let top = Math.max(ZOOM_TOP, eyeYForFloor(floorY));
  for (const r of overheadSlabs(regions, floorY)) if (inside(r, x, z, SLAB_MARGIN)) top = Math.min(top, slabCeiling(r));
  return top;
}

/** Eye height for a zoom level at (x, z), stopped by the ceiling there. */
export function zoomEyeY(regions: readonly FloorRegion[], floorY: number, zoom: number, x: number, z: number): number {
  const eye = eyeYForFloor(floorY);
  return Math.max(eye, Math.min(eye + clamp01(zoom) * ZOOM_UP, ceilingAt(regions, floorY, x, z)));
}

/** Can an eye at height y stand at (x, z) on `region`: inside its edges and not up inside a slab above. */
export function walkClear(regions: readonly FloorRegion[], region: FloorRegion, x: number, y: number, z: number): boolean {
  const inset = insetOf(region);
  const [loX, hiX] = span(region.minX, region.maxX, inset);
  const [loZ, hiZ] = span(region.minZ, region.maxZ, inset);
  const e = 1e-9;
  if (x < loX - e || x > hiX + e || z < loZ - e || z > hiZ + e) return false;
  return overheadSlabs(regions, region.floorY).every((r) => !inside(r, x, z, SLAB_MARGIN) || y <= slabCeiling(r));
}

/** Step `dist` back along yaw (negative: forward) at eye height y, stopping where the way is blocked. */
export function slideBack(
  regions: readonly FloorRegion[], region: FloorRegion, x: number, y: number, z: number, yaw: number, dist: number,
): [number, number] {
  if (!Number.isFinite(dist) || dist === 0) return [x, z];
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const n = Math.max(1, Math.ceil(Math.abs(dist) / 0.05));
  let px = x, pz = z;
  for (let i = 1; i <= n; i++) {
    const t = (dist * i) / n;
    const nx = x + sy * t, nz = z + cy * t;
    if (!walkClear(regions, region, nx, y, nz)) break;
    px = nx;
    pz = nz;
  }
  return [px, pz];
}

/** The slab right above (x, z) that a visitor on this floor would bump their head on, if any. */
export function slabAbove(regions: readonly FloorRegion[], floorY: number, x: number, z: number): FloorRegion | null {
  let best: FloorRegion | null = null;
  for (const r of overheadSlabs(regions, floorY)) {
    if (inside(r, x, z, SLAB_MARGIN) && (!best || r.floorY < best.floorY)) best = r;
  }
  return best;
}

/** Zooming out here wants more height than the slab above allows. */
export function blockedAbove(regions: readonly FloorRegion[], floorY: number, zoom: number, x: number, z: number): boolean {
  if (!slabAbove(regions, floorY, x, z)) return false;
  return eyeYForFloor(floorY) + clamp01(zoom) * ZOOM_UP > ceilingAt(regions, floorY, x, z) + 0.01;
}

/**
 * Where a visitor popping up through `slab` from (x, z) lands on it: straight up, nudged in from its edges and out
 * of anything standing on it (the loft's block).
 */
export function popLanding(slab: FloorRegion, boxes: readonly Box[], x: number, z: number): [number, number] {
  const inset = insetOf(slab);
  let [px, pz] = clampInRegion(x, z, slab, inset);
  const clear = 0.35;
  for (const b of boxes) {
    if (b.material === 'floor' || Math.abs(b.min[1] - slab.floorY) > 0.05) continue;
    const x0 = b.min[0] - clear, x1 = b.min[0] + b.size[0] + clear;
    const z0 = b.min[2] - clear, z1 = b.min[2] + b.size[2] + clear;
    if (px <= x0 || px >= x1 || pz <= z0 || pz >= z1) continue;
    // Step out the shortest way that stays on the slab.
    const exits: [number, number][] = [[x0, pz], [x1, pz], [px, z0], [px, z1]];
    const onSlab = exits.filter(([ex, ez]) => {
      const [cx, cz] = clampInRegion(ex, ez, slab, inset);
      return Math.abs(cx - ex) < 1e-9 && Math.abs(cz - ez) < 1e-9;
    });
    const pick = (onSlab.length ? onSlab : exits).reduce((a, e) =>
      Math.hypot(e[0] - px, e[1] - pz) < Math.hypot(a[0] - px, a[1] - pz) ? e : a);
    [px, pz] = clampInRegion(pick[0], pick[1], slab, inset);
  }
  return [px, pz];
}

/** Lifted eyes tilt down a little so the room below stays in view. */
export function zoomTilt(pitch: number, lift: number): number {
  return clampPitch(pitch - Math.max(0, lift) * ZOOM_TILT);
}

/** WASD / arrows: forward/back along yaw, strafe on x/z. */
export function stepWalk(
  x: number,
  z: number,
  yaw: number,
  forward: number,
  strafe: number,
  dt: number,
  region: FloorRegion,
  inset = insetOf(region),
  speed = MOVE_SPEED,
): [number, number] {
  if (!Number.isFinite(dt) || dt <= 0) return clampInRegion(x, z, region, inset);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const scale = speed * dt;
  const nx = x + (-sy * forward + cy * strafe) * scale;
  const nz = z + (-cy * forward - sy * strafe) * scale;
  return clampInRegion(nx, nz, region, inset);
}

export function eyeYForFloor(floorY: number): number {
  return floorY + EYE_HEIGHT;
}

export function sanitizePose(p: WalkPose): WalkPose {
  const f = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
  return { x: f(p.x), y: f(p.y), z: f(p.z), yaw: f(p.yaw), pitch: clampPitch(f(p.pitch)) };
}
