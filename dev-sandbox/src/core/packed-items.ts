import type { Store } from './store';

/** Existing inbox content, including never-represented import overflow. No schema changes. */
export const packedItems = (store: Store) => store.state.contentItems.filter(item => !store.repFor(item.id));
export type UnpackResult = 'unpacked' | 'full' | 'already' | 'missing';
export function unpackItem(store: Store, contentId: string): UnpackResult {
  if (!store.content(contentId)) return 'missing';
  if (store.repFor(contentId)) return 'already';
  store.bringOut(contentId);
  return store.repFor(contentId) ? 'unpacked' : 'full';
}
export function unpackMessage(result: UnpackResult): string {
  return result === 'unpacked' ? 'Unpacked item into the room.'
    : result === 'full' ? 'Room is full for this model. Pack an item to make space, then try Unpack again.'
    : result === 'already' ? 'This item is already in the room.' : 'This packed item is no longer available.';
}
