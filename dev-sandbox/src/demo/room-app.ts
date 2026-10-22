import { Store } from '../core/store';
import { MenuView, type RepoRoom } from '../views/menu';
import type { RoomView } from '../views/room';
import { roomSoundtrack, type SoundtrackPlayer } from '../views/soundtrack';
import { createRoomCapture } from '../views/room-capture';
import { createSoundtrackControl } from '../views/soundtrack-control';
import { REPO_ROOMS } from '../core/repo-rooms';

// The room's edit tools for the demo, loaded lazily. The HUD's Edit room (once the portal has been used) opens a
// trimmed look-and-feel sheet; photo and mute join it in free mode. Which of the menu's own controls show is up to
// the demo's CSS (body classes). The sandbox's guided tutorial is left out: the demo's own tutorial is the welcome.

const repoRooms: RepoRoom[] = REPO_ROOMS;

export interface DemoEditor {
  /** Open the room editor sheet (what the sandbox's Edit room button does). */
  openEditor(): void;
}

export function mountEditor(store: Store): DemoEditor {
  const menu = document.createElement('aside');
  menu.id = 'menu';
  document.body.append(menu);
  new MenuView(menu, store, repoRooms);
  // Help only replays the sandbox tutorial, which the demo doesn't have.
  document.querySelector('.chrome button[title="Replay tutorial"]')?.remove();
  const editButton = document.querySelector<HTMLButtonElement>('.chrome button[data-tutorial="style"]');
  return { openEditor: () => editButton?.click() };
}

export function mountMusic(store: Store): SoundtrackPlayer {
  return roomSoundtrack(store);
}

export function mountMute(player: SoundtrackPlayer): void {
  if (document.querySelector('.soundtrack-control')) return;
  document.body.append(createSoundtrackControl(player));
}

export function mountPhoto(view: RoomView): void {
  if (document.querySelector('.room-capture')) return;
  document.body.append(createRoomCapture(() => view.capturePhoto()));
}
