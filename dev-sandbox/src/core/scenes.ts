import type { RoomState } from './types';
import { newFireplace } from './fixtures';

export const SCENE_SCHEMA_VERSION = 1;

/** Camera state for a scene or shot: center-orbit around room */
export interface CameraState {
  orbitAngle: number;    // Degrees around the room center (0-360). 45 = the normal isometric view.
  orbitHeight: number;   // Tilt: 0 = the normal isometric elevation, +1 = 30 degrees higher, -1 = 30 degrees lower.
  zoom: number;          // Camera zoom (0.2-5). Independent of orbit and tilt.
}

/** Visual effects toggles */
export interface SceneEffects {
  vignette?: boolean;
}

/**
 * How a shot ends up in the trailer:
 *  - sandbox:   screen-captured from this app as is
 *  - composite: a 3D plate captured here, with live footage (green screen) added over it in post
 *  - vr:        real headset footage; here it only records the seated eye position and facing
 */
export type ShotType = 'sandbox' | 'composite' | 'vr';
export const SHOT_TYPES: readonly ShotType[] = ['sandbox', 'composite', 'vr'];

export type ShotEasing = 'linear' | 'ease-in-out';
export const SHOT_EASINGS: readonly ShotEasing[] = ['linear', 'ease-in-out'];

/**
 * One shot of the trailer inside a scene. The camera either holds still (end = null) or moves from `start` to `end`
 * over `durationSec`, so a push-in, pull-out or orbit is repeatable instead of being dragged by hand.
 */
export interface Shot {
  id: string;            // storyboard id, unique within the scene: "1", "7a"
  title: string;
  type: ShotType;
  durationSec: number;
  start: CameraState;
  end: CameraState | null;
  easing: ShotEasing;
  notes: string;
}

/** A saved scene composition: room layout + camera framing */
export interface Scene {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  baseRoom: RoomState;
  cameraState: CameraState;
  effects: SceneEffects;
  objectRotations?: Record<string, number>; // repId -> rotation in radians
  /** Optional so scenes saved before shots existed still load. */
  shots?: Shot[];
  createdAt: string;
  updatedAt: string;
}

function validCamera(value: unknown): value is CameraState {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<CameraState>;
  return [c.orbitAngle, c.orbitHeight, c.zoom].every((n) => typeof n === 'number' && Number.isFinite(n))
    && (c.zoom as number) > 0 && (c.zoom as number) <= 5;
}

/** Returns an error message, or null when `value` is a valid shot list. */
export function validateShots(value: unknown): string | null {
  if (!Array.isArray(value)) return 'Scene shots must be an array.';
  const ids = new Set<string>();
  for (const raw of value as Partial<Shot>[]) {
    if (!raw || typeof raw !== 'object') return 'Shot is not an object.';
    if (typeof raw.id !== 'string' || !raw.id.trim() || ids.has(raw.id)) return 'Shot missing id, or id is duplicated.';
    ids.add(raw.id);
    if (typeof raw.title !== 'string' || typeof raw.notes !== 'string') return `Shot ${raw.id} has invalid text fields.`;
    if (!SHOT_TYPES.includes(raw.type as ShotType)) return `Shot ${raw.id} has an invalid type.`;
    if (!SHOT_EASINGS.includes(raw.easing as ShotEasing)) return `Shot ${raw.id} has an invalid easing.`;
    if (typeof raw.durationSec !== 'number' || !Number.isFinite(raw.durationSec) || raw.durationSec <= 0) {
      return `Shot ${raw.id} has an invalid duration.`;
    }
    if (!validCamera(raw.start)) return `Shot ${raw.id} has an invalid start camera.`;
    if (raw.end !== null && !validCamera(raw.end)) return `Shot ${raw.id} has an invalid end camera.`;
  }
  return null;
}

/** Build a shot that holds the given camera still. */
export function newShot(id: string, title: string, camera: CameraState, partial: Partial<Shot> = {}): Shot {
  return {
    id,
    title,
    type: 'sandbox',
    durationSec: 5,
    start: { ...camera },
    end: null,
    easing: 'ease-in-out',
    notes: '',
    ...partial,
  };
}

/** Camera at progress `t` (0-1) of a shot. Orbit takes the short way round so 350 -> 10 doesn't spin through 180. */
export function shotCameraAt(shot: Shot, t: number): CameraState {
  if (!shot.end) return { ...shot.start };
  const p = Math.min(1, Math.max(0, t));
  const k = shot.easing === 'ease-in-out' ? p * p * (3 - 2 * p) : p;
  let dAngle = ((shot.end.orbitAngle - shot.start.orbitAngle + 540) % 360) - 180;
  if (dAngle === -180 && shot.end.orbitAngle > shot.start.orbitAngle) dAngle = 180;
  return {
    orbitAngle: (((shot.start.orbitAngle + dAngle * k) % 360) + 360) % 360,
    orbitHeight: shot.start.orbitHeight + (shot.end.orbitHeight - shot.start.orbitHeight) * k,
    // Zoom is perceived multiplicatively, so a push-in feels even when interpolated in log space.
    zoom: Math.exp(Math.log(shot.start.zoom) + (Math.log(shot.end.zoom) - Math.log(shot.start.zoom)) * k),
  };
}

/** Default camera state: exactly the normal-mode isometric view */
export const DEFAULT_CAMERA_STATE: CameraState = {
  orbitAngle: 45,
  orbitHeight: 0,
  zoom: 1,
};

/** Validate scene data before loading */
export function validateScene(input: unknown): string | null {
  if (!input || typeof input !== 'object') return 'Not a scene file.';
  const s = input as Partial<Scene>;

  if (s.schemaVersion !== SCENE_SCHEMA_VERSION) {
    return `Unsupported scene schemaVersion: ${String(s.schemaVersion)}.`;
  }

  if (typeof s.id !== 'string' || !s.id.trim()) return 'Scene missing or invalid id.';
  if (typeof s.name !== 'string' || !s.name.trim()) return 'Scene missing or invalid name.';
  if (typeof s.description !== 'string') return 'Scene description must be string.';

  if (!s.baseRoom || typeof s.baseRoom !== 'object') {
    return 'Scene missing baseRoom.';
  }

  if (!s.cameraState || typeof s.cameraState !== 'object') {
    return 'Scene missing cameraState.';
  }

  const cam = s.cameraState as Partial<CameraState>;
  if (typeof cam.orbitAngle !== 'number' || typeof cam.orbitHeight !== 'number' || typeof cam.zoom !== 'number') {
    return 'Scene cameraState has invalid properties.';
  }

  if (cam.zoom <= 0 || cam.zoom > 5) return 'Scene zoom must be between 0 and 5.';

  if (s.effects !== undefined && (typeof s.effects !== 'object' || s.effects === null)) {
    return 'Scene effects must be object.';
  }

  if (s.shots !== undefined) {
    const shotsError = validateShots(s.shots);
    if (shotsError) return shotsError;
  }

  if (typeof s.createdAt !== 'string' || typeof s.updatedAt !== 'string') {
    return 'Scene missing or invalid timestamps.';
  }

  return null;
}

/** Normalize and ensure valid scene data */
export function normalizeScene(input: unknown, baseRoom: RoomState): Scene {
  const error = validateScene(input);
  if (error) throw new Error(error);

  const copy = JSON.parse(JSON.stringify(input)) as Scene;
  copy.baseRoom = baseRoom; // Use provided baseRoom instead of stored version
  return copy;
}

/** Generate unique scene ID */
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Scenes are cozy rooms with a fireplace, so a new scene's room gets one unless the room already decided
 * (an explicit `fixtures: []` means "no fireplace" and is respected).
 */
function withDefaultFixtures(room: RoomState): RoomState {
  if (room.fixtures === undefined) room.fixtures = [newFireplace()];
  return room;
}

/** Create a new blank scene with given room as base */
export function newScene(name: string, baseRoom: RoomState): Scene {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: uid('scene'),
    name,
    description: '',
    baseRoom: withDefaultFixtures(JSON.parse(JSON.stringify(baseRoom)) as RoomState), // Deep copy
    cameraState: { ...DEFAULT_CAMERA_STATE },
    effects: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
