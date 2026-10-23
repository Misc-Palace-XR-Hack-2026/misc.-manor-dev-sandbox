import './room-search.css';
import type { CatalogRoom } from '../core/room-portal';
import { searchRooms, searchItems } from '../core/room-search';
import type { Store } from '../core/store';
import {LinkTextCache, indexLinkTexts, type LinkText} from '../core/search-link-text';

const linkCache = new LinkTextCache();

/** Desktop room-item finder. Native XR panels/keyboard remain unchanged. */
export function openItemSearch(store: Store, trigger: HTMLButtonElement): HTMLDialogElement {
  const snapshot = store.state, epoch = store.epoch, visiting = store.visiting;
  const dialog = document.createElement('dialog'); dialog.className = 'neighborhood-search';
  dialog.setAttribute('aria-label', 'Search this room');
  const heading = document.createElement('h2'); heading.textContent = 'Search this room';
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Title, note, link text, tag, or object'; input.setAttribute('aria-label', 'Filter items');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const disclosure = document.createElement('p'); disclosure.className = 'search-link-disclosure';
  disclosure.textContent = 'Titles, notes, tags, URLs and assigned objects are searchable now. Index link text requests public pages without cookies or private notes. English MDN articles use MDN’s own Raw GitHub source; Raw GitHub text/Markdown is also supported. Wikipedia and Project Gutenberg are attempted directly and may block browser access. Other sites, redirects and private URLs remain unavailable. Cache: memory only, 15 min, up to 100k characters per page.';
  const summary = document.createElement('p'); summary.className = 'search-link-summary'; summary.setAttribute('role', 'status');
  const fetchButton = document.createElement('button'); fetchButton.type = 'button'; fetchButton.textContent = 'Index link text';
  const list = document.createElement('ul'); list.className = 'neighborhood-search-results';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.onclick = () => dialog.close();
  const controller = new AbortController();
  const sources = [...new Set(snapshot.contentItems.filter(item => item.sourceKind === 'url').map(item => item.sourceRef))];
  const links = new Map<string, LinkText>();
  for (const source of sources) { const cached = linkCache.peek(source); if (cached) links.set(source, cached); }
  const current = () => store.epoch === epoch && store.visiting === visiting && store.state === snapshot;
  let loading = false;
  function render() {
    if (!current()) { controller.abort(); dialog.close(); return; }
    const hits = searchItems(snapshot, input.value, links);
    status.textContent = hits.length ? `${hits.length} ${hits.length === 1 ? 'item' : 'items'}` : 'No items match. Unavailable link text is not searched.';
    const entries = [...links.values()];
    summary.textContent = `Link text: ${entries.filter(entry => entry.status === 'ready').length} indexed · ${entries.filter(entry => entry.status === 'stale').length} stale · ${entries.filter(entry => entry.status === 'unavailable').length} unavailable · ${sources.length - links.size} ${loading ? 'pending' : 'not indexed'}.`;
    list.replaceChildren(...hits.map(hit => {
      const row = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button';
      if (hit.representationId) button.dataset.representationId = hit.representationId;
      const title = document.createElement('strong'); title.textContent = hit.item.title || 'Untitled item';
      const model = document.createElement('span'); model.textContent = `${hit.packed ? 'Packed · ' : ''}${hit.model}`;
      const snippet = document.createElement('span'); snippet.textContent = hit.snippet;
      button.append(title, model, snippet);
      button.disabled = hit.packed;
      button.onclick = () => { if (current() && hit.representationId && store.state.representations.some(rep => rep.id === hit.representationId)) { dialog.close(); store.select(hit.representationId); } };
      row.append(button);
      if (hit.packed) { const note = document.createElement('small'); note.textContent = 'Packed item — unpack from the item pillar to select an object.'; row.append(note); }
      if (hit.item.sourceKind === 'url') {
        const coverage = document.createElement('small');
        coverage.textContent = !hit.link ? 'Link text not indexed' : hit.link.status === 'ready' ? 'Link text indexed' : `Link text ${hit.link.status}: ${hit.link.reason ?? 'Cached text is older than 15 minutes; refresh to update.'}`;
        row.append(coverage);
      }
      return row;
    }));
  }
  fetchButton.disabled = !sources.length;
  fetchButton.onclick = async () => {
    loading = true; fetchButton.disabled = true; render();
    try { await indexLinkTexts(sources, linkCache, controller.signal, (source, entry) => { if (dialog.open && current()) { links.set(source, entry); render(); } }); }
    finally { loading = false; if (dialog.open && current()) { fetchButton.disabled = false; fetchButton.textContent = 'Refresh link text'; render(); } }
  };
  input.oninput = render;
  const unsubscribe = store.subscribe(() => { if (!current()) { controller.abort(); dialog.close(); } });
  dialog.addEventListener('close', () => { controller.abort(); unsubscribe(); dialog.remove(); if (trigger.isConnected && !trigger.hidden) trigger.focus(); }, {once:true});
  // Keep typing and Escape out of global walk/edit/selection shortcuts; native cancel still closes.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });
  dialog.addEventListener('keyup', event => event.stopPropagation());
  dialog.append(heading, input, status, fetchButton, summary, disclosure, list, close); document.body.append(dialog);
  render(); dialog.showModal(); input.focus(); return dialog;
}

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
