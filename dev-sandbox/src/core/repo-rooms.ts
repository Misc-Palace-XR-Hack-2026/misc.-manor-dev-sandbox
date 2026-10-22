// The single place rooms/*.json is loaded from. Every entry (dev sandbox, public demo, and the
// in-VR room picker) reads this list so there is only ever one repo-room loader.
export interface RepoRoomSource {
  name: string;
  data: unknown;
}

const modules = import.meta.glob('../../rooms/*.json', { eager: true, import: 'default' });

export const REPO_ROOMS: RepoRoomSource[] = Object.entries(modules)
  .map(([path, data]) => ({ name: path.split('/').pop()!.replace(/\.json$/, ''), data }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** rooms/<name>.json name -> data, as `seedRoom()` expects. */
export const REPO_ROOM_MAP: Record<string, unknown> = Object.fromEntries(
  REPO_ROOMS.map((r) => [r.name, r.data]),
);
