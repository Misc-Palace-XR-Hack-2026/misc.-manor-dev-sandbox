import { validPhotoData } from './photos';
import { lightingFromUnknown, validLighting, type Lighting } from './appearance';
import { guessType } from './content';
import type { BookmarkEntry } from './bookmarks';
import { DEFAULT_LAYOUT_ID, getLayout, type RoomLayout } from './layout';
import {
  CONTENT_TYPES, DEFAULT_OBJECT, OBJECT_KINDS, SCHEMA_VERSION,
  type ContentItem, type ContentType, type ObjectKind, type Representation, type RoomState,
} from './types';

const KEY = 'mp-sandbox:room';
const BACKUP_KEY = 'mp-sandbox:room:backup';
const MAX_HISTORY = 60;

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
  if (s.lighting !== undefined && !validLighting(s.lighting)) return 'Invalid room lighting.';
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
  return copy;
}

export class Store {
  state: RoomState;
  selectedId: string | null = null; // representation id; never saved
  saveError: string | null = null;
  private history: string[] = [];
  private listeners = new Set<() => void>();

  constructor(initial: RoomState) {
    this.state = normalizeRoom(initial);
  }

  /** Last good local save, falling back to the backup copy. */
  static loadSaved(): RoomState | null {
    let failed = false;
    for (const key of [KEY, BACKUP_KEY]) {
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
    this.selectedId = repId;
    this.emit();
  }

  // ---- commands (every one is undoable) ---------------------------------
  addItem(input: { title: string; sourceRef: string; type?: ContentType | 'auto'; kind?: ObjectKind }): string {
    const ref = input.sourceRef.trim();
    const type = !input.type || input.type === 'auto' ? guessType(ref) : input.type;
    let repId = '';
    this.commit((s) => {
      repId = this.createItem(s, input.title.trim() || ref || 'Untitled', ref, type, [], input.kind);
      this.placeInFreeSlot(s, repId);
    });
    return repId;
  }

  addPhoto(title: string, imageData: string): string {
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

  renameItem(contentId: string, title: string): void {
    const t = title.trim();
    if (!t) return;
    this.commit((s) => {
      const c = s.contentItems.find((x) => x.id === contentId);
      if (c) c.title = t;
    });
  }

  setLighting(lighting: Lighting | undefined): void {
    if (lighting !== undefined && !validLighting(lighting)) throw new Error('Invalid room lighting.');
    this.commit((s) => {
      if (lighting) s.lighting = lighting;
      else delete s.lighting;
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

  /** Move an object to a slot. If the slot is taken the two swap (or the other one is put down). */
  place(repId: string, slotId: string): void {
    if (!this.layout.slots.some((sl) => sl.id === slotId)) return;
    if (this.slotOf(repId) === slotId) return;
    this.commit((s) => {
      const mine = s.placements.find((p) => p.representationId === repId);
      const other = s.placements.find((p) => p.slotId === slotId);
      if (other) {
        if (mine) other.slotId = mine.slotId;
        else s.placements = s.placements.filter((p) => p !== other);
      }
      if (mine) mine.slotId = slotId;
      else s.placements.push({ representationId: repId, slotId });
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
    this.commit((s) => {
      s.placements = s.placements.filter((p) => p.representationId !== repId);
      s.representations = s.representations.filter((r) => r.id !== repId);
    });
    if (this.selectedId === repId) this.selectedId = null;
    this.emit();
  }

  /** Give saved content an object again and put it somewhere free. */
  bringOut(contentId: string): void {
    this.commit((s) => {
      const c = s.contentItems.find((x) => x.id === contentId);
      if (!c || s.representations.some((r) => r.contentItemId === contentId)) return;
      const rep = this.createRep(s, c);
      this.placeInFreeSlot(s, rep.id);
    });
  }

  /** Delete the content and its object for good. */
  deleteContent(contentId: string): void {
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
    const fresh = entries.filter((e) => !known.has(e.url));
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

  undo(): void {
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
    const error = validateRoom(data);
    if (error) throw new Error(error);
    this.pushHistory();
    this.state = normalizeRoom(data);
    this.selectedId = null;
    this.changed();
  }

  // ---- internals --------------------------------------------------------
  private freeSlotsIn(s: RoomState): string[] {
    const used = new Set(s.placements.map((p) => p.slotId));
    return this.layout.slots.filter((sl) => !used.has(sl.id)).map((sl) => sl.id);
  }

  private placeInFreeSlot(s: RoomState, repId: string): boolean {
    const slot = this.freeSlotsIn(s)[0];
    if (!slot) return false;
    s.placements.push({ representationId: repId, slotId: slot });
    return true;
  }

  private createRep(s: RoomState, c: ContentItem, kind?: ObjectKind): Representation {
    const rep: Representation = { id: uid('rp'), contentItemId: c.id, objectKind: kind ?? DEFAULT_OBJECT[c.type] };
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
    this.pushHistory();
    fn(this.state);
    this.changed();
  }

  private changed(): void {
    this.save();
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Keep the previous save as a backup before overwriting, and surface failures instead of hiding them. */
  private save(): void {
    try {
      const previous = localStorage.getItem(KEY);
      if (previous) localStorage.setItem(BACKUP_KEY, previous);
      localStorage.setItem(KEY, JSON.stringify(this.state));
      this.saveError = null;
    } catch (e) {
      this.saveError = `Could not save locally: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
