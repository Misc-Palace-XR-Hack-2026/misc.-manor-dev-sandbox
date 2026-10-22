import { Store } from '../core/store';
import { MenuView, type RepoRoom } from '../views/menu';
import type { RoomView } from '../views/room';
import { SoundtrackPlayer } from '../views/soundtrack';
import { createRoomCapture } from '../views/room-capture';
import { createSoundtrackControl } from '../views/soundtrack-control';
import { REPO_ROOMS } from '../core/repo-rooms';

// The room's edit tools (theme, lighting, add and import objects, rooms, photo, soundtrack) for the demo. They are
// mounted only once the starter tutorial is over, so the locked tutorial shows nothing but the room. Loaded lazily.
// The sandbox's guided tutorial (Welcome card, Help replay) is left out: the demo's own tutorial is the welcome.
// TODO(demo): curate these for the demo instead of reusing the sandbox menu as is.

const repoRooms: RepoRoom[] = REPO_ROOMS;

export function mountEditTools(store: Store, view: RoomView): void {
  const menu = document.createElement('aside');
  menu.id = 'menu';
  document.body.append(menu);
  new MenuView(menu, store, repoRooms);
  // Help only replays the sandbox tutorial, which the demo doesn't have.
  document.querySelector('.chrome button[title="Replay tutorial"]')?.remove();
  document.body.append(createRoomCapture(() => view.capturePhoto()));
  const soundtrack = new SoundtrackPlayer(store);
  document.body.append(createSoundtrackControl(soundtrack));
}
