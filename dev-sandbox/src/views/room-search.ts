import type { CatalogRoom } from '../core/room-portal';
import { searchRooms } from '../core/room-search';
import './room-search.css';

/** Native modal keeps world gestures out while typing; content is always rendered as text. */
export function openRoomSearch(catalog: CatalogRoom[], visit: (id: string) => void, trigger: HTMLButtonElement): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'neighborhood-search';
  dialog.setAttribute('aria-label', 'Search rooms');
  const heading = document.createElement('h2'); heading.textContent = 'Search rooms';
  const input = document.createElement('input'); input.type = 'search';
  input.placeholder = 'Room name, topic, or keyword'; input.setAttribute('aria-label', 'Filter rooms');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const list = document.createElement('ul'); list.className = 'neighborhood-search-results';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.onclick = () => dialog.close();
  function render() {
    const matches = searchRooms(catalog, input.value);
    status.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'room' : 'rooms'}` : 'No rooms match. Try another keyword.';
    list.replaceChildren(...matches.map(room => {
      const row = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = room.label;
      button.onclick = () => { dialog.close(); visit(room.id); };
      row.append(button); return row;
    }));
  }
  input.oninput = render;
  dialog.addEventListener('close', () => { dialog.remove(); if (trigger.isConnected && !trigger.hidden) trigger.focus(); }, {once:true});
  dialog.append(heading, input, status, list, close); document.body.append(dialog);
  render(); dialog.showModal(); input.focus();
  return dialog;
}
