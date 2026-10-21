import { validSurface, validSurfaces, type SurfaceTarget, type SurfaceSelection, type SurfaceSettings } from './surfaces';
import { validPhotoData } from './photos';
import { soundtrackFromUnknown, validSoundtrack, type Soundtrack } from './soundtrack';
import { lightingFromUnknown, validLighting, type Lighting } from './appearance';
import { guessType, normalizeRef, safeUrl } from './content';
import type { BookmarkEntry } from './bookmarks';
import { DEFAULT_LAYOUT_ID, getLayout, type RoomLayout } from './layout';
import { chooseSlot } from './placement';
import {
  CONTENT_TYPES, DEFAULT_OBJECT, OBJECT_KINDS, SCHEMA_VERSION,
  type ContentItem, type ContentType, type ObjectKind, type Representation, type RoomState,
} from './types';

const KEY = 'mp-sandbox:room';
const BACKUP_KEY = 'mp-sandbox:room:backup';
const ACTIVE_KEY = 'mp-sandbox:active-room';
const MAX_HISTORY = 60;

/** Each named room saves on its own. No room id = the original single-save keys (kept for old saves and tests). */
export function roomKeys(roomId?: string): { main: string; backup: string } {
  // The public demo keeps its visitor's room under its own prefix so it never touches the dev sandbox's saves.
  const prefix = roomId?.startsWith('demo-') ? 'mp-demo:rooms' : 'mp-sandbox:rooms';
  return roomId
    ? { main: `${prefix}:${roomId}`, backup: `${prefix}:${roomId}:backup` }
    : { main: KEY, backup: BACKUP_KEY };
}

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newRoom(owner = 'Dev'): RoomState {
  return {
    schemaVersion: SCHEMA_VERSION, id: uid('room'), owner, layoutId: DEFAULT_LAYOUT_ID,
    contentItems: [], representations: [], placements: [],
  };
}

/** Returns an error message, or null if the room is safe to load. */
export function validateRoom(input: unknown): string | null {
  if (!input || typeof input !== 'object') return 'Not a room file.';
  const s = input as Partial<RoomState>;
  if (s.schemaVersion !== SCHEMA_VERSION) return `Unsupported schemaVersion: ${String(s.schemaVersion)}.`;
  if (!Array.isArray(s.contentItems) || !Array.isArray(s.representations) || !Array.isArray(s.placements)) {
    return 'Missing contentItems, representations or placements.';
  }
  if (s.surfaces !== undefined && !validSurfaces(s.surfaces)) return 'Invalid room surfaces (local PNG/JPEG only, max 1024px and 1.5 MB encoded per image).';
  if (s.lighting !== undefined && !validLighting(s.lighting)) return 'Invalid room lighting.';
  if (s.soundtrack !== undefined && !validSoundtrack(s.soundtrack)) return 'Invalid room soundtrack.';
  const legacy = (s as { appearance?: { theme?: unknown; lighting?: unknown } }).appearance;
  if (legacy !== undefined && (!legacy || !['loft', 'study'].includes(String(legacy.theme)) ||
      (legacy.lighting !== 'loft' && !validLighting(legacy.lighting)))) return 'Invalid legacy room lighting.';
  const layout = getLayout(String(s.layoutId));
  if (!layout) return `Unknown layout: ${String(s.layoutId)}.`;
  const contentIds = new Set<string>();
  for (const c of s.contentItems) {
    if (!c || typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.sourceRef !== 'string') {
      return 'A saved item is missing its id, title or sourceRef.';
    }
    if (c.lastObjectKind !== undefined && !(OBJECT_KINDS as readonly unknown[]).includes(c.lastObjectKind)) return 'Invalid last object kind.';
    if (c.notes !== undefined && (typeof c.notes !== 'string' || c.notes.length > 4000)) return 'Invalid item notes (text, max 4000 characters).';
    if (c.imageData !== undefined && (c.type !== 'image' || !validPhotoData(c.imageData))) return 'Invalid photo image data (PNG/JPEG, max 1024px and 1.5 MB encoded).';
    if (!(CONTENT_TYPES as readonly string[]).includes(c.type)) return `Unknown content type: ${String(c.type)}.`;
    if (!Array.isArray(c.tags) || c.tags.some((t) => typeof t !== 'string')) return `Item ${c.id} has bad tags.`;
    if (contentIds.has(c.id)) return `Duplicate item id ${c.id}.`;
    contentIds.add(c.id);
  }
  const repIds = new Set<string>();
  const repliedContent = new Set<string>();
  for (const r of s.representations) {
    if (!r || typeof r.id !== 'string' || repIds.has(r.id)) return 'An object is missing its id or its id is repeated.';
    if (!contentIds.has(r.contentItemId)) return `Object ${r.id} points at missing content.`;
    if (repliedContent.has(r.contentItemId)) return `Item ${r.contentItemId} has two objects.`;
    if (!(OBJECT_KINDS as readonly string[]).includes(r.objectKind)) return `Unknown object kind: ${r.objectKind}.`;
    repIds.add(r.id);
    repliedContent.add(r.contentItemId);
  }
  const slotIds = new Set(layout.slots.map((sl) => sl.id));
  const usedSlots = new Set<string>();
  const placedReps = new Set<string>();
  for (const p of s.placements) {
    if (!repIds.has(p.representationId)) return `Placement points at missing object ${p.representationId}.`;
    if (!slotIds.has(p.slotId)) return `Placement uses unknown slot ${p.slotId}.`;
    if (usedSlots.has(p.slotId)) return `Slot ${p.slotId} holds two objects.`;
    if (placedReps.has(p.representationId)) return `Object ${p.representationId} is placed twice.`;
    usedSlots.add(p.slotId);
    placedReps.add(p.representationId);
  }
  return null;
}

export function normalizeRoom(input: unknown): RoomState {
  const error = validateRoom(input);
  if (error) throw new Error(error);
  const copy = JSON.parse(JSON.stringify(input)) as RoomState & { appearance?: unknown };
  const lighting = lightingFromUnknown(copy);
  delete copy.appearance;
  if (lighting) copy.lighting = lighting;
  else delete copy.lighting;
  const soundtrack = soundtrackFromUnknown(copy);
  if (soundtrack) copy.soundtrack = soundtrack;
  else delete copy.soundtrack;
  return copy;
}

export class Store {
  state: RoomState;
  private interactionMode: 'edit' | 'preview' = 'edit';
  /** Session UI state, never part of a room save or export. */
  get mode(): 'edit' | 'preview' { return this.interactionMode; }
  get canEdit(): boolean { return this.interactionMode === 'edit'; }

  setMode(mode: 'edit' | 'preview'): void {
    if (mode === this.interactionMode) return;
    // Restore a lifted object before locking mutations; keep the inspected item.
    this.cancelPickup(null);
    this.interactionMode = mode;
    this.epoch++;
    this.emit();
  }
  selectedId: string | null = null; // representation id; never saved
  saveError: string | null = null;
  visiting: string | null = null;
  /** Which named room is open (see core/rooms.ts). Undefined = the legacy single save. */
  roomId: string | undefined;
  private homeSnapshot: string | null = null;
  private history: string[] = [];
  private listeners = new Set<() => void>();
  /** An object the user picked up from a slot and has not put down yet (never saved). */
  private pickup: { repId: string; slotId: string; depth: number } | null = null;

  /** A disposable session. Personal objects and history are retained by reference, never restored through save(). */
  private personal: { state: RoomState; roomId?: string; history: string[]; selectedId: string | null;
    pickup: Store['pickup']; visiting: string | null; homeSnapshot: string | null; saveError: string | null } | null = null;
  private practiceRooms = new Map<string, RoomState>();
  epoch = 0;
  lastCommand = '';
  get practicing(): boolean { return this.personal !== null; }
  /** Capture before any asynchronous read/decode; invalid across room and practice transitions. */
  sessionGuard(): () => boolean {
    const epoch = this.epoch;
    return () => this.canEdit && epoch === this.epoch;
  }
  beginPractice(): void {
    if (!this.canEdit) return;
    this.endPractice();
    this.personal = { state: this.state, roomId: this.roomId, history: this.history, selectedId: this.selectedId,
      pickup: this.pickup, visiting: this.visiting, homeSnapshot: this.homeSnapshot, saveError: this.saveError };
    this.epoch++;
    this.state = newRoom('Practice');
    this.history = []; this.pickup = null; this.selectedId = null;
    this.visiting = null; this.homeSnapshot = null; this.saveError = null;
    this.practiceRooms.clear();
    this.emit();
  }
  endPractice(): void {
    if (!this.personal) return;
    const personal = this.personal;
    this.personal = null;
    Object.assign(this, personal);
    this.practiceRooms.clear(); this.epoch++;
    this.emit();
  }

  constructor(initial: RoomState, roomId?: string) {
    this.state = normalizeRoom(initial);
    this.roomId = roomId;
  }

  /** Last open room id, or null on first run. */
  static activeRoomId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  }

  /** Saved display name of a room without loading it; null if it was never saved or can't be read. */
  static savedName(roomId: string): string | null {
    try {
      const raw = localStorage.getItem(roomKeys(roomId).main);
      const owner = raw ? (JSON.parse(raw) as { owner?: unknown }).owner : null;
      return typeof owner === 'string' && owner.trim() ? owner : null;
    } catch {
      return null;
    }
  }

  /** Last good local save, falling back to the backup copy. */
  static loadSaved(roomId?: string): RoomState | null {
    let failed = false;
    const keys = roomKeys(roomId);
    for (const key of [keys.main, keys.backup]) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        const parsed: unknown = JSON.parse(raw);
        if (!validateRoom(parsed)) return normalizeRoom(parsed);
        failed = true;
      } catch {
        failed = true; // try the backup, but never silently start over
      }
    }
    if (failed) throw new Error('Saved room could not be loaded. Local data has not been changed. Recover your saved JSON before starting another room.');
    return null;
  }

  /**
   * Set an unreadable saved room (and its backup) aside so the room can start from its seed again. Nothing is
   * destroyed: each raw value is first copied to `<key>:unreadable-<timestamp>`. Returns the copy keys.
   */
  static quarantineSaved(roomId: string): string[] {
    const keys = roomKeys(roomId);
    const stamp = Date.now();
    const copies: string[] = [];
    for (const key of [keys.main, keys.backup]) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const copyKey = `${key}:unreadable-${stamp}`;
      localStorage.setItem(copyKey, raw); // throws (and keeps the original) if the copy can't be written
      copies.push(copyKey);
      localStorage.removeItem(key);
    }
    return copies;
  }

  // ---- reading ----------------------------------------------------------
  get layout(): RoomLayout {
    return getLayout(this.state.layoutId)!;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  content(id: string): ContentItem | undefined {
    return this.state.contentItems.find((c) => c.id === id);
  }
  repFor(contentId: string): Representation | undefined {
    return this.state.representations.find((r) => r.contentItemId === contentId);
  }
  slotOf(repId: string): string | undefined {
    return this.state.placements.find((p) => p.representationId === repId)?.slotId;
  }
  repAt(slotId: string): string | undefined {
    return this.state.placements.find((p) => p.slotId === slotId)?.representationId;
  }
  freeSlotIds(): string[] {
    const used = new Set(this.state.placements.map((p) => p.slotId));
    return this.layout.slots.filter((s) => !used.has(s.id)).map((s) => s.id);
  }

  // ---- subscriptions ----------------------------------------------------
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  select(repId: string | null): void {
    this.cancelPickup(repId);
    this.selectedId = repId;
    this.emit();
  }

  /**
   * Pick an object up to move it. If the user then clicks somewhere that is not a slot (or presses Esc, or selects
   * something else) the object goes back where it was instead of being lost.
   */
  pickUp(repId: string): void {
    if (!this.canEdit) return;
    this.lastCommand = 'pickUp';
    const slotId = this.slotOf(repId);
    if (!slotId) {
      this.select(repId);
      return;
    }
    this.unplace(repId);
    this.pickup = { repId, slotId, depth: this.history.length };
    this.selectedId = repId;
    this.emit();
  }

  get holding(): string | null {
    return this.pickup?.repId ?? null;
  }

  private cancelPickup(next: string | null): void {
    const p = this.pickup;
    if (!p || next === p.repId) return;
    this.pickup = null;
    if (!this.state.representations.some((r) => r.id === p.repId) || this.slotOf(p.repId)) return;
    if (this.history.length === p.depth) {
      this.undo(); // nothing happened since the pick-up, so undo is an exact restore
    } else if (!this.repAt(p.slotId)) {
      this.place(p.repId, p.slotId);
    } else {
      this.commit((s) => {
        this.placeInFreeSlot(s, p.repId);
      });
    }
  }

  // ---- commands (every one is undoable) ---------------------------------
  addItem(input: { title: string; sourceRef: string; type?: ContentType | 'auto'; kind?: ObjectKind; place?: boolean }): string {
    this.lastCommand = 'addItem';
    const ref = normalizeRef(input.sourceRef.trim());
    const type = !input.type || input.type === 'auto' ? guessType(ref) : input.type;
    let repId = '';
    this.commit((s) => {
      repId = this.createItem(s, input.title.trim() || ref || 'Untitled', ref, type, [], input.kind);
      if (input.place !== false) this.placeInFreeSlot(s, repId);
    });
    return repId;
  }

  addPhoto(title: string, imageData: string): string {
    this.lastCommand = 'addPhoto';
    if (!validPhotoData(imageData)) throw new Error('Invalid photo image data (PNG/JPEG, max 1024px and 1.5 MB encoded).');
    let repId = '';
    this.commit(s => {
      repId = this.createItem(s, title.trim() || 'Local photo', '', 'image', [], 'photoFrame');
      const c = s.contentItems[s.contentItems.length - 1];
      c.sourceKind = 'file'; c.sourceRef = 'Local photo'; c.imageData = imageData;
      this.placeInFreeSlot(s, repId);
    });
    return repId;
  }

  updateContent(contentId: string, input: { title: string; sourceRef: string; imageData?: string; notes?: string }): void {
    const current = this.content(contentId);
    if (!current) throw new Error('Item no longer exists.');
    if (current.locked) throw new Error('This item is fixed: its link and text cannot be edited.');
    if (typeof input.title !== 'string' || !input.title.trim() || typeof input.sourceRef !== 'string') throw new Error('A title and content are required.');
    const sourceRef = current.type === 'note' ? input.sourceRef : current.sourceKind === 'url' ? safeUrl(input.sourceRef) : input.sourceRef.trim();
    if (sourceRef === null) throw new Error('Enter a valid http or https URL.');
    if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 4000)) throw new Error('Invalid item notes (text, max 4000 characters).');
    if (input.imageData !== undefined && (current.type !== 'image' || !validPhotoData(input.imageData))) throw new Error('Invalid photo image data.');
    this.commit(s => {
      const c = s.contentItems.find(c => c.id === contentId)!;
      c.title = input.title.trim();
      if (input.notes !== undefined) c.notes = input.notes.trim();
      c.sourceRef = sourceRef;
      if (c.type === 'note') c.sourceKind = 'note';
      if (input.imageData !== undefined) c.imageData = input.imageData;
    });
  }

  renameItem(contentId: string, title: string): void {
    const t = title.trim();
    if (!t || this.content(contentId)?.locked) return;
    this.commit((s) => {
      const c = s.contentItems.find((x) => x.id === contentId);
      if (c) c.title = t;
    });
  }

  setSurface(target: SurfaceTarget, selection: SurfaceSelection | undefined): void {
    this.lastCommand = 'setSurface';
    if (!['floor','wall','background'].includes(target) || (selection !== undefined && !validSurface(target, selection))) throw new Error('Invalid surface selection.');
    this.commit(s => {
      s.surfaces = {...s.surfaces};
      if (selection) s.surfaces[target] = {...selection};
      else delete s.surfaces[target];
      if (!Object.keys(s.surfaces).length) delete s.surfaces;
    });
  }

  setLighting(lighting: Lighting | undefined): void {
    this.lastCommand = 'setLighting';
    if (lighting !== undefined && !validLighting(lighting)) throw new Error('Invalid room lighting.');
    this.commit((s) => {
      if (lighting) s.lighting = lighting;
      else delete s.lighting;
    });
  }

  /** Apply a theme's look (floor, wall, background, lighting) in one undoable step. Content and layout are untouched. */
  applyLook(look: { surfaces?: SurfaceSettings; lighting?: Lighting }): void {
    this.lastCommand = 'applyLook';
    if (look.surfaces !== undefined && !validSurfaces(look.surfaces)) throw new Error('Invalid theme surfaces.');
    if (look.lighting !== undefined && !validLighting(look.lighting)) throw new Error('Invalid theme lighting.');
    this.commit((s) => {
      if (look.surfaces && Object.keys(look.surfaces).length) s.surfaces = JSON.parse(JSON.stringify(look.surfaces));
      else delete s.surfaces;
      if (look.lighting) s.lighting = look.lighting;
      else delete s.lighting;
    });
  }

  setSoundtrack(soundtrack: Soundtrack | undefined): void {
    if (soundtrack !== undefined && !validSoundtrack(soundtrack)) throw new Error('Invalid room soundtrack.');
    this.commit((s) => {
      if (!soundtrack || soundtrack.mode === 'follow') delete s.soundtrack;
      else s.soundtrack = soundtrack;
    });
  }

  setOwner(owner: string): void {
    this.commit((s) => {
      s.owner = owner.trim() || 'Dev';
    });
  }

  setKind(repId: string, kind: ObjectKind): void {
    this.commit((s) => {
      const r = s.representations.find((x) => x.id === repId);
      if (r) r.objectKind = kind;
    });
  }

  /** Move an object to a slot. If the slot is taken, the two swap (or the target is unplaced if source is being held). */
  place(repId: string, slotId: string): void {
    this.lastCommand = 'place';
    if (!this.layout.slots.some((sl) => sl.id === slotId)) return;
    if (this.slotOf(repId) === slotId) return;
    const wasHeld = this.pickup?.repId === repId;
    const heldFrom = this.pickup?.slotId;
    this.commit((s) => {
      const mine = s.placements.find((p) => p.representationId === repId);
      const other = s.placements.find((p) => p.slotId === slotId);

      if (other && mine) {
        // Both placed: swap their slots
        other.slotId = mine.slotId;
        mine.slotId = slotId;
      } else if (other && !mine && wasHeld && heldFrom) {
        // Held object placed on occupied slot: swap using the pickup info
        other.slotId = heldFrom;
        s.placements.push({ representationId: repId, slotId });
      } else if (other && !mine) {
        // Held object placed on occupied slot (pickup info not available): unplace target and place ours
        s.placements = s.placements.filter((p) => p !== other);
        s.placements.push({ representationId: repId, slotId });
      } else if (!other && mine) {
        // We're placed: just move to the slot
        mine.slotId = slotId;
      } else if (!other && !mine) {
        // Neither placed: place ours
        s.placements.push({ representationId: repId, slotId });
      }
    });
  }

  /** Pick an object up without losing it: it stays in the room, just not on a slot. */
  unplace(repId: string): void {
    this.commit((s) => {
      s.placements = s.placements.filter((p) => p.representationId !== repId);
    });
  }

  /** Remove the object from the room. The content stays saved in the inbox. */
  stash(repId: string): void {
    this.lastCommand = 'stash';
    this.commit((s) => {
      const rep = s.representations.find(r => r.id === repId);
      const content = rep && s.contentItems.find(c => c.id === rep.contentItemId);
      if (content) content.lastObjectKind = rep.objectKind;
      s.placements = s.placements.filter((p) => p.representationId !== repId);
      s.representations = s.representations.filter((r) => r.id !== repId);
    });
    if (this.selectedId === repId) this.selectedId = null;
    this.emit();
  }

  /** Give saved content an object again and put it somewhere free. */
  bringOut(contentId: string): void {
    this.lastCommand = 'bringOut';
    this.commit((s) => {
      const c = s.contentItems.find((x) => x.id === contentId);
      if (!c || s.representations.some((r) => r.contentItemId === contentId)) return;
      const rep = this.createRep(s, c);
      if (!this.placeInFreeSlot(s, rep.id)) s.representations = s.representations.filter((r) => r.id !== rep.id);
    });
  }

  /** Delete the content and its object for good. */
  deleteContent(contentId: string): void {
    if (this.content(contentId)?.locked) return; // fixed items can be stashed, not destroyed
    this.commit((s) => {
      const repIds = new Set(s.representations.filter((r) => r.contentItemId === contentId).map((r) => r.id));
      s.placements = s.placements.filter((p) => !repIds.has(p.representationId));
      s.representations = s.representations.filter((r) => !repIds.has(r.id));
      s.contentItems = s.contentItems.filter((c) => c.id !== contentId);
    });
    if (this.selectedId && !this.state.representations.some((r) => r.id === this.selectedId)) this.selectedId = null;
    this.emit();
  }

  /** Stub for "magic cleanup": gives inbox content default objects and fills free slots by media type. */
  autoOrganize(): number {
    let placed = 0;
    this.commit((s) => {
      // Only give inbox items objects while there is room for them; held objects already claim a future slot.
      const held = s.representations.filter((r) => !s.placements.some((p) => p.representationId === r.id)).length;
      let room = this.freeSlotsIn(s).length - held;
      for (const c of s.contentItems) {
        if (room <= 0) break;
        if (s.representations.some((r) => r.contentItemId === c.id)) continue;
        this.createRep(s, c);
        room--;
      }
      for (const r of s.representations) {
        if (!s.placements.some((p) => p.representationId === r.id) && this.placeInFreeSlot(s, r.id)) placed++;
      }
    });
    return placed;
  }

  importBookmarks(entries: BookmarkEntry[]): { added: number; placed: number } {
    const known = new Set(this.state.contentItems.map((c) => c.sourceRef));
    const fresh = entries.filter((e) => { if (known.has(e.url)) return false; known.add(e.url); return true; });
    if (!fresh.length) return { added: 0, placed: 0 };
    let placed = 0;
    this.commit((s) => {
      for (const e of fresh) {
        const type = guessType(e.url);
        const id = uid('ci');
        s.contentItems.push({
          id, type, title: e.title, sourceKind: 'url', sourceRef: e.url,
          tags: e.folder ? [e.folder] : [], createdAt: new Date().toISOString(),
        });
        if (this.freeSlotsIn(s).length > 0) {
          const rep = this.createRep(s, s.contentItems[s.contentItems.length - 1]);
          if (this.placeInFreeSlot(s, rep.id)) placed++;
        }
      }
    });
    return { added: fresh.length, placed };
  }

  /** Add picked files or folders (name or relative path only; the file itself is never copied). One undo step. */
  importFiles(entries: { title: string; ref: string }[]): { added: number; placed: number } {
    const known = new Set(this.state.contentItems.map((c) => c.sourceRef));
    const fresh = entries.filter((e) => e.ref && !known.has(e.ref)).slice(0, 200);
    let placed = 0;
    if (!fresh.length) return { added: 0, placed: 0 };
    this.commit((s) => {
      for (const e of fresh) {
        const c: ContentItem = {
          id: uid('ci'), type: guessType(e.ref), title: e.title || e.ref, sourceKind: 'file', sourceRef: e.ref,
          tags: [], createdAt: new Date().toISOString(),
        };
        s.contentItems.push(c);
        if (this.freeSlotsIn(s).length > 0) {
          const rep = this.createRep(s, c);
          if (this.placeInFreeSlot(s, rep.id)) placed++;
        }
      }
    });
    return { added: fresh.length, placed };
  }

  /**
   * Open another named room. Each room keeps its own save; a room with no save yet starts from `seed`.
   * Throws (and changes nothing) if that room's save is unreadable.
   */
  switchRoom(roomId: string, seed: unknown): void {
    this.lastCommand = 'switchRoom';
    const next = this.practicing
      ? this.practiceRooms.get(roomId) ?? newRoom(`Practice · ${roomId}`)
      : Store.loadSaved(roomId) ?? normalizeRoom(seed);
    if (this.practicing) this.practiceRooms.set(this.roomId ?? 'guest', this.state);
    this.epoch++;
    this.roomId = roomId;
    this.state = next;
    this.history = [];
    this.selectedId = null;
    this.visiting = null;
    this.homeSnapshot = null;
    this.pickup = null;
    this.saveError = null;
    try {
      if (!this.practicing) localStorage.setItem(ACTIVE_KEY, roomId);
    } catch {
      /* Remembering the last room is a convenience only. */
    }
    this.emit();
  }

  undo(): void {
    if (!this.canEdit) return;
    this.lastCommand = 'undo';
    this.pickup = null;
    const prev = this.history.pop();
    if (!prev) return;
    this.state = JSON.parse(prev) as RoomState;
    if (this.selectedId && !this.state.representations.some((r) => r.id === this.selectedId)) this.selectedId = null;
    this.changed();
  }

  // ---- import / export --------------------------------------------------
  exportJson(): string {
    return JSON.stringify(this.state, null, 2);
  }

  /** Replace the whole room. Throws a readable Error if the data is bad; nothing changes in that case. */
  replaceState(data: unknown): void {
    if (!this.canEdit) return;
    const error = validateRoom(data);
    if (error) throw new Error(error);
    this.pickup = null;
    this.pushHistory();
    this.state = normalizeRoom(data);
    this.selectedId = null;
    this.changed();
  }

  /** Visit an example/neighborhood room without writing it over the personal save. */
  visit(data: unknown, name?: string): void {
    const error = validateRoom(data);
    if (error) throw new Error(error);
    if (!this.visiting) this.homeSnapshot = JSON.stringify(this.state);
    this.pushHistory();
    this.state = normalizeRoom(data);
    this.visiting = name ?? this.state.owner;
    this.selectedId = null;
    this.emit();
  }

  returnHome(): void {
    if (!this.homeSnapshot) return;
    this.pushHistory();
    this.state = JSON.parse(this.homeSnapshot) as RoomState;
    this.homeSnapshot = null;
    this.visiting = null;
    this.selectedId = null;
    this.changed();
  }

  // ---- internals --------------------------------------------------------
  private freeSlotsIn(s: RoomState): string[] {
    const used = new Set(s.placements.map((p) => p.slotId));
    return this.layout.slots.filter((sl) => !used.has(sl.id)).map((sl) => sl.id);
  }

  private placeInFreeSlot(s: RoomState, repId: string): boolean {
    const layout = getLayout(s.layoutId) ?? this.layout;
    const rep = s.representations.find((r) => r.id === repId);
    if (!rep) return false;
    const occupied = new Set(s.placements.map((p) => p.slotId));
    const occupants = s.placements.flatMap((p) => {
      const other = s.representations.find((r) => r.id === p.representationId);
      return other ? [{ kind: other.objectKind, slotId: p.slotId }] : [];
    });
    const slot = chooseSlot(rep.objectKind, layout, occupied, occupants);
    if (!slot) return false;
    s.placements.push({ representationId: repId, slotId: slot });
    return true;
  }

  private createRep(s: RoomState, c: ContentItem, kind?: ObjectKind): Representation {
    const rep: Representation = { id: uid('rp'), contentItemId: c.id, objectKind: kind ?? c.lastObjectKind ?? DEFAULT_OBJECT[c.type] };
    s.representations.push(rep);
    return rep;
  }

  private createItem(
    s: RoomState, title: string, ref: string, type: ContentType, tags: string[], kind?: ObjectKind,
  ): string {
    if (!CONTENT_TYPES.includes(type)) type = 'link';
    const sourceKind = /^https?:\/\//i.test(ref) ? 'url' : ref ? 'file' : 'note';
    const c: ContentItem = {
      id: uid('ci'), type, title, sourceKind, sourceRef: ref, tags, createdAt: new Date().toISOString(),
    };
    s.contentItems.push(c);
    return this.createRep(s, c, kind).id;
  }

  private pushHistory(): void {
    this.history.push(JSON.stringify(this.state));
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  private commit(fn: (s: RoomState) => void): void {
    if (!this.canEdit) return;
    this.pickup = null;
    this.pushHistory();
    fn(this.state);
    this.changed();
  }

  private changed(): void {
    if (!this.visiting && !this.practicing) this.save();
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Keep the previous save as a backup before overwriting, and surface failures instead of hiding them. */
  private save(): void {
    try {
      const keys = roomKeys(this.roomId);
      const previous = localStorage.getItem(keys.main);
      if (previous) localStorage.setItem(keys.backup, previous);
      localStorage.setItem(keys.main, JSON.stringify(this.state));
      this.saveError = null;
    } catch (e) {
      this.saveError = `Could not save locally: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
