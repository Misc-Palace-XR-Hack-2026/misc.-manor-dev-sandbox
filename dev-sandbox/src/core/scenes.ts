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
  createdAt: string;
  updatedAt: string;
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
