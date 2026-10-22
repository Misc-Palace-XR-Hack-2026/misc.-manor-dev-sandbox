import type { Store } from '../core/store';
import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../core/types';
import { LIGHTING_PRESETS, type Lighting } from '../core/appearance';
import { ROOM_TRACKS, TRACK_LABELS, type RoomTrack } from '../core/soundtrack';
import { SURFACE_PRESETS, type SurfaceTarget } from '../core/surfaces';
import { ROOMS_PICKER_ORDER, isDemoHomeAlias, isDemoSessionRoom, openRoom, seedRoom } from '../core/rooms';
import { THEMES } from '../core/themes';
import { safeUrl } from '../core/content';
import { creationButtons, XrCreation } from './creation';
import { currentStep, progressLabel, type OnboardingState } from '../core/onboarding';

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

export function overlayIsGranted(session: { domOverlayState?: { type?: string | null } } | null | undefined): boolean {
  return Boolean(session?.domOverlayState?.type);
}

export function xrSessionInit(overlayRoot: HTMLElement): XRSessionInit {
  return {
    optionalFeatures: ['local-floor', 'dom-overlay'],
    domOverlay: { root: overlayRoot },
  };
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
  if (x >= 0.3 && x <= 1.4 && z >= 2.6 && z <= 6.2 && y > 0.4 && y < 3.0) {
    return { x, y: stairHeight(z), z };
  }
  const pad = walkableFloorPad();
  const halfW = pad.width / 2;
  const halfD = pad.depth / 2;
  if (y >= -0.2 && y <= 0.4 && x >= pad.x - halfW && x <= pad.x + halfW && z >= pad.z - halfD && z <= pad.z + halfD) {
    return { x, y: 0, z };
  }
  return null;
}

/** Analytic invisible ramp; deliberately absent from render/pick/shadow lists.
 * Left stick forward/back follows the stair run when already on it, same as walking the floor.
 * Both ends extend onto level landings. Teleport and snap turn remain available.
 */
export function stairHeight(z: number): number {
  return 2.3 * Math.max(0, Math.min(1, (5.8 - z) / 2.8));
}

export function walkStairs(p: {x:number;y:number;z:number}, stick: number, dt: number): {x:number;y:number;z:number} {
  const height = stairHeight;
  if (![p.x,p.y,p.z,stick,dt].every(Number.isFinite) || p.x < .3 || p.x > 1.1 || p.z < 2.6 || p.z > 6.2 || Math.abs(p.y-height(p.z)) > .06 || Math.abs(stick) < .2) return p;
  const z = Math.max(2.6, Math.min(6.2, p.z + stick * .65 * Math.max(0,Math.min(dt,.05))));
  return {x:p.x, y:height(z), z};
}

export function loftBeaconVisible(presenting: boolean, playerY: number): boolean {
  return presenting && playerY < 1.5;
}

/** Same-frame stick teleport: needs a walkable hover and must not run while placing. */
export function stickForwardTeleport(
  hover: { x: number; y: number; z: number } | null,
  placing: boolean,
  stickY: number,
): { x: number; y: number; z: number } | null {
  if (placing || !hover || stickY > -0.7) return null;
  return walkableAt(hover);
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

/** Object picks lose to a closer opaque room mesh (wall, loft slab, stair). Equal distance still counts as the object. */
export function objectIdFromRay(
  object: { id: string; distance: number } | null,
  occluder: { distance: number } | null,
): string | null {
  if (!object) return null;
  if (occluder && occluder.distance < object.distance) return null;
  return object.id;
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

export type PanelPage =
  | 'home'
  | 'lighting'
  | 'music'
  | 'surfaces'
  | 'object'
  | 'inbox'
  | 'rooms'
  | 'repo-rooms'
  | 'themes'
  | 'howto'
  | 'howto-create'
  | 'howto-move'
  | 'howto-rooms'
  | 'howto-style'
  | 'create'
  | 'welcome'
  | 'guide';

export interface PanelButton {
  id: string;
  label: string;
}

export interface PanelActionResult {
  page?: PanelPage;
  teleport?: { x: number; y: number; z: number };
  exit?: boolean;
  stairs?: boolean;
  openUrl?: string;
  tutorialEvent?: string;
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
  return ROOMS_PICKER_ORDER.map((slot) => ({ id: slot.id, label: slot.defaultName }));
}

/** rooms/*.json filenames are kebab-case; headset labels read as words. */
export function repoRoomLabel(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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

export function panelButtons(store: Store, page: PanelPage, rooms: NeighborhoodRoom[] = [], draft?: XrCreation, guide?: OnboardingState | null): PanelButton[] {
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
      ...ROOMS_PICKER_ORDER.map((slot) => ({
        id: 'room:' + slot.id,
        label: (store.roomId === slot.id ? '• ' : '') + slot.defaultName,
      })),
      { id: 'page:repo-rooms', label: 'Example rooms (' + rooms.length + ')' },
    ];
  }
  if (page === 'repo-rooms') {
    // The committed rooms/*.json collection, previously reachable only from the desktop
    // toolbar's <select>. Visiting one loads its items without touching the personal save.
    const buttons: PanelButton[] = [{ id: 'page:rooms', label: 'Back' }];
    if (!rooms.length) buttons.push({ id: 'rooms:none', label: 'No example rooms available' });
    for (const room of rooms) {
      buttons.push({
        id: 'visit-room:' + room.name,
        label: (store.visiting === room.name ? '• ' : '') + repoRoomLabel(room.name),
      });
    }
    if (store.visiting) buttons.push({ id: 'home:return', label: 'Return home' });
    return buttons;
  }
  if (page === 'themes') {
    return [
      { id: 'page:home', label: 'Back' },
      ...Object.entries(THEMES).map(([id, theme]) => ({ id: 'theme:' + id, label: theme.label })),
    ];
  }
  if (page === 'welcome') {
    return [
      { id: 'guide:start', label: 'Start tutorial' },
      { id: 'guide:room', label: 'Go to room' },
    ];
  }
  if (page === 'guide' && guide?.lesson) {
    const step = currentStep(guide);
    return [
      { id: 'guide:status', label: `${progressLabel(guide)} · ${step?.title ?? ''}` },
      { id: 'guide:copy', label: step?.prompt ?? '' },
      { id: 'guide:reveal', label:'Show controls' },
      { id: 'guide:skip', label: 'Skip / Exit' },
    ];
  }
  if (page === 'create' && draft) return creationButtons(draft);
  if (page === 'howto') {
    return [
      { id: 'page:home', label: 'Back' },
      { id: 'guide:bookmarks', label:'Practice: bookmarks (desktop import)' },
      { id: 'guide:create', label: 'Practice: create' },
      { id: 'guide:move', label: 'Practice: move' },
      { id: 'guide:rooms', label: 'Practice: rooms' },
      { id: 'guide:style', label: 'Practice: style' },
      { id: 'howto:create', label: 'Create an item' },
      { id: 'howto:move', label: 'Move and put away' },
      { id: 'howto:rooms', label: 'Visit rooms' },
      { id: 'howto:style', label: 'Change the look' },
      { id: 'howto:skip', label: 'Skip how-to' },
    ];
  }
  if (page.startsWith('howto-')) {
    const copy: Record<string, string> = {
      'howto-create': 'Desktop: tap + then Add object. VR: assign a kind, then place it on a pad.',
      'howto-move': 'Select an object, choose Move, then a pad. Put away sends it to Inbox. Cancel restores it.',
      'howto-rooms': 'Open Rooms, pick a saved room, then Return home. Visiting does not overwrite your save.',
      'howto-style': 'Lighting, Surfaces, and Theme change this room only. Music is independent.',
    };
    return [
      { id: 'page:howto', label: 'Back' },
      { id: 'howto:copy', label: copy[page] ?? '' },
    ];
  }
  const home: PanelButton[] = [
    { id: 'stairs:bottom', label: 'Walk stairs ↑ (left stick)' },
    { id: 'stairs:top', label: 'Walk stairs ↓ (left stick)' },
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
    { id: 'page:create', label: 'Add object' },
    { id: 'page:howto', label: 'How-to' },
    { id: 'undo', label: store.canUndo ? 'Undo' : 'Undo (nothing yet)' },
    { id: 'cancel', label: 'Cancel selection' },
  );
  if (selected) home.push({ id: 'stash:' + selected.id, label: 'Stash' });
  if (store.visiting) home.push({ id: 'home:return', label: 'Return home' });
  home.push({ id: 'page:inbox', label: 'Inbox' }, { id: 'exit', label: 'Exit VR' });
  return home;
}

export function runPanelAction(store: Store, id: string, rooms: NeighborhoodRoom[] = [], draft?: XrCreation): PanelActionResult {
  if (id === 'page:home') return { page: 'home' };
  if (id === 'page:lighting') return { page: 'lighting', tutorialEvent: 'open-style' };
  if (id === 'page:music') return { page: 'music' };
  if (id === 'page:surfaces') return { page: 'surfaces' };
  if (id === 'page:object') return { page: 'object' };
  if (id === 'page:inbox') return { page: 'inbox', tutorialEvent: 'inbox-open' };
  if (id === 'page:rooms') return { page: 'rooms', tutorialEvent:'open-rooms' };
  if (id === 'page:repo-rooms') return { page: 'repo-rooms' };
  if (id === 'rooms:none') return {};
  if (id === 'page:themes') return { page: 'themes' };
  if (id === 'page:create') return { page: 'create', tutorialEvent: 'open-add' };
  if (id === 'page:welcome') return { page: 'welcome' };
  if (id === 'guide:room') return { page: 'home', tutorialEvent: 'skip' };
  if (id === 'guide:start') return { page: 'home', tutorialEvent: 'start' };
  if (id.startsWith('guide:') && ['create','move','rooms','style','bookmarks'].includes(id.slice(6))) return { page: 'home', tutorialEvent: 'lesson:' + id.slice(6) };
  if (id === 'guide:reveal') return {page:'home'};
  if (id === 'guide:skip') return { tutorialEvent: 'skip' };
  if (id === 'page:howto' || id === 'howto:skip') return { page: id === 'howto:skip' ? 'home' : 'howto' };
  if (id === 'howto:create') return { page: 'howto-create' };
  if (id === 'howto:move') return { page: 'howto-move' };
  if (id === 'howto:rooms') return { page: 'howto-rooms' };
  if (id === 'howto:style') return { page: 'howto-style' };
  if (id === 'howto:copy') return {};
  if (id === 'stairs:bottom') return { teleport: {x:.7,y:0,z:6.2} };
  if (id === 'stairs:top') return { teleport: {x:.7,y:2.3,z:2.6} };
  if (id === 'go:loft') return { teleport: { x: 2.0, y: 2.3, z: 1.6 } };
  if (id === 'go:floor') return { teleport: spawnPosition() };
  if (id === 'create:cancel') return { page: 'home', tutorialEvent:'create-cancel' };
  if (id === 'create:done' || id === 'create:title' || id === 'create:text' || id === 'guide:status' || id === 'guide:copy') return {};
  if (draft && id.startsWith('key:')) { draft.key(id.slice(4)); return { tutorialEvent: draft.field === 'title' ? (draft.title.trim() ? 'typed-title' : '') : (draft.text.trim() ? 'typed-content' : '') }; }
  if (draft && id === 'create:field-title') { draft.field = 'title'; return {}; }
  if (draft && id === 'create:field-text') { draft.field = 'text'; return {}; }
  if (draft && id === 'create:mode') { draft.mode = draft.mode === 'link' ? 'note' : 'link'; return {}; }
  if (draft && id.startsWith('create-kind:')) { draft.kind = (id.slice(12) || '') as ObjectKind | ''; return {tutorialEvent:'kind-chosen'}; }
  if (draft && id === 'create:submit') {
    const created = draft.create(store);
    return created ? { tutorialEvent: 'created' } : {tutorialEvent:'create-invalid'};
  }
  if (id === 'exit') return { exit: true };
  if (id === 'home:return') {
    store.returnHome();
    return { page: 'home' };
  }
  if (id.startsWith('visit-room:')) {
    const name = id.slice(11);
    const room = rooms.find((r) => r.name === name);
    if (!room) return {};
    try {
      store.visit(room.data, room.name);
    } catch {
      // A malformed rooms/*.json must not leave the headset in a broken room.
      return {};
    }
    return { page: 'home', tutorialEvent: 'switched' };
  }
  if (id.startsWith('room:')) {
    const roomId = id.slice(5);
    if (isDemoHomeAlias(store.roomId, roomId)) {
      if (store.visiting) {
        store.returnHome();
        return { page: 'home', tutorialEvent: 'returned' };
      }
      return { page: 'home', tutorialEvent: 'switched' };
    }
    const repo = Object.fromEntries(rooms.map((room) => [room.name, room.data]));
    if (isDemoSessionRoom(store.roomId) && roomId !== 'guest') {
      store.visit(seedRoom(roomId, repo), roomId);
      return { page: 'home', tutorialEvent: 'switched' };
    }
    store.switchRoom(roomId, openRoom(roomId, repo));
    return { page: 'home', tutorialEvent: 'switched' };
  }
  if (id.startsWith('theme:')) {
    const theme = THEMES[id.slice(6)];
    if (theme) { store.applyLook({ surfaces: theme.surfaces, lighting: theme.lighting }); return {tutorialEvent:'theme-applied'}; }
    return {};
  }
  if (id === 'open:link') {
    const href = store.selectedId ? inspectPreview(store, store.selectedId).href : null;
    return href ? { openUrl: href, exit: true } : {};
  }
  if (id === 'move' && store.selectedId) {
    store.pickUp(store.selectedId);
    return { tutorialEvent: 'picked' };
  }
  if (id === 'undo') store.undo();
  else if (id === 'cancel') store.select(null);
  else if (id.startsWith('kind:') && store.selectedId) store.setKind(store.selectedId, id.slice(5) as ObjectKind);
  else if (id.startsWith('light:')) { store.setLighting((id.slice(6) || undefined) as Lighting | undefined); return { tutorialEvent: 'styled' }; }
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

/** Highlights actual canvas buttons; shared lesson IDs remain the single source of progression. */
export function guideActionMatches(stepId: string, action: string): boolean {
  const targets: Record<string,string[]> = {
    'create-open':['page:create'], 'create-reopen':['page:create'], 'create-invalid':['create:submit'],
    'create-title':['create:field-title','key:'], 'create-content':['create:field-text','key:'],
    'create-kind':['create-kind:'], 'create-save':['create:submit'], 'create-cancel':['create:cancel'],
    'move-pick':['move'], 'move-pick-again':['move'], 'move-cancel':['cancel'], 'move-stash':['stash:'], 'move-restore':['page:inbox','out:'],
    'rooms-open':['page:rooms'], 'rooms-switch':['room:'], 'rooms-home':['page:rooms','room:'],
    'style-open':['page:lighting'], 'style-theme':['page:themes','theme:'], 'style-change':['page:lighting','light:'],
    'style-wall':['page:surfaces','surface:wall:'], 'style-floor':['page:surfaces','surface:floor:'], 'style-background':['page:surfaces','surface:background:'],
    'style-revert':['undo'], 'import-inbox':['page:inbox'], 'import-stash':['stash:'], 'import-restore':['page:inbox','out:'], 'import-undo':['undo'],
  };
  return (targets[stepId] ?? []).some(prefix=>prefix.endsWith(':') ? action.startsWith(prefix) : action===prefix);
}
