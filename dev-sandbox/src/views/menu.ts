import { SURFACE_PRESETS, type SurfaceTarget } from '../core/surfaces';
import { ROOM_TRACKS, TRACK_LABELS, type RoomTrack, type Soundtrack } from '../core/soundtrack';
import { LIGHTING_PRESETS, type Lighting } from '../core/appearance';
import { parseBookmarksHtml } from '../core/bookmarks';
import { openContentEditor } from './content-editor';
import { preparePhoto } from './photo-upload';
import { safeUrl } from '../core/content';
import type { Store } from '../core/store';
import { CONTENT_TYPES, OBJECT_KINDS, OBJECT_LABELS, type ContentType, type ObjectKind } from '../core/types';
import { buildKindInventory } from './kind-picker';

// 2D fallback view: always works, even if the 3D room is broken. Built with DOM nodes + textContent only,
// so imported titles and URLs can never inject markup.

export interface RepoRoom {
  name: string;
  data: unknown;
  neighborhood?: boolean;
}

const MAX_ROWS = 200;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...kids);
  return node;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export class MenuView {
  private list = el('div', { class: 'list' });
  private status = el('div', { class: 'status' });
  private undoBtn = el('button', { textContent: 'Undo' });
  private ownerInput = el('input', { class: 'owner', title: 'Whose room is this?' });
  private flashMsg = '';
  private surfaceSelects = new Map<SurfaceTarget, HTMLSelectElement>();
  private lighting = el('select', { id: 'lighting-preset' });
  private soundtrack = el('select', { id: 'room-soundtrack' });
  private homeBtn = el('button', { textContent: 'Return home', hidden: true });
  private homeBtnSheet = el('button', { textContent: 'Return home', hidden: true });
  private chrome = el('nav', { class: 'chrome', ariaLabel: 'Room actions' });
  private editBtn = el('button', { type: 'button', textContent: 'Edit room' });
  private neighborhoodBtn = el('button', { type: 'button', textContent: 'Visit neighborhood' });
  private editorClose = el('button', { type: 'button', class: 'sheet-close', textContent: 'Close editor' });
  private neighborhoodClose = el('button', { type: 'button', class: 'sheet-close', textContent: 'Close neighborhood' });
  private itemClose = el('button', { type: 'button', class: 'sheet-close icon-close', textContent: '×', ariaLabel: 'Close' });
  private backdrop = el('button', { type: 'button', class: 'sheet-backdrop', hidden: true, ariaLabel: 'Close sheet' });
  private neighborhoodSheet = el('div', { class: 'sheet neighborhood-sheet', hidden: true });
  private itemSheet = el('div', { class: 'sheet item-sheet', hidden: true });
  private itemTitle = el('h2', { textContent: 'Item' });
  private itemBody = el('div', { class: 'item-body' });
  private placing = false;
  private itemKey = '';

  constructor(private root: HTMLElement, private store: Store, repoRooms: RepoRoom[]) {
    this.editorClose.addEventListener('click', () => this.closeSheets());
    this.neighborhoodClose.addEventListener('click', () => this.closeSheets());
    this.itemClose.addEventListener('click', () => {
      this.placing = false;
      this.store.select(null);
      this.closeSheets();
    });
    this.backdrop.addEventListener('click', () => {
      if (!this.itemSheet.hidden && this.store.selectedId && !this.placing) this.store.select(null);
      this.closeSheets();
    });
    this.editBtn.addEventListener('click', () => this.openEditor());
    this.neighborhoodBtn.addEventListener('click', () => this.openNeighborhood());
    this.chrome.append(this.editBtn, this.neighborhoodBtn);
    this.neighborhoodSheet.setAttribute('role', 'dialog');
    this.neighborhoodSheet.setAttribute('aria-label', 'Neighborhood');
    this.itemSheet.setAttribute('role', 'dialog');
    this.itemSheet.setAttribute('aria-label', 'Item');
    this.neighborhoodSheet.append(
      el('header', { class: 'sheet-head' }, el('h2', { textContent: 'Neighborhood' }), this.neighborhoodClose),
      el('p', { class: 'sheet-copy', textContent: 'Visit example rooms. Visiting does not overwrite your saved room.' }),
      this.homeBtnSheet,
      this.buildNeighborhoodButtons(repoRooms),
    );
    this.itemSheet.append(
      el('header', { class: 'sheet-head' }, this.itemTitle, this.itemClose),
      this.itemBody,
    );
    this.homeBtnSheet.addEventListener('click', () => {
      this.store.returnHome();
      this.flash('Back in your room.');
      this.closeSheets();
    });

    root.append(
      this.editorClose,
      el('h1', { textContent: 'Misc. Palace sandbox' }),
      this.ownerInput,
      this.buildLighting(),
      this.buildSurfaces(),
      this.buildNeighborhood(repoRooms),
      this.buildAddForm(),
      this.buildToolbar(repoRooms),
      this.status,
      this.list,
    );
    document.body.append(this.chrome, this.backdrop, this.neighborhoodSheet, this.itemSheet);
    this.ownerInput.addEventListener('change', () => store.setOwner(this.ownerInput.value));
    store.subscribe(() => this.render());
    this.render();
  }

  private overlayChrome(): boolean {
    return true;
  }

  private openEditor(): void {
    this.closeSheets();
    this.root.classList.add('sheet-open');
    this.backdrop.hidden = false;
  }

  private openNeighborhood(): void {
    this.closeSheets();
    this.neighborhoodSheet.hidden = false;
    this.backdrop.hidden = false;
  }

  private closeSheets(): void {
    this.root.classList.remove('sheet-open');
    this.neighborhoodSheet.hidden = true;
    if (!this.placing) this.itemSheet.hidden = true;
    this.backdrop.hidden = this.itemSheet.hidden && !this.root.classList.contains('sheet-open') && this.neighborhoodSheet.hidden;
  }

  private buildNeighborhoodButtons(repoRooms: RepoRoom[]): HTMLElement {
    const wrap = el('div', { class: 'neighborhood-actions' });
    for (const room of repoRooms.filter((r) => r.neighborhood)) {
      const b = el('button', { type: 'button', textContent: `Visit ${room.name.replace(/-/g, ' ')}` });
      b.addEventListener('click', () => {
        try {
          this.store.visit(room.data, room.name);
          this.flash(`Visiting ${room.name}. Return home keeps your personal save.`);
          this.closeSheets();
        } catch (e) {
          this.flash(`Could not visit ${room.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
      wrap.append(b);
    }
    return wrap;
  }

  private flash(msg: string): void {
    this.flashMsg = msg;
    this.renderStatus();
  }

  // ---- static pieces ----------------------------------------------------
  private buildLighting(): HTMLElement {
    this.lighting.append(el('option', {value:'', textContent:'Original lighting'}));
    for (const [value,p] of Object.entries(LIGHTING_PRESETS)) this.lighting.append(el('option',{value,textContent:p.label}));
    this.lighting.addEventListener('change', () => this.store.setLighting((this.lighting.value || undefined) as Lighting | undefined));
    this.soundtrack.append(el('option', {value:'follow', textContent:'Follow lighting'}));
    this.soundtrack.append(el('option', {value:'off', textContent:'No music'}));
    for (const track of ROOM_TRACKS) this.soundtrack.append(el('option', {value:track, textContent:TRACK_LABELS[track]}));
    this.soundtrack.addEventListener('change', () => {
      const value = this.soundtrack.value;
      const soundtrack: Soundtrack | undefined =
        value === 'follow' ? undefined :
        value === 'off' ? { mode: 'off' } :
        { mode: 'track', track: value as RoomTrack };
      this.store.setSoundtrack(soundtrack);
    });
    return el('section',{class:'appearance'},el('h2',{textContent:'Room atmosphere'}),
      el('label',{htmlFor:'lighting-preset',textContent:'Lighting preset'}),this.lighting,
      el('label',{htmlFor:'room-soundtrack',textContent:'Room music'}),this.soundtrack,
      el('small',{textContent:'Follow lighting uses the matching mood track, or the cozy trailer on Original lighting. Pick a track to keep it when lighting changes, or choose no music.'}));
  }

  private buildNeighborhood(repoRooms: RepoRoom[]): HTMLElement {
    const examples = repoRooms.filter((r) => r.neighborhood);
    const section = el('details', { class: 'appearance neighborhood' }, el('summary', { textContent: 'Neighborhood' }));
    section.append(el('small', { textContent: 'Visit example rooms. Each is a JSON file in rooms/ that developers can edit. Visiting does not overwrite your saved room.' }));
    this.homeBtn.addEventListener('click', () => {
      this.store.returnHome();
      this.flash('Back in your room.');
    });
    section.append(this.homeBtn);
    for (const room of examples) {
      const b = el('button', { textContent: `Visit ${room.name.replace(/-/g, ' ')}` });
      b.addEventListener('click', () => {
        try {
          this.store.visit(room.data, room.name);
          this.flash(`Visiting ${room.name}. Return home keeps your personal save.`);
        } catch (e) {
          this.flash(`Could not visit ${room.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
      section.append(b);
    }
    return section;
  }

  private buildSurfaces(): HTMLElement {
    const section = el('details', {class:'appearance surfaces'}, el('summary',{textContent:'Floor, walls & background'}));
    section.append(el('small',{textContent:'Independent finishes. Floor includes the loft; stairs and accent blocks keep their original finish.'}));
    for (const target of Object.keys(SURFACE_PRESETS) as SurfaceTarget[]) {
      const select = el('select',{id:`surface-${target}`});
      select.append(el('option',{value:'',textContent:'Original'}));
      for(const [value,label] of Object.entries(SURFACE_PRESETS[target])) select.append(el('option',{value,textContent:label}));
      select.append(el('option',{value:'custom',textContent:'Custom image',disabled:true}));
      this.surfaceSelects.set(target,select);
      const error = el('p',{class:'surface-error',hidden:true}); error.setAttribute('role','alert');
      let generation = 0;
      select.addEventListener('change',()=>{
        generation++; error.hidden=true;
        this.store.setSurface(target,select.value ? {preset:select.value} : undefined);
      });
      const upload = el('input',{type:'file',accept:'image/png,image/jpeg',id:`upload-${target}`});
      upload.addEventListener('change',async()=>{
        const file=upload.files?.[0]; if(!file)return;
        const token=++generation, state=this.store.state, snapshot=this.store.exportJson();
        upload.disabled=true;error.hidden=true;
        try {
          const imageData=await preparePhoto(file);
          // Undo/import or another edit during decode must not be overwritten by late work.
          if(token!==generation || this.store.state!==state || this.store.exportJson()!==snapshot) return;
          this.store.setSurface(target,{preset:'custom',imageData});
          if(this.store.saveError) {error.textContent='Image changed in memory only. Export your room before leaving: '+this.store.saveError;error.hidden=false;}
        } catch(e) { error.textContent=`Image not changed: ${e instanceof Error ? e.message : String(e)}`;error.hidden=false; }
        finally {upload.disabled=false;upload.value='';}
      });
      section.append(el('label',{htmlFor:select.id,textContent:`${target} preset`}),select,
        el('label',{htmlFor:upload.id,textContent:`Upload ${target} image`}),upload,error);
    }
    section.append(el('small',{textContent:'PNG / JPEG · up to 12 MB and 32 megapixels · resized to 1024 px; max 1.5 MB encoded per image. Local only, included in room exports. Floor/wall images repeat every 2 room units; backgrounds fill the view with centered cropping, not panoramic mapping. Original removes a custom image; Undo restores it.'}));
    return section;
  }

  private buildAddForm(): HTMLElement {
    const title = el('input', { placeholder: 'Title (optional)' });
    const ref = el('input', { placeholder: 'Paste a link, or a file name' });
    const type = el('select');
    type.append(el('option', { value: 'link', textContent: 'type: link' }));
    for (const t of CONTENT_TYPES.filter((value) => value !== 'link')) type.append(el('option', { value: t, textContent: t }));
    type.append(el('option', { value: 'auto', textContent: 'type: auto' }));
    const kind = el('select', { id: 'new-object-kind', class: 'kind-select' });
    kind.append(el('option', {value:'',textContent:'Automatic by content type'}));
    for (const k of OBJECT_KINDS) kind.append(el('option', {value:k,textContent:OBJECT_LABELS[k]}));
    const picker = buildKindInventory({
      value: '',
      allowEmpty: true,
      onChange: (next) => {
        kind.value = next;
        kind.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    const add = el('button', { textContent: 'Add to room' });
    const submit = () => {
      if (!ref.value.trim() && !title.value.trim()) return;
      this.store.addItem({ title: title.value, sourceRef: ref.value, type: type.value as ContentType | 'auto', kind: (kind.value || undefined) as ObjectKind | undefined });
      title.value = ref.value = '';
      ref.focus();
    };
    add.addEventListener('click', submit);
    for (const i of [title, ref]) i.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    const photo = el('input', {type:'file',accept:'image/png,image/jpeg',id:'local-photo'});
    photo.addEventListener('change',async()=>{
      const file=photo.files?.[0];if(!file)return;
      photo.disabled=true;this.flash('Preparing photo locally…');
      try {
        const data=await preparePhoto(file);
        this.store.addPhoto(title.value.trim() || file.name.replace(/\.[^.]+$/, ''), data);
        this.flash(this.store.saveError ? 'Photo added in memory only. Export your room before leaving.' : 'Photo added. Stored on this device and included in room exports.');
      } catch(e) {this.flash(`Photo not added: ${e instanceof Error ? e.message : String(e)}`);}
      finally {photo.disabled=false;photo.value='';}
    });
    return el('div', { class: 'add' }, ref, title, el('label', {htmlFor:'new-object-kind',textContent:'Object representation'}), kind, picker, el('div', { class: 'row-inline' }, type, add),
      el('label',{htmlFor:'local-photo',textContent:'Upload local photo'}),photo,
      el('small',{textContent:'PNG / JPEG · up to 12 MB · resized to 1024 px. No upload to a server.'}));
  }

  private buildToolbar(repoRooms: RepoRoom[]): HTMLElement {
    const pick = (accept: string, onFile: (text: string) => void): HTMLInputElement => {
      const input = el('input', { type: 'file', accept, hidden: true });
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        input.value = '';
        if (f) onFile(await f.text());
      });
      return input;
    };
    const roomFile = pick('.json,application/json', (text) => {
      try {
        this.store.replaceState(JSON.parse(text));
        this.flash('Room loaded. Undo brings your previous room back.');
      } catch (e) {
        this.flash(`Could not load room: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    const bookmarkFile = pick('.html,text/html', (text) => {
      const { added, placed } = this.store.importBookmarks(parseBookmarksHtml(text));
      this.flash(`Imported ${added} bookmarks (${placed} placed in the room, the rest are in the inbox).`);
    });

    const button = (label: string, fn: () => void, title = '') => {
      const b = el('button', { textContent: label, title });
      b.addEventListener('click', fn);
      return b;
    };
    this.undoBtn.addEventListener('click', () => this.store.undo());

    const repo = el('select', { title: 'Rooms committed in the repo (rooms/*.json)' });
    repo.append(el('option', { value: '', textContent: 'Load repo room...' }));
    repoRooms.forEach((r, i) => repo.append(el('option', { value: String(i), textContent: r.name })));
    repo.addEventListener('change', () => {
      const room = repoRooms[Number(repo.value)];
      repo.value = '';
      if (!room) return;
      try {
        this.store.replaceState(room.data);
        this.flash(`Loaded ${room.name}.`);
      } catch (e) {
        this.flash(`Could not load ${room.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    return el(
      'div',
      { class: 'toolbar' },
      this.undoBtn,
      button('Auto-organize', () => this.flash(`Placed ${this.store.autoOrganize()} objects.`), 'Magic cleanup (stub)'),
      button('Export room', () => download(`${this.store.state.owner.toLowerCase().replace(/\W+/g, '-')}.json`, this.store.exportJson()), 'Save a JSON file to commit under rooms/'),
      button('Import room', () => roomFile.click()),
      button('Import bookmarks', () => bookmarkFile.click(), 'Chrome / browser bookmarks export (.html)'),
      repo, roomFile, bookmarkFile,
    );
  }

  // ---- dynamic pieces ---------------------------------------------------
  private render(): void {
    const { state, selectedId } = this.store;
    if (document.activeElement !== this.ownerInput) this.ownerInput.value = state.owner;
    this.lighting.value = state.lighting ?? '';
    const soundtrack = state.soundtrack;
    this.soundtrack.value = !soundtrack || soundtrack.mode === 'follow' ? 'follow' : soundtrack.mode === 'off' ? 'off' : soundtrack.track;
    for(const [target,select] of this.surfaceSelects) select.value = state.surfaces?.[target]?.preset ?? '';
    this.undoBtn.disabled = !this.store.canUndo;
    this.homeBtn.hidden = !this.store.visiting;
    this.homeBtnSheet.hidden = !this.store.visiting;
    this.syncItemSheet(selectedId);
    this.renderStatus();

    this.list.replaceChildren();
    const rows = state.contentItems.slice(0, MAX_ROWS);
    for (const c of rows) this.list.append(this.buildRow(c.id, selectedId));
    if (state.contentItems.length > MAX_ROWS) {
      this.list.append(el('div', { class: 'more', textContent: `Showing ${MAX_ROWS} of ${state.contentItems.length}.` }));
    }
    if (rows.length === 0) this.list.append(el('div', { class: 'more', textContent: 'Nothing here yet. Add a link above.' }));
  }

  private renderStatus(): void {
    const { state, saveError } = this.store;
    const inRoom = state.representations.length;
    const placed = state.placements.length;
    const base = `${state.contentItems.length} saved, ${inRoom} in room, ${placed} placed`;
    this.status.textContent = saveError ?? (this.flashMsg ? `${this.flashMsg}  |  ${base}` : base);
    this.status.classList.toggle('error', Boolean(saveError));
  }

  private buildRow(contentId: string, selectedId: string | null, inspect = false): HTMLElement {
    const store = this.store;
    const c = store.content(contentId)!;
    const rep = store.repFor(contentId);
    const slotId = rep ? store.slotOf(rep.id) : undefined;
    const slotLabel = slotId ? store.layout.slots.find((s) => s.id === slotId)?.label : undefined;

    const title = el('span', { class: 'title', textContent: c.title, title: 'Double-click to rename' });
    title.addEventListener('dblclick', () => {
      const next = window.prompt('Rename', c.title);
      if (next) store.renameItem(c.id, next);
    });

    const href = c.sourceKind === 'url' ? safeUrl(c.sourceRef) : null;
    const meta = el('div', { class: 'meta' }, `${c.type}${c.tags.length ? ' - ' + c.tags.join(', ') : ''} - `);
    if (href) meta.append(el('a', { href, target: '_blank', rel: 'noopener noreferrer', textContent: 'open' }));
    else meta.append(c.imageData ? 'local photo · included in export' : c.sourceRef || 'note');

    const where = el('div', { class: 'where' }, rep ? (slotLabel ?? 'held: pick a spot in the room') : 'inbox (not in room)');

    const actions = el('div', { class: 'actions' });
    const act = (label: string, fn: () => void) => {
      const b = el('button', { textContent: label });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      actions.append(b);
    };
    act('Edit', () => openContentEditor(store, c.id));
    if (rep) {
      const kind = el('select', { class: 'kind-select', title: 'Which object shows this media' });
      for (const k of OBJECT_KINDS) kind.append(el('option', { value: k, textContent: OBJECT_LABELS[k], selected: k === rep.objectKind }));
      kind.addEventListener('click', (e) => e.stopPropagation());
      kind.addEventListener('change', () => store.setKind(rep.id, kind.value as ObjectKind));
      const picker = buildKindInventory({
        value: rep.objectKind,
        onChange: (next) => store.setKind(rep.id, next),
      });
      actions.append(kind, picker);
      if (slotId) act('Pick up', () => {
        this.placing = true;
        store.unplace(rep.id);
        store.select(rep.id);
      });
      act('Stash', () => store.stash(rep.id));
    } else {
      act('Bring out', () => store.bringOut(c.id));
    }
    act('Delete', () => store.deleteContent(c.id));

    const row = el('div', { class: 'row' }, title, meta, where, actions);
    row.classList.toggle('selected', Boolean(rep && rep.id === selectedId));
    row.classList.toggle('inbox', !rep);
    if (rep && !inspect) row.addEventListener('click', () => store.select(rep.id === selectedId ? null : rep.id));
    return row;
  }

  private syncItemSheet(selectedId: string | null): void {
    if (this.placing) {
      const held = selectedId ? !this.store.slotOf(selectedId) : false;
      if (!held) this.placing = false;
    }
    if (!this.overlayChrome() || !selectedId) {
      this.placing = false;
      this.itemSheet.hidden = true;
      this.itemKey = '';
      if (this.neighborhoodSheet.hidden && !this.root.classList.contains('sheet-open')) this.backdrop.hidden = true;
      return;
    }
    if (this.placing) {
      this.itemSheet.hidden = true;
      this.backdrop.hidden = true;
      return;
    }
    this.root.classList.remove('sheet-open');
    this.neighborhoodSheet.hidden = true;
    this.itemSheet.hidden = false;
    this.backdrop.hidden = true;
    const key = `${selectedId}:${this.store.exportJson()}`;
    if (key === this.itemKey) return;
    this.itemKey = key;
    const contentId = this.store.state.representations.find((r) => r.id === selectedId)?.contentItemId;
    const content = contentId ? this.store.content(contentId) : undefined;
    this.itemTitle.textContent = content?.title || 'Item';
    this.itemBody.replaceChildren();
    if (contentId) this.itemBody.append(this.buildRow(contentId, selectedId, true));
  }
}
