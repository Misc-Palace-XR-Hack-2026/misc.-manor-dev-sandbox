import { Store } from '../core/store';
import { MenuView, type RepoRoom } from '../views/menu';
import type { RoomView } from '../views/room';
import { SoundtrackPlayer } from '../views/soundtrack';
import { createRoomCapture } from '../views/room-capture';
import { createSoundtrackControl } from '../views/soundtrack-control';
import { TutorialView } from '../views/tutorial';
import { REPO_ROOMS } from '../core/repo-rooms';

// The room's edit tools (theme, lighting, add and import objects, rooms, photo, soundtrack) for the demo. They are
// mounted only once the starter tutorial is over, so the locked tutorial shows nothing but the room. Loaded lazily.
// TODO(demo): curate these for the demo instead of reusing the sandbox menu as is.

const repoRooms: RepoRoom[] = REPO_ROOMS;

export function mountEditTools(store: Store, view: RoomView): void {
  const menu = document.createElement('aside');
  menu.id = 'menu';
  document.body.append(menu);
  (window as unknown as { tutorial: TutorialView }).tutorial = new TutorialView(store);
  new MenuView(menu, store, repoRooms);
  document.body.append(createRoomCapture(() => view.capturePhoto()));
  const soundtrack = new SoundtrackPlayer(store);
  document.body.append(createSoundtrackControl(soundtrack));
}
