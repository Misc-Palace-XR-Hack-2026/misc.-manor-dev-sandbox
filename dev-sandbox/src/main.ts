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
let initial: RoomState | undefined;
try {
  initial = Store.loadSaved() ?? sample;
  if (!initial) throw new Error('No saved room and no rooms/sample.json found.');
} catch (error) {
  // Do not create a sample Store that could overwrite an unreadable personal save.
  const menu = document.getElementById('menu')!;
  const warning = document.createElement('p');
  warning.setAttribute('role', 'alert');
  warning.textContent = error instanceof Error ? error.message : String(error);
  menu.append(warning);
  for (const [key, label] of [['mp-sandbox:room', 'saved room'], ['mp-sandbox:room:backup', 'backup']]) {
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
  const store = new Store(initial);
  new MenuView(document.getElementById('menu')!, store, repoRooms);
  new RoomView(document.getElementById('room')!, store);

  // Handy for poking at things from the browser console while developing.
  (window as unknown as { store: Store }).store = store;
}
