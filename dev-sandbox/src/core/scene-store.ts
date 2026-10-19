import type { RoomState } from './types';
import { newScene, normalizeScene, validateScene, type Scene } from './scenes';

const SCENES_KEY = 'mp-sandbox:scenes';
const SCENE_KEY = (sceneId: string) => `mp-sandbox:scenes:${sceneId}`;
const SCENE_BACKUP_KEY = (sceneId: string) => `mp-sandbox:scenes:${sceneId}:backup`;
const ACTIVE_SCENE_KEY = 'mp-sandbox:active-scene';

/** List all saved scene IDs */
export function listSceneIds(): string[] {
  try {
    const raw = localStorage.getItem(SCENES_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

/** Get last active scene ID, or null */
export function getActiveSceneId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SCENE_KEY);
  } catch {
    return null;
  }
}

/** Set active scene ID */
export function setActiveSceneId(sceneId: string | null): void {
  try {
    if (sceneId) {
      localStorage.setItem(ACTIVE_SCENE_KEY, sceneId);
    } else {
      localStorage.removeItem(ACTIVE_SCENE_KEY);
    }
  } catch {
    // Storage unavailable
  }
}

/** Load a scene by ID; returns null if not found or corrupted */
export function loadScene(sceneId: string, baseRoom: RoomState): Scene | null {
  for (const key of [SCENE_KEY(sceneId), SCENE_BACKUP_KEY(sceneId)]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!validateScene(parsed)) {
        return normalizeScene(parsed, baseRoom);
      }
    } catch {
      // Try backup
    }
  }

  return null;
}

/** Save a scene to localStorage and backup */
export function saveScene(scene: Scene): void {
  try {
    const data = JSON.stringify(scene);

    // Update scene ID list
    const ids = listSceneIds();
    if (!ids.includes(scene.id)) {
      ids.push(scene.id);
      localStorage.setItem(SCENES_KEY, JSON.stringify(ids));
    }

    // Save main and backup
    localStorage.setItem(SCENE_KEY(scene.id), data);
    localStorage.setItem(SCENE_BACKUP_KEY(scene.id), data);

    // Update last active
    setActiveSceneId(scene.id);
  } catch (error) {
    console.error('Failed to save scene:', error);
    throw new Error(`Could not save scene: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Delete a scene */
export function deleteScene(sceneId: string): void {
  try {
    // Remove from ID list
    const ids = listSceneIds().filter((id) => id !== sceneId);
    localStorage.setItem(SCENES_KEY, JSON.stringify(ids));

    // Remove storage
    localStorage.removeItem(SCENE_KEY(sceneId));
    localStorage.removeItem(SCENE_BACKUP_KEY(sceneId));

    // Clear active if it was this scene
    if (getActiveSceneId() === sceneId) {
      setActiveSceneId(null);
    }
  } catch (error) {
    console.error('Failed to delete scene:', error);
  }
}

/** Create and save a new scene */
export function createScene(name: string, baseRoom: RoomState): Scene {
  const scene = newScene(name, baseRoom);
  saveScene(scene);
  return scene;
}
