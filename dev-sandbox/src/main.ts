import './style.css';
import { Store } from './core/store';
import type { RoomState } from './core/types';
import { MenuView, type RepoRoom } from './views/menu';
import { RoomView } from './views/room';

// Every rooms/*.json committed to the repo shows up in the "Load repo room" dropdown.
const modules = import.meta.glob('../rooms/*.json', { eager: true, import: 'default' });
const repoRooms: RepoRoom[] = Object.entries(modules).map(([path, data]) => ({
  name: path.split('/').pop()!.replace(/\.json$/, ''),
  data,
}));

const sample = repoRooms.find((r) => r.name === 'sample')?.data as RoomState | undefined;
const initial = Store.loadSaved() ?? sample;
if (!initial) throw new Error('No saved room and no rooms/sample.json found.');

const store = new Store(JSON.parse(JSON.stringify(initial)) as RoomState);

new MenuView(document.getElementById('menu')!, store, repoRooms);
new RoomView(document.getElementById('room')!, store);

// Handy for poking at things from the browser console while developing.
(window as unknown as { store: Store }).store = store;
