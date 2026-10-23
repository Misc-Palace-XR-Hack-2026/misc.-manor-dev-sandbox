import type { CatalogRoom } from './room-portal';

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
