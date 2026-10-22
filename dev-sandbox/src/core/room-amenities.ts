import type { Store } from './store';
import { pickDrop, type DropItem } from './random-drop';
import { ROOM_TRACKS } from './soundtrack';

/** Shared desktop/VR portal transaction: same source pool, dedupe, capacity, persistence and undo. */
export function randomPortalDrop(store: Store, pool: ReadonlyMap<string, readonly DropItem[]>) {
  const picked = pickDrop(pool, store.state);
  return { picked, placed: store.dropIn(picked) };
}

/** Picking an initial track never starts audio or overrides an explicit choice. */
export function ensureJukeboxTrack(store: Store): void {
  if (!store.canEdit) return;
  const s = store.state.soundtrack;
  if (s && s.mode !== 'follow') return;
  store.setSoundtrack({ mode: 'track', track: ROOM_TRACKS[Math.floor(Math.random() * ROOM_TRACKS.length)] });
}
