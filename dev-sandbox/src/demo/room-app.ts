import { Store } from '../core/store';
import { MenuView, type RepoRoom } from '../views/menu';
import type { RoomView } from '../views/room';
import { SoundtrackPlayer } from '../views/soundtrack';
import { createRoomCapture } from '../views/room-capture';
import { createSoundtrackControl } from '../views/soundtrack-control';
import { REPO_ROOMS } from '../core/repo-rooms';

// The room's edit tools (theme, lighting, add and import objects, rooms, photo, soundtrack) for the demo, loaded lazily.
// The editor comes first (the HUD's Edit room, once the portal has been used); photo and room music join it when the
// demo reaches free mode. Which of the menu's own controls show is up to the demo's CSS (body classes).
// The sandbox's guided tutorial (Welcome card, Help replay) is left out: the demo's own tutorial is the welcome.
// TODO(demo): curate these for the demo instead of reusing the sandbox menu as is.

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

/** Take photo and room music (with its mute button). */
export function mountRoomExtras(store: Store, view: RoomView): void {
  document.body.append(createRoomCapture(() => view.capturePhoto()));
  const soundtrack = new SoundtrackPlayer(store);
  document.body.append(createSoundtrackControl(soundtrack));
}
