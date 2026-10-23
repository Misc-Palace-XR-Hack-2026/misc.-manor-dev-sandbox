import type { CatalogRoom } from './room-portal';
import {OBJECT_LABELS, type ContentItem, type RoomState} from './types';
import type {LinkText} from './search-link-text';

export interface ItemSearchResult {
  item: ContentItem;
  representationId: string | null;
  model: string;
  packed: boolean;
  snippet: string;
  link?: LinkText;
}

/** Ephemeral index only: never adds fetched content to room JSON. */
export function searchItems(room: RoomState, query: string, links: ReadonlyMap<string, LinkText> = new Map()): ItemSearchResult[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return room.contentItems.flatMap(item => {
    const reps = room.representations.filter(rep => rep.contentItemId === item.id);
    const kinds = reps.length ? reps.map(rep => rep.objectKind) : item.lastObjectKind ? [item.lastObjectKind] : [];
    const model = kinds.map(kind => OBJECT_LABELS[kind]).join(', ') || 'No assigned object';
    const link = item.sourceKind === 'url' ? links.get(item.sourceRef) : undefined;
    const fields = [item.title, item.sourceRef, item.notes ?? '', ...item.tags, ...kinds, model, link?.text ?? ''];
    if (!words.every(word => normalize(fields.join(' ')).includes(word))) return [];
    const field = fields.find(text => words.some(word => normalize(text).includes(word))) ?? item.notes ?? item.sourceRef;
    const position = words.length ? Math.max(0, normalize(field).indexOf(words.find(word => normalize(field).includes(word)) ?? '')) : 0;
    const start = Math.max(0, position - 55);
    const snippet = `${start ? '…' : ''}${field.slice(start, start + 200)}${field.length > start + 200 ? '…' : ''}`;
    return [{item, representationId: reps[0]?.id ?? null, model, packed: !reps.length, snippet, link}];
  });
}

/** All keywords must match; matching ignores case, extra whitespace and accents. */
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchRooms(catalog: readonly CatalogRoom[], query: string): CatalogRoom[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return catalog.filter(room => {
    const data = room.data;
    const text = normalize([room.label, data?.owner ?? '',
      ...(data?.contentItems.flatMap(item => [item.title, item.sourceRef, item.notes ?? '', ...item.tags]) ?? []),
    ].join(' '));
    return words.every(word => text.includes(word));
  });
}
