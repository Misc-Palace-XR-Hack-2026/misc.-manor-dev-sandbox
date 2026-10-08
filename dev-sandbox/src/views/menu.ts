import { SURFACE_PRESETS, type SurfaceTarget } from '../core/surfaces';
import { LIGHTING_PRESETS, type Lighting } from '../core/appearance';
import { parseBookmarksHtml } from '../core/bookmarks';
import { preparePhoto } from './photo-upload';
import { safeUrl } from '../core/content';
import type { Store } from '../core/store';
import { CONTENT_TYPES, OBJECT_KINDS, OBJECT_LABELS, type ContentType, type ObjectKind } from '../core/types';

// 2D fallback view: always works, even if the 3D room is broken. Built with DOM nodes + textContent only,
// so imported titles and URLs can never inject markup.

export interface RepoRoom {
  name: string;
  data: unknown;
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

  constructor(root: HTMLElement, private store: Store, repoRooms: RepoRoom[]) {
    root.append(
      el('h1', { textContent: 'Misc. Palace sandbox' }),
      this.ownerInput,
      this.buildLighting(),
      this.buildSurfaces(),
      this.buildAddForm(),
      this.buildToolbar(repoRooms),
      this.status,
      this.list,
    );
    this.ownerInput.addEventListener('change', () => store.setOwner(this.ownerInput.value));
    store.subscribe(() => this.render());
    this.render();
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
    return el('section',{class:'appearance'},el('h2',{textContent:'Room atmosphere'}),
      el('label',{htmlFor:'lighting-preset',textContent:'Lighting preset'}),this.lighting);
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
    const kind = el('select', { id: 'new-object-kind' });
    kind.append(el('option', {value:'',textContent:'Automatic by content type'}));
    for (const k of OBJECT_KINDS) kind.append(el('option', {value:k,textContent:OBJECT_LABELS[k]}));
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
    return el('div', { class: 'add' }, ref, title, el('label', {htmlFor:'new-object-kind',textContent:'Object representation'}), kind, el('div', { class: 'row-inline' }, type, add),
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
    for(const [target,select] of this.surfaceSelects) select.value = state.surfaces?.[target]?.preset ?? '';
    this.undoBtn.disabled = !this.store.canUndo;
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

  private buildRow(contentId: string, selectedId: string | null): HTMLElement {
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
    if (rep) {
      const kind = el('select', { title: 'Which object shows this media' });
      for (const k of OBJECT_KINDS) kind.append(el('option', { value: k, textContent: OBJECT_LABELS[k], selected: k === rep.objectKind }));
      kind.addEventListener('click', (e) => e.stopPropagation());
      kind.addEventListener('change', () => store.setKind(rep.id, kind.value as ObjectKind));
      actions.append(kind);
      if (slotId) act('Pick up', () => (store.unplace(rep.id), store.select(rep.id)));
      act('Stash', () => store.stash(rep.id));
    } else {
      act('Bring out', () => store.bringOut(c.id));
    }
    act('Delete', () => store.deleteContent(c.id));

    const row = el('div', { class: 'row' }, title, meta, where, actions);
    row.classList.toggle('selected', Boolean(rep && rep.id === selectedId));
    row.classList.toggle('inbox', !rep);
    if (rep) row.addEventListener('click', () => store.select(rep.id === selectedId ? null : rep.id));
    return row;
  }
}
