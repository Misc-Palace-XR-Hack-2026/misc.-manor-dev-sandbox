import type { Store } from '../core/store';
import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../core/types';
import { LIGHTING_PRESETS, type Lighting } from '../core/appearance';
import { ROOM_TRACKS, TRACK_LABELS, type RoomTrack } from '../core/soundtrack';
import { SURFACE_PRESETS, type SurfaceTarget } from '../core/surfaces';
import { ROOM_DIRECTORY, seedRoom } from '../core/rooms';
import { THEMES } from '../core/themes';
import { safeUrl } from '../core/content';

export interface XrProbe {
  isSecureContext: boolean;
  xr: { isSessionSupported(mode: string): Promise<boolean> } | null;
}

export interface Landing {
  id: string;
  x: number;
  y: number;
  z: number;
  label: string;
}

export const XR_LANDINGS: Landing[] = [
  { id: 'floor-center', x: 4.2, y: 0, z: 3.4, label: 'Floor, middle' },
  { id: 'floor-front', x: 5.0, y: 0, z: 5.0, label: 'Floor, front' },
  { id: 'floor-window', x: 4.6, y: 0, z: 1.4, label: 'Floor, by the window' },
  { id: 'loft', x: 2.0, y: 2.3, z: 1.6, label: 'Loft' },
];

export function enterReason(probe: XrProbe): string {
  if (!probe.isSecureContext) return 'Enter VR needs HTTPS or localhost.';
  if (!probe.xr) return 'WebXR is not available in this browser.';
  return '';
}

export function canEnterVr(probe: XrProbe): boolean | Promise<boolean> {
  if (enterReason(probe)) return false;
  return probe.xr!.isSessionSupported('immersive-vr');
}

export function landingAt(id: string): Landing | undefined {
  return XR_LANDINGS.find((p) => p.id === id);
}

export function spawnPosition(): { x: number; y: number; z: number } {
  return { x: 4.2, y: 0, z: 3.4 };
}

/** Invisible VR walk mesh covering the cozy-loft interior (10.3 × 7.3), inset from the walls. */
export function walkableFloorPad(): { x: number; z: number; width: number; depth: number } {
  const inset = 0.3;
  const width = 10.3 - inset * 2;
  const depth = 7.3 - inset * 2;
  return { x: 10.3 / 2, z: 7.3 / 2, width, depth };
}

export function walkableAt(point: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
  const { x, y, z } = point;
  if (y >= 2.0 && y <= 3.8 && x >= 0.4 && x <= 3.6 && z >= 0.4 && z <= 2.6) return { x, y: 2.3, z };
  const pad = walkableFloorPad();
  const halfW = pad.width / 2;
  const halfD = pad.depth / 2;
  if (y >= -0.2 && y <= 0.4 && x >= pad.x - halfW && x <= pad.x + halfW && z >= pad.z - halfD && z <= pad.z + halfD) {
    return { x, y: 0, z };
  }
  return null;
}

export function loftBeaconVisible(presenting: boolean, playerY: number): boolean {
  return presenting && playerY < 1.5;
}

export function nearestLanding(point: { x: number; y: number; z: number }, max = 0.55): Landing | null {
  let best: Landing | null = null;
  let bestDist = max;
  for (const landing of XR_LANDINGS) {
    const dx = landing.x - point.x;
    const dz = landing.z - point.z;
    const dy = landing.y - point.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= bestDist) {
      best = landing;
      bestDist = dist;
    }
  }
  return best;
}

export function teleportOffset(from: { x: number; y: number; z: number }, to: Landing): { x: number; y: number; z: number } {
  return { x: from.x - to.x, y: from.y - to.y, z: from.z - to.z };
}

export function snapTurnOffset(_around: { x: number; z: number }, yaw: number): { x: number; y: number; z: number; w: number } {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export function objectHitFrom(
  objects: Array<{ id: string; throughWall: boolean }>,
  query: { throughWall: boolean },
): string | null {
  const hit = objects.find((o) => o.throughWall === query.throughWall);
  return hit && !hit.throughWall ? hit.id : null;
}

export function destinationHitFrom(
  destinations: Array<{ id: string }>,
  query: { holding: boolean },
): string | null {
  if (!query.holding) return null;
  const slot = destinations.find((d) => d.id !== 'object-volume');
  return slot?.id ?? null;
}

export function xrSelect(store: Store, hit: { kind: 'object' | 'destination' | 'cancel'; id?: string }): void {
  if (hit.kind === 'cancel') {
    store.select(null);
    return;
  }
  if (hit.kind === 'object' && hit.id) {
    store.select(hit.id);
    return;
  }
  if (hit.kind === 'destination' && hit.id && store.selectedId) {
    store.place(store.selectedId, hit.id);
    store.select(null);
  }
}

export type PanelPage = 'home' | 'lighting' | 'music' | 'surfaces' | 'object' | 'inbox' | 'rooms' | 'themes';

export interface PanelButton {
  id: string;
  label: string;
}

export interface PanelActionResult {
  page?: PanelPage;
  teleport?: { x: number; y: number; z: number };
  exit?: boolean;
  openUrl?: string;
}

export interface InspectPreview {
  title: string;
  detail: string;
  href: string | null;
}

export function inspectPreview(store: Store, repId: string): InspectPreview {
  const rep = store.state.representations.find((r) => r.id === repId);
  const content = rep ? store.content(rep.contentItemId) : undefined;
  if (!content) return { title: '', detail: '', href: null };
  const href = content.sourceKind === 'url' ? safeUrl(content.sourceRef) : null;
  return { title: content.title, detail: href ?? content.sourceRef, href };
}

export interface NeighborhoodRoom {
  name: string;
  data: unknown;
  neighborhood?: boolean;
}

export function dedicatedRooms(): Array<{ id: string; label: string }> {
  return ROOM_DIRECTORY.map((slot) => ({ id: slot.id, label: slot.defaultName }));
}

export function objectMenuAnchor(origin: { x: number; y: number; z: number }, _ray?: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } }): { x: number; y: number; z: number } {
  return { x: origin.x, y: origin.y + 0.55, z: origin.z };
}

export function objectMenuHit(
  at: { x: number; y: number; z: number },
  actions: PanelButton[],
  ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } },
): string | null {
  if (!actions.length) return null;
  const t = ray.direction.z === 0 ? 0 : (at.z - ray.origin.z) / ray.direction.z;
  if (t <= 0) return null;
  const hitX = ray.origin.x + ray.direction.x * t;
  const hitY = ray.origin.y + ray.direction.y * t;
  if (Math.abs(hitY - at.y) > 0.08) return null;
  const span = (actions.length - 1) * 0.28;
  const i = Math.round((hitX - (at.x - span / 2)) / 0.28);
  if (i < 0 || i >= actions.length) return null;
  const cx = at.x - span / 2 + i * 0.28;
  if (Math.abs(hitX - cx) > 0.14) return null;
  return actions[i].id;
}

export function objectActions(store: Store): PanelButton[] {
  const selected = store.selectedId
    ? store.state.representations.find((r) => r.id === store.selectedId)
    : undefined;
  if (!selected) return [];
  const actions: PanelButton[] = [
    { id: 'page:object', label: 'Edit' },
    { id: 'move', label: 'Move' },
    { id: 'stash:' + selected.id, label: 'Put away' },
  ];
  if (inspectPreview(store, selected.id).href) actions.push({ id: 'open:link', label: 'Open' });
  return actions;
}

export function panelButtons(store: Store, page: PanelPage, _rooms: NeighborhoodRoom[] = []): PanelButton[] {
  const selected = store.selectedId
    ? store.state.representations.find((r) => r.id === store.selectedId)
    : undefined;
  if (page === 'lighting') {
    return [
      { id: 'page:home', label: 'Back' },
      { id: 'light:', label: 'Original lighting' },
      ...Object.entries(LIGHTING_PRESETS).map(([id, preset]) => ({ id: 'light:' + id, label: preset.label })),
    ];
  }
  if (page === 'music') {
    return [
      { id: 'page:home', label: 'Back' },
      { id: 'music:follow', label: 'Follow lighting' },
      { id: 'music:off', label: 'No music' },
      ...ROOM_TRACKS.map((track) => ({ id: 'music:' + track, label: TRACK_LABELS[track] })),
    ];
  }
  if (page === 'surfaces') {
    const buttons: PanelButton[] = [{ id: 'page:home', label: 'Back' }];
    for (const [target, presets] of Object.entries(SURFACE_PRESETS) as Array<[SurfaceTarget, Record<string, string>]>) {
      buttons.push({ id: `surface:${target}:`, label: `${target}: original` });
      for (const [preset, label] of Object.entries(presets)) {
        buttons.push({ id: `surface:${target}:${preset}`, label: `${target}: ${label}` });
      }
    }
    return buttons;
  }
  if (page === 'object') {
    return [
      { id: 'page:home', label: 'Back' },
      ...OBJECT_KINDS.map((kind) => ({ id: 'kind:' + kind, label: OBJECT_LABELS[kind] })),
    ];
  }
  if (page === 'inbox') {
    const inbox = store.state.contentItems.filter((item) => !store.repFor(item.id));
    return [
      { id: 'page:home', label: 'Back' },
      ...inbox.map((item) => ({ id: 'out:' + item.id, label: `Bring out: ${item.title}` })),
    ];
  }
  if (page === 'rooms') {
    return [
      { id: 'page:home', label: 'Back' },
      ...ROOM_DIRECTORY.map((slot) => ({
        id: 'room:' + slot.id,
        label: (store.roomId === slot.id ? '• ' : '') + slot.defaultName,
      })),
    ];
  }
  if (page === 'themes') {
    return [
      { id: 'page:home', label: 'Back' },
      ...Object.entries(THEMES).map(([id, theme]) => ({ id: 'theme:' + id, label: theme.label })),
    ];
  }
  const home: PanelButton[] = [
    { id: 'go:loft', label: 'Go to loft' },
    { id: 'go:floor', label: 'Go to floor' },
  ];
  if (selected && inspectPreview(store, selected.id).href) home.push({ id: 'open:link', label: 'Open link' });
  home.push(
    { id: 'page:lighting', label: 'Lighting' },
    { id: 'page:music', label: 'Music' },
    { id: 'page:surfaces', label: 'Surfaces' },
    { id: 'page:themes', label: 'Theme' },
    { id: 'page:object', label: 'Change object' },
    { id: 'page:rooms', label: 'Rooms' },
    { id: 'undo', label: store.canUndo ? 'Undo' : 'Undo (nothing yet)' },
    { id: 'cancel', label: 'Cancel selection' },
  );
  if (selected) home.push({ id: 'stash:' + selected.id, label: 'Stash' });
  if (store.visiting) home.push({ id: 'home:return', label: 'Return home' });
  home.push({ id: 'page:inbox', label: 'Inbox' }, { id: 'exit', label: 'Exit VR' });
  return home;
}

export function runPanelAction(store: Store, id: string, rooms: NeighborhoodRoom[] = []): PanelActionResult {
  if (id === 'page:home') return { page: 'home' };
  if (id === 'page:lighting') return { page: 'lighting' };
  if (id === 'page:music') return { page: 'music' };
  if (id === 'page:surfaces') return { page: 'surfaces' };
  if (id === 'page:object') return { page: 'object' };
  if (id === 'page:inbox') return { page: 'inbox' };
  if (id === 'page:rooms') return { page: 'rooms' };
  if (id === 'page:themes') return { page: 'themes' };
  if (id === 'go:loft') return { teleport: { x: 2.0, y: 2.3, z: 1.6 } };
  if (id === 'go:floor') return { teleport: spawnPosition() };
  if (id === 'exit') return { exit: true };
  if (id === 'home:return') {
    store.returnHome();
    return { page: 'home' };
  }
  if (id.startsWith('room:')) {
    const roomId = id.slice(5);
    const repo = Object.fromEntries(rooms.map((room) => [room.name, room.data]));
    store.switchRoom(roomId, seedRoom(roomId, repo));
    return { page: 'home' };
  }
  if (id.startsWith('theme:')) {
    const theme = THEMES[id.slice(6)];
    if (theme) store.applyLook({ surfaces: theme.surfaces, lighting: theme.lighting });
    return {};
  }
  if (id === 'open:link') {
    const href = store.selectedId ? inspectPreview(store, store.selectedId).href : null;
    return href ? { openUrl: href, exit: true } : {};
  }
  if (id === 'move' && store.selectedId) {
    store.unplace(store.selectedId);
    return {};
  }
  if (id === 'undo') store.undo();
  else if (id === 'cancel') store.select(null);
  else if (id.startsWith('kind:') && store.selectedId) store.setKind(store.selectedId, id.slice(5) as ObjectKind);
  else if (id.startsWith('light:')) store.setLighting((id.slice(6) || undefined) as Lighting | undefined);
  else if (id.startsWith('stash:') && store.selectedId) store.stash(store.selectedId);
  else if (id.startsWith('out:')) store.bringOut(id.slice(4));
  else if (id.startsWith('music:')) {
    const value = id.slice(6);
    if (value === 'follow') store.setSoundtrack(undefined);
    else if (value === 'off') store.setSoundtrack({ mode: 'off' });
    else store.setSoundtrack({ mode: 'track', track: value as RoomTrack });
  } else if (id.startsWith('surface:')) {
    const [, target, preset] = id.split(':') as [string, SurfaceTarget, string];
    store.setSurface(target, preset ? { preset } : undefined);
  }
  return {};
}
