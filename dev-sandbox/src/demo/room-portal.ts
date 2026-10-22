import './room-portal.css';
import type { Store } from '../core/store';
import { roomCatalog, visitCatalogRoom, randomRoom, loadRoomJson, downloadRoom } from '../core/room-portal';


export function mountRoomPortal(
  store: Store,
  rooms: { name: string; data: unknown }[],
  customize: () => void = () => {
    document.querySelector<HTMLButtonElement>('.demo-edit-room, .chrome button[data-tutorial="style"]')?.click();
  },
  openNeighborhood: () => void = () => document.dispatchEvent(new CustomEvent('palace-neighborhood', { detail: store })),
) {
  const catalog = roomCatalog(rooms);
  const dialog = document.createElement('dialog');
  dialog.className = 'room-portal-dialog';
  dialog.setAttribute('aria-label', 'Rooms portal');
  const title = document.createElement('h2');
  title.textContent = 'Rooms';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'room-portal-actions';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  const say = (text: string) => { status.textContent = text; };
  let generation = 0;
  dialog.addEventListener('close', () => { generation++; });
  const close = () => { generation++; dialog.close(); };
  const button = (text: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = fn;
    return b;
  };
  function visit(id: string): void {
    const room = catalog.find(room => room.id === id);
    if (!room) return;
    visitCatalogRoom(store, room);
    close();
  }
  const home = button('Return to my room', () => visit('home'));
  function render(): void {
    home.hidden = !store.visiting;
    undo.disabled = !store.canUndo;

  }
  const backup = button('Save room · JSON', () => {
    downloadRoom(store);
    say('Room JSON downloaded. Includes objects, lighting and surfaces.');
  });
  const load = button('Load room · JSON', () => input.click());
  const undo = button('Undo room change', () => {
    store.undo();
    render();
    say('Restored previous room change.');
  });
  const dismiss = button('Close', close);
  const dev = document.createElement('a');
  dev.textContent = 'Dev sandbox';
  dev.href = `${import.meta.env.BASE_URL}dev/`;
  actions.append(
    button('Visit a random room', () => {
      const room = randomRoom(catalog, store.visiting);
      if (room) visit(room.id);
    }),
    backup,
    load,
    button('Neighborhood / Overworld', () => {
      close();
      openNeighborhood();
    }),
    button('Customize · lighting, walls & floors', () => { close(); customize(); }),
    home,
    dev,
    undo,
    dismiss,
  );
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const current = store.sessionGuard();
    const snapshot = store.exportJson();
    const token = generation;
    try {
      const text = await file.text();
      if (token !== generation || !dialog.open) return;
      if (!current() || store.exportJson() !== snapshot) {
        say('Room changed while reading; select the file again.');
        return;
      }
      loadRoomJson(store, text);
      render();
      say('Loaded room JSON. Undo restores the previous room. Visits never overwrite My room.');
    } catch (error) {
      if (token === generation && dialog.open) say(`Room not loaded: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  dialog.append(title, status, actions, input);
  document.body.append(dialog);
  function open(): void {
    generation++;
    dev.hidden = false;
    for (const b of actions.querySelectorAll('button')) b.hidden = false;
    render();

    say(store.visiting
      ? `Visiting ${store.state.owner} · My room is safe. Changes here are temporary.`
      : 'My room · saved locally. Export JSON for a portable backup before loading or customizing.');
    if (!dialog.open) dialog.showModal();
  }
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const point = event as MouseEvent;
    if (point.clientX < bounds.left || point.clientX > bounds.right || point.clientY < bounds.top || point.clientY > bounds.bottom) close();
  });
  return {
    open,
    close,
    get isOpen() { return dialog.open; },
    openFiles(action: 'save' | 'load', root: HTMLElement = document.body) {
      root.append(dialog);
      open();
      dev.hidden = true;
      // File forms expose only browser-capable actions, never desktop-only customization behind an XR overlay.
      for (const b of actions.querySelectorAll('button')) b.hidden = ![backup, load, undo, dismiss].includes(b);
      say(action === 'save'
        ? 'Select Save room · JSON to download with a browser gesture.'
        : 'Select Load room · JSON to choose a file. Undo restores the previous room.');
    },
  };
}
