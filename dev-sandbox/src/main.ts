import './style.css';
import { Store, roomKeys } from './core/store';
import type { RoomState } from './core/types';
import { GUEST_ROOM_ID, isRoomId, seedRoom } from './core/rooms';
import { MenuView, type RepoRoom } from './views/menu';
import { RoomView } from './views/room';
import { SoundtrackPlayer } from './views/soundtrack';
import { createRoomCapture } from './views/room-capture';
import { createSoundtrackControl } from './views/soundtrack-control';
import { createDebugPanel } from './views/debug';

// Every rooms/*.json committed to the repo is a starter source: dev rooms seed from them, and the
// toolbar can still load any of them into the current room.
const modules = import.meta.glob('../rooms/*.json', { eager: true, import: 'default' });
const repoRooms: RepoRoom[] = Object.entries(modules).map(([path, data]) => ({
  name: path.split('/').pop()!.replace(/\.json$/, ''),
  data,
}));
const repo = Object.fromEntries(repoRooms.map((r) => [r.name, r.data]));

// Last room you were in, else the empty Guest room.
const active = Store.activeRoomId();
const roomId = active && isRoomId(active) ? active : GUEST_ROOM_ID;
let initial: RoomState | undefined;
try {
  initial = Store.loadSaved(roomId) ?? seedRoom(roomId, repo);
} catch (error) {
  // Do not create a fresh Store that could overwrite an unreadable personal save.
  const menu = document.getElementById('menu')!;
  const warning = document.createElement('p');
  warning.setAttribute('role', 'alert');
  warning.textContent = error instanceof Error ? error.message : String(error);
  menu.append(warning);
  const keys = roomKeys(roomId);
  for (const [key, label] of [[keys.main, 'saved room'], [keys.backup, 'backup']]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const link = document.createElement('a');
      link.textContent = `Download ${label}`;
      link.download = `${label.replace(' ', '-')}-recovery.json`;
      link.href = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
      menu.append(link, document.createElement('br'));
    } catch { /* Storage may be inaccessible; the warning still stays visible. */ }
  }
}

if (initial) {
  const store = new Store(initial, roomId);
  new MenuView(document.getElementById('menu')!, store, repoRooms);
  const room = new RoomView(document.getElementById('room')!, store);
  document.body.append(createRoomCapture(() => room.capturePhoto()));
  const soundtrack = new SoundtrackPlayer(store);
  document.body.append(createSoundtrackControl(soundtrack));
  if (new URLSearchParams(location.search).has('debug')) document.body.append(createDebugPanel(store, soundtrack));

  // Handy for poking at things from the browser console while developing.
  (window as unknown as { store: Store }).store = store;
}
