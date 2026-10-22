import * as THREE from 'three';
import type { Store } from '../core/store';
import type { RoomView, DemoHooks, DemoTap } from '../views/room';
import {
  DOLLY_S,
  dollyLens,
  clampPitch,
  dragLook,
  EYE_HEIGHT,
  smooth,
  eyeYForFloor,
  FLOOR_NORMAL_MIN,
  floorRegionsFromBoxes,
  ENTRY_PITCH,
  GLIDE_ENTER_S,
  GLIDE_EXIT_S,
  GLIDE_MOVE_S,
  glidePose,
  horizontalYaw,
  shortestYawDelta,
  overviewEntryStart,
  overviewExitEnd,
  poseFromLookAt,
  clampInRegion,
  insetOf,
  regionForPoint,
  sanitizePose,
  stepWalk,
  WALK_FAR,
  WALK_FOV,
  WALK_NEAR,
  ZOOM_BACK,
  blockedAbove,
  popLanding,
  slabAbove,
  slideBack,
  walkClear,
  zoomEyeY,
  zoomTilt,
  type FloorRegion,
  type WalkPose,
} from '../core/walk';
import './walk-mode.css';

export type Mode = 'overview' | 'walk';

interface Glide {
  start: WalkPose;
  end: WalkPose;
  t0: number;
  duration: number;
  onDone?: () => void;
  /** A dolly zoom instead of a pose glide: flatness from..to (see dollyLens); start and end are unused. */
  dolly?: { from: number; to: number };
}

const LOOK_DAMP = 14;
/** After a flick, leftover look speed dies out this fast (1/seconds). */
const LOOK_FLICK_DECAY = 5.5;
const LOOK_FLICK_MAX = 3.2;
const LOOK_FLICK_MIN = 0.35;
const ZOOM_DAMP = 8;
/** Zoom per wheel pixel (mouse wheel), per pixel of trackpad pinch (ctrl+wheel), per pixel of two-finger pinch. */
const WHEEL_ZOOM = 0.0015;
const TRACKPAD_PINCH_ZOOM = 0.01;
const TOUCH_PINCH_ZOOM = 0.005;

export interface WalkOptions {
  /** Hooks kept in every mode (frame, liftSelected, ...). Their `tap` runs first and can consume the tap. */
  hooks?: Omit<DemoHooks, 'camera'>;
  /** Offer the isometric overview (button and Esc). False: no button or Esc (the caller can still switch). Default true. */
  overview?: boolean;
  /** In the overview, a floor tap glides down to walk there. Default true. */
  overviewTapWalks?: boolean;
  /** Start walking right away, gliding from `from` (any camera pose, with its `fov`) to standing pose `to`. */
  start?: { from: WalkPose; to: WalkPose; fov?: number };
  /** Show a short line of text to the visitor. */
  say?: (text: string, ms?: number) => void;
  /** Runs at the end of every frame, once the walking eye has its pose for the frame. */
  afterFrame?: (t: number) => void;
}

/** Keep zooming out under a slab this long (seconds) and the visitor pops up through it. */
const POP_AFTER = 1.1;
/** A gap this long (seconds) in zoom-out input ends the push. */
const PUSH_GAP = 0.3;
const POP_S = 0.45;
const FIRST_POP_LINE = 'Well, this is your room. Do you…';

export interface WalkHandle {
  /** The walking eye (used while walking; the overview renders through the room's isometric camera). */
  readonly camera: THREE.PerspectiveCamera;
  /** Where the visitor is headed: 'overview' as soon as a glide up starts, 'walk' as soon as one down starts. */
  readonly mode: Mode;
  /** How far zooming out has slid the eye back (metres, along the floor) from where the visitor stands. */
  readonly steppedBack: number;
  /** Glide up to the isometric overview, remembering where the visitor stood. */
  toOverview(): void;
  /** Glide back down to where the visitor stood before the overview. */
  toWalk(): void;
  /** While walking, ease the view part of the way (0..1, shortest turn) toward facing a point on the floor plan. */
  lookToward(x: number, z: number, amount: number, maxTurn?: number): void;
  dispose(): void;
}

export function mountWalkMode(view: RoomView, store: Store, options: WalkOptions = {}): WalkHandle {
  const base = options.hooks ?? {};
  const withOverview = options.overview !== false;
  const regions = floorRegionsFromBoxes(store.layout.boxes);
  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let prefersReducedMotion = Boolean(motionQuery?.matches);
  const onReducedMotion = () => { prefersReducedMotion = Boolean(motionQuery?.matches); };
  motionQuery?.addEventListener('change', onReducedMotion);
  const reducedMotion = () => prefersReducedMotion;

  const camera = new THREE.PerspectiveCamera(WALK_FOV, 1, WALK_NEAR, WALK_FAR);
  camera.rotation.order = 'YXZ';

  let mode: Mode = 'overview';
  // The surface the visitor stands on (ground, loft, a stair step) and its height. Heights alone are ambiguous: the
  // top stair step is level with the loft.
  let here: FloorRegion | null = null;
  let floorY = 0;
  const stand = (r: FloorRegion) => { here = r; floorY = r.floorY; };
  let pose: WalkPose = { x: 3, y: EYE_HEIGHT, z: 3, yaw: 0, pitch: 0 };
  let glide: Glide | null = null;
  let lookYaw = 0;
  let lookPitch = 0;
  let lookTargetYaw = 0;
  let lookTargetPitch = 0;
  let dragging = false;
  let dragPointer: number | null = null;
  let lastDrag = { x: 0, y: 0 };
  let lastDragAt = 0;
  let lookVelYaw = 0;
  let lookVelPitch = 0;
  let frameTime = 0;
  let lastFrameTime = 0;
  const keys = new Set<string>();
  // Zoom 0 is the eye; out to 1 steps the visitor back and lifts them (see zoomEyeY / slideBack). `backed` is how far
  // zooming has stepped them back, so zooming in walks them forward no further than that.
  let zoom = 0;
  let zoomTarget = 0;
  let backed = 0;
  const touches = new Map<number, { x: number; y: number }>();
  let pinching = false;
  let pinchDist = 0;
  let pinchEndedAt = -Infinity;
  // Zooming out under the loft: one continuous push, from its start and its latest input (seconds).
  let push: { since: number; last: number } | null = null;
  let pops = 0;
  // Gliding up to the overview (mode is still 'walk' until it lands).
  let leaving = false;
  let lastWalk: { pose: WalkPose; region: FloorRegion } | null = null;

  const overviewBtn = document.createElement('button');
  overviewBtn.type = 'button';
  overviewBtn.className = 'walk-overview-btn';
  overviewBtn.textContent = 'Overview';
  overviewBtn.hidden = true;
  document.body.append(overviewBtn);

  const canvas = view.canvas;

  /** The camera is the visitor's eye: looking around only rotates it in place. */
  const place = () => {
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.y = pose.yaw;
    // Glides carry their own pitch (taken from what the eye showed when they began), so no zoom tilt on top.
    camera.rotation.x = mode === 'walk' && !glide ? zoomTilt(pose.pitch, pose.y - eyeYForFloor(floorY)) : pose.pitch;
  };

  /** The current pose with the pitch the eye actually shows (zoom tilt included), for starting a glide from. */
  const shownPose = (): WalkPose => (glide ? cancelGlidePose() : { ...pose, pitch: camera.rotation.x });

  const setZoom = (z: number) => { zoomTarget = Math.min(1, Math.max(0, z)); };

  /** Zoom input. Zooming out under the loft says so; keep at it and the visitor pops up through. */
  const zoomBy = (delta: number) => {
    setZoom(zoomTarget + delta);
    if (delta <= 0 || mode !== 'walk' || glide) { if (delta < 0) push = null; return; }
    if (!blockedAbove(regions, floorY, zoomTarget, pose.x, pose.z)) { push = null; return; }
    const now = performance.now() / 1000;
    if (!push || now - push.last > PUSH_GAP) {
      push = { since: now, last: now };
      options.say?.('You are blocked above', 1600);
      return;
    }
    push.last = now;
    if (now - push.since >= POP_AFTER) popUp();
  };

  /** Up through the slab overhead, onto it. */
  const popUp = () => {
    const slab = slabAbove(regions, floorY, pose.x, pose.z);
    if (!slab) return;
    push = null;
    const [x, z] = popLanding(slab, store.layout.boxes, pose.x, pose.z);
    const from = shownPose();
    stand(slab);
    zoom = zoomTarget = backed = 0;
    const end: WalkPose = { x, y: eyeYForFloor(slab.floorY), z, yaw: pose.yaw, pitch: Math.min(pose.pitch, 0) };
    const landed = () => {
      options.say?.(pops === 0 ? FIRST_POP_LINE : '…', pops === 0 ? 2800 : 1400);
      pops++;
    };
    if (reducedMotion()) { applyPose(end); landed(); return; }
    startGlide(from, end, POP_S, frameTime, landed);
  };

  /** Ease zoom toward its target, stepping back or forward (walls stop it) and rising or sinking (ceilings stop it). */
  const stepZoom = (dt: number) => {
    const prev = zoom;
    zoom = reducedMotion() ? zoomTarget : zoom + (zoomTarget - zoom) * (1 - Math.exp(-ZOOM_DAMP * dt));
    let dist = (zoom - prev) * ZOOM_BACK;
    if (dist < 0) dist = Math.max(dist, -backed);
    if (dist !== 0 && here) {
      const [nx, nz] = slideBack(regions, here, pose.x, pose.y, pose.z, pose.yaw, dist);
      backed = Math.max(0, backed + Math.sign(dist) * Math.hypot(nx - pose.x, nz - pose.z));
      pose.x = nx;
      pose.z = nz;
    }
    const y = zoomEyeY(regions, floorY, zoom, pose.x, pose.z);
    pose.y = reducedMotion() ? y : pose.y + (y - pose.y) * (1 - Math.exp(-ZOOM_DAMP * dt));
  };

  const applyPose = (p: WalkPose) => {
    pose = sanitizePose(p);
    lookYaw = lookTargetYaw = pose.yaw;
    lookPitch = lookTargetPitch = pose.pitch;
    place();
  };

  const syncDemoHooks = () => {
    view.setDemo({ ...base, camera: mode === 'walk' ? camera : undefined, frame: onFrame, tap: onTap });
  };

  // Same object facing as walking: they must not spin when the camera switches.
  const setOverviewHooks = () => {
    view.setDemo({ ...base, frame: onFrame, tap: onTap });
  };

  const enterWalkUi = () => {
    mode = 'walk';
    overviewBtn.hidden = !withOverview;
    canvas.classList.add('walk-mode-touch');
    syncDemoHooks();
  };

  const leaveWalkUi = () => {
    mode = 'overview';
    overviewBtn.hidden = true;
    canvas.classList.remove('walk-mode-touch');
    dragging = false;
    dragPointer = null;
    glide = null;
    setOverviewHooks();
  };

  /** `t` NaN: the glide starts on the next frame. */
  const startGlide = (start: WalkPose, end: WalkPose, duration: number, t: number, onDone?: () => void) => {
    glide = { start: sanitizePose(start), end: sanitizePose(end), t0: t, duration, onDone };
  };

  /** Where a dolly is (0 walk lens .. 1 isometric look); it drives the pose and the lens. */
  let flat = 0;
  const applyDolly = (s: number) => {
    flat = s;
    const { camera: oc, target } = view.overview;
    const lens = dollyLens(
      [oc.position.x, oc.position.y, oc.position.z],
      [target.x, target.y, target.z],
      { height: (oc.top - oc.bottom) / oc.zoom, near: oc.near, far: oc.far },
      s,
    );
    applyPose(poseFromLookAt(lens.pos, lens.lookAt));
    camera.fov = lens.fov;
    camera.near = lens.near;
    camera.far = lens.far;
    camera.updateProjectionMatrix();
  };
  const startDolly = (from: number, to: number, onDone?: () => void) => {
    applyDolly(from);
    glide = { start: pose, end: pose, t0: frameTime, duration: DOLLY_S * Math.abs(to - from), onDone, dolly: { from, to } };
  };

  const cancelGlidePose = (): WalkPose => {
    if (!glide || glide.dolly) return pose;
    if (Number.isNaN(glide.t0)) return glide.start;
    return sanitizePose(glidePose(glide.start, glide.end, frameTime - glide.t0, glide.duration));
  };

  const endYawFromOverview = (): number => {
    const { camera: c, target } = view.overview;
    return horizontalYaw([c.position.x, c.position.y, c.position.z], [target.x, target.y, target.z]);
  };

  const destPose = (x: number, z: number, region: FloorRegion, yaw: number, pitch: number): WalkPose => ({
    x,
    y: eyeYForFloor(region.floorY),
    z,
    yaw,
    pitch,
  });

  const beginWalkAt = (x: number, z: number, region: FloorRegion, t: number) => {
    stand(region);
    const [cx, cz] = clampTap(x, z, region);
    const end = destPose(cx, cz, region, endYawFromOverview(), ENTRY_PITCH);
    const instant = reducedMotion();
    if (instant) {
      applyPose(end);
      enterWalkUi();
      return;
    }
    const { camera: oc, target } = view.overview;
    const { pos, lookAt } = overviewEntryStart(
      [oc.position.x, oc.position.y, oc.position.z],
      [target.x, target.y, target.z],
      cx,
      cz,
      region.floorY,
    );
    const start = poseFromLookAt(pos, lookAt);
    applyPose(start);
    enterWalkUi();
    startGlide(start, end, GLIDE_ENTER_S, t);
  };

  /**
   * Glide to a tapped spot. Coming from up high (zoomed out) or from another surface (loft to ground, a step), land at
   * eye level looking ahead, still facing the same way; otherwise keep the view as it is.
   */
  const moveWalkTo = (x: number, z: number, region: FloorRegion, t: number) => {
    const lifted = !glide && pose.y - eyeYForFloor(floorY) > 0.05;
    const settle = lifted || here !== region;
    const from = shownPose();
    stand(region);
    const [cx, cz] = clampTap(x, z, region);
    applyPose(from);
    backed = 0;
    if (settle) zoom = zoomTarget = 0;
    const pitch = settle ? ENTRY_PITCH : from.pitch;
    const end = { ...destPose(cx, cz, region, from.yaw, pitch), y: zoomEyeY(regions, region.floorY, zoom, cx, cz) };
    if (reducedMotion()) {
      applyPose(end);
      return;
    }
    startGlide(from, end, GLIDE_MOVE_S, t);
  };

  /**
   * Up to the overview: glide to the pullback, then dolly out to the isometric look (lens narrowing as it backs off),
   * then hand over to the isometric camera. The dolly is what keeps the hand-over from jumping.
   */
  const returnToOverview = (t: number) => {
    const finish = () => { leaving = false; leaveWalkUi(); };
    if (glide?.dolly) {
      // Mid-dolly on the way down: just dolly back out.
      leaving = true;
      startDolly(flat, 1, finish);
      return;
    }
    // Remember where the visitor stands (or is headed), at eye level, for toWalk().
    if (here) lastWalk = { pose: { ...(glide ? glide.end : pose), y: eyeYForFloor(here.floorY) }, region: here };
    zoom = zoomTarget = backed = 0;
    const from = cancelGlidePose();
    applyPose(from);
    const { camera: oc, target } = view.overview;
    const { pos, lookAt } = overviewExitEnd([oc.position.x, oc.position.y, oc.position.z], [target.x, target.y, target.z]);
    const end = poseFromLookAt(pos, lookAt);
    leaving = true;
    if (reducedMotion()) {
      finish();
      return;
    }
    startGlide(from, end, GLIDE_EXIT_S, t, () => startDolly(0, 1, finish));
  };

  /**
   * From the overview (or on the way up to it) back down to where the visitor stood: the reverse of returnToOverview,
   * dolly in from the isometric look to the walk lens, then glide down.
   */
  const walkBack = (t: number) => {
    const back = lastWalk;
    if (!back) return;
    const glideDown = () => startGlide(pose, back.pose, GLIDE_ENTER_S, frameTime);
    if (leaving) {
      // Still on the way up: turn around from wherever it is.
      leaving = false;
      stand(back.region);
      if (glide?.dolly) { startDolly(flat, 0, glideDown); return; }
      const from = cancelGlidePose();
      applyPose(from);
      if (reducedMotion()) applyPose(back.pose);
      else startGlide(from, back.pose, GLIDE_MOVE_S, t);
      return;
    }
    stand(back.region);
    if (reducedMotion()) {
      applyPose(back.pose);
      enterWalkUi();
      return;
    }
    enterWalkUi();
    startDolly(1, 0, glideDown);
  };

  function clampTap(x: number, z: number, region: FloorRegion): [number, number] {
    return clampInRegion(x, z, region, insetOf(region));
  }

  function walkFloorTap(tap: DemoTap): FloorRegion | null {
    // Slot markers are hidden while nothing is selected but still catch rays, so a slot under the tap doesn't count.
    if (store.selectedId !== null || tap.repId) return null;
    const hit = tap.room;
    // Floors, plus accent boxes whose top is walkable (stair steps); regionForPoint below picks which, if any.
    if (!hit || (hit.object.userData.surface !== 'floor' && hit.object.userData.surface !== 'accent')) return null;
    const n = hit.face?.normal;
    if (!n) return null;
    const worldN = n.clone().transformDirection(hit.object.matrixWorld);
    if (worldN.y <= FLOOR_NORMAL_MIN) return null;
    const p = hit.point;
    return regionForPoint(regions, p.x, p.y, p.z);
  }

  function onTap(tap: DemoTap): boolean {
    if (pinching || performance.now() - pinchEndedAt < 300) return true; // lifting pinch fingers is not a tap
    if (base.tap?.(tap)) return true;
    const region = walkFloorTap(tap);
    if (!region) return false;
    if (mode === 'overview') {
      if (options.overviewTapWalks === false) return false;
      beginWalkAt(tap.room!.point.x, tap.room!.point.z, region, frameTime);
      return true;
    }
    moveWalkTo(tap.room!.point.x, tap.room!.point.z, region, frameTime);
    return true;
  }

  function onFrame(t: number) {
    base.frame?.(t);
    const dt = lastFrameTime > 0 ? Math.min(0.05, t - lastFrameTime) : 1 / 60;
    lastFrameTime = frameTime = t;
    if (glide && Number.isNaN(glide.t0)) glide.t0 = t; // started before this module saw a frame
    if (camera.fov !== WALK_FOV && !glide?.dolly) {
      camera.fov = Math.abs(WALK_FOV - camera.fov) < 0.05 ? WALK_FOV : camera.fov + (WALK_FOV - camera.fov) * Math.min(1, dt * 3);
      camera.near = WALK_NEAR;
      camera.far = WALK_FAR;
      camera.updateProjectionMatrix();
    }
    if (glide) {
      const elapsed = t - glide.t0;
      if (glide.dolly) {
        const { from, to } = glide.dolly;
        applyDolly(from + (to - from) * smooth(glide.duration > 0 ? elapsed / glide.duration : 1));
      } else {
        applyPose(glidePose(glide.start, glide.end, elapsed, glide.duration));
      }
      if (elapsed >= glide.duration) {
        const done = glide.onDone;
        glide = null;
        done?.();
      }
    } else if (mode === 'walk' && !dragging) {
      if (lookVelYaw || lookVelPitch) {
        lookTargetYaw += lookVelYaw * dt;
        lookTargetPitch = clampPitch(lookTargetPitch + lookVelPitch * dt);
        const fade = Math.exp(-LOOK_FLICK_DECAY * dt);
        lookVelYaw *= fade;
        lookVelPitch *= fade;
        if (Math.abs(lookVelYaw) + Math.abs(lookVelPitch) < LOOK_FLICK_MIN * 0.25) {
          lookVelYaw = 0;
          lookVelPitch = 0;
        }
      }
      const k = 1 - Math.exp(-LOOK_DAMP * dt);
      lookYaw += (lookTargetYaw - lookYaw) * k;
      lookPitch += (lookTargetPitch - lookPitch) * k;
      pose.yaw = lookYaw;
      pose.pitch = lookPitch;
    }

    if (mode === 'walk' && !glide && !dragging) {
      const region = here;
      if (region) {
        let fwd = 0, str = 0;
        if (keys.has('ArrowUp') || keys.has('KeyW')) fwd += 1;
        if (keys.has('ArrowDown') || keys.has('KeyS')) fwd -= 1;
        if (keys.has('ArrowLeft') || keys.has('KeyA')) str -= 1;
        if (keys.has('ArrowRight') || keys.has('KeyD')) str += 1;
        if (fwd || str) {
          const [nx, nz] = stepWalk(pose.x, pose.z, pose.yaw, fwd, str, dt, region);
          if (walkClear(regions, region, nx, pose.y, nz)) {
            pose.x = nx;
            pose.z = nz;
          }
        }
      }
    }

    if (mode === 'walk' && !glide) stepZoom(dt);
    place();
    options.afterFrame?.(t);
  }

  const pinchSpan = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (mode !== 'walk' || e.button !== 0) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      // A second finger turns the gesture into a pinch: stop looking, start zooming.
      pinching = true;
      dragging = false;
      dragPointer = null;
      pinchDist = pinchSpan();
      return;
    }
    if (glide || touches.size > 2) return;
    dragPointer = e.pointerId;
    lastDrag = { x: e.clientX, y: e.clientY };
    lastDragAt = 0;
    lookVelYaw = 0;
    lookVelPitch = 0;
    dragging = false;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinching && touches.size === 2) {
      const span = pinchSpan();
      zoomBy((pinchDist - span) * TOUCH_PINCH_ZOOM);
      pinchDist = span;
      return;
    }
    if (e.pointerId !== dragPointer || glide) return;
    const dx = e.clientX - lastDrag.x;
    const dy = e.clientY - lastDrag.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) < 12) return;
      dragging = true;
      lastDrag = { x: e.clientX, y: e.clientY };
      return;
    }
    const now = performance.now() / 1000;
    const moveDt = lastDragAt > 0 ? Math.max(1 / 240, now - lastDragAt) : 0;
    lastDrag = { x: e.clientX, y: e.clientY };
    lastDragAt = now;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    const next = dragLook(lookTargetYaw, lookTargetPitch, dx, dy);
    if (moveDt) {
      lookVelYaw = Math.max(-LOOK_FLICK_MAX, Math.min(LOOK_FLICK_MAX, (next.yaw - lookTargetYaw) / moveDt));
      lookVelPitch = Math.max(-LOOK_FLICK_MAX, Math.min(LOOK_FLICK_MAX, (next.pitch - lookTargetPitch) / moveDt));
    }
    lookTargetYaw = next.yaw;
    lookTargetPitch = next.pitch;
    lookYaw = next.yaw;
    lookPitch = next.pitch;
    pose.yaw = lookYaw;
    pose.pitch = lookPitch;
  };

  const endDrag = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (pinching && touches.size === 0) {
      pinching = false;
      pinchEndedAt = performance.now();
    }
    if (e.pointerId !== dragPointer) return;
    dragging = false;
    dragPointer = null;
    if (Math.abs(lookVelYaw) + Math.abs(lookVelPitch) < LOOK_FLICK_MIN) {
      lookVelYaw = 0;
      lookVelPitch = 0;
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  const onWheel = (e: WheelEvent) => {
    if (mode !== 'walk') return;
    e.preventDefault(); // trackpad pinch arrives as ctrl+wheel and would zoom the page
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomBy(px * (e.ctrlKey ? TRACKPAD_PINCH_ZOOM : WHEEL_ZOOM));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === 'Escape' && withOverview && mode === 'walk' && store.selectedId === null) {
      e.preventDefault();
      returnToOverview(frameTime);
      return;
    }
    if (mode !== 'walk') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

  overviewBtn.addEventListener('click', () => returnToOverview(frameTime));

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  // Capture phase: runs before RoomView's Esc-to-deselect, so one Esc never both deselects and leaves walking.
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp);

  if (options.start) {
    const { to } = options.start;
    const startOn = regionForPoint(regions, to.x, to.y - EYE_HEIGHT, to.z);
    if (startOn) stand(startOn);
    else floorY = to.y - EYE_HEIGHT;
    if (options.start.fov) { camera.fov = options.start.fov; camera.updateProjectionMatrix(); }
    applyPose(options.start.from);
    enterWalkUi();
    if (reducedMotion()) applyPose(options.start.to);
    else startGlide(options.start.from, options.start.to, GLIDE_ENTER_S, NaN);
  } else {
    setOverviewHooks();
  }

  return {
    camera,
    get mode() { return leaving ? 'overview' : mode; },
    get steppedBack() { return mode === 'walk' ? backed : 0; },
    toOverview() {
      if (mode === 'walk' && !leaving) returnToOverview(frameTime);
    },
    toWalk() {
      if (mode === 'overview' || leaving) walkBack(frameTime);
    },
    lookToward(x, z, amount, maxTurn = 0.32) {
      if (mode !== 'walk' || leaving || glide || dragging) return;
      const yaw = horizontalYaw([pose.x, pose.y, pose.z], [x, pose.y, z]);
      const d = shortestYawDelta(lookYaw, yaw) * amount;
      const cap = Number.isFinite(maxTurn) && maxTurn > 0 ? maxTurn : 0.32;
      lookVelYaw = 0;
      lookVelPitch = 0;
      lookTargetYaw = lookYaw + Math.sign(d) * Math.min(Math.abs(d), cap);
      // A little down, so the floor and the middle of the room stay in view.
      lookTargetPitch = lookPitch + (ENTRY_PITCH - lookPitch) * 0.45;
    },
    dispose() {
      motionQuery?.removeEventListener('change', onReducedMotion);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      overviewBtn.remove();
      canvas.classList.remove('walk-mode-touch');
      view.setDemo({ ...base });
    },
  };
}
