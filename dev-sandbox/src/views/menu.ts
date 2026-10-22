import { SURFACE_PRESETS, type SurfaceTarget } from '../core/surfaces';
import { ROOM_TRACKS, TRACK_LABELS, type RoomTrack, type Soundtrack } from '../core/soundtrack';
import { LIGHTING_PRESETS, type Lighting } from '../core/appearance';
import { parseBookmarksHtml } from '../core/bookmarks';
import { openContentEditor } from './content-editor';
import { preparePhoto } from './photo-upload';
import { previewOpenUrl } from '../core/preview';
import { SHOW_PREVIEW_BUTTON } from '../core/demo-flags';
import { safeUrl } from '../core/content';
import { Store } from '../core/store';
import { ROOM_DIRECTORY, openRoom, seedRoom } from '../core/rooms';
import { THEMES } from '../core/themes';
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
  private theme = el('select', { id: 'room-theme' });
  private chrome = el('nav', { class: 'chrome', ariaLabel: 'Room actions' });
  private previewBtn = el('button', { type: 'button', textContent: 'Preview' });
  private modeNote = el('p', { class: 'mode-note', hidden: true, textContent: 'Preview · desktop/mobile only. Return to Edit room for VR.' });
  private lastMode: Store['mode'] = 'edit';
  private editGeneration = 0;
  private editBtn = el('button', { type: 'button', textContent: 'Edit room' });
  private roomsBtn = el('button', { type: 'button', textContent: 'Rooms', title: 'Switch room' });
  private helpBtn = el('button', { type: 'button', textContent: 'Help', title: 'Replay tutorial' });
  private editorClose = el('button', { type: 'button', class: 'sheet-close', textContent: 'Close editor' });
  private itemClose = el('button', { type: 'button', class: 'sheet-close icon-close', textContent: '×', ariaLabel: 'Close' });
  private backdrop = el('button', { type: 'button', class: 'sheet-backdrop', hidden: true, ariaLabel: 'Close sheet' });
  private roomsSheet = el('div', { class: 'sheet dialog-sheet', hidden: true });
  private addSheet = el('div', { class: 'sheet dialog-sheet', hidden: true });
  private importSheet = el('div', { class: 'sheet dialog-sheet', hidden: true });
  private roomList = el('div', { class: 'neighborhood-actions' });
  private fab = el('button', { type: 'button', class: 'fab', textContent: '+', ariaLabel: 'Add to room', title: 'Add to room' });
  private fabMenu = el('div', { class: 'fab-menu', hidden: true });
  private repo: Record<string, unknown>;
  private itemSheet = el('div', { class: 'sheet item-sheet', hidden: true });
  private itemTitle = el('h2', { textContent: 'Item' });
  private itemBody = el('div', { class: 'item-body' });
  private placing = false;
  private sheetVersion = 0;
  private inputGuard(): () => boolean {
    const current = this.store.sessionGuard(), version = this.sheetVersion;
    return () => current() && version === this.sheetVersion;
  }
  private itemKey = '';

  constructor(private root: HTMLElement, private store: Store, repoRooms: RepoRoom[]) {
    this.repo = Object.fromEntries(repoRooms.map((r) => [r.name, r.data]));
    this.editorClose.addEventListener('click', () => this.closeSheets());
    this.itemClose.addEventListener('click', () => {
      this.placing = false;
      this.store.select(null);
      this.closeSheets();
    });
    this.backdrop.addEventListener('click', () => {
      if (!this.itemSheet.hidden && this.store.selectedId && !this.placing) this.store.select(null);
      this.closeSheets();
    });
    this.previewBtn.addEventListener('click', () => store.setMode('preview'));
    this.editBtn.addEventListener('click', () => {
      store.setMode('edit');
      store.select(null);
      this.openEditor();
      document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'open-style' }));
    });
    this.editBtn.dataset.tutorial = 'edit-room';
    this.roomsBtn.addEventListener('click', () => {
      this.refreshRooms();
      this.openDialog(this.roomsSheet);
      document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'open-rooms' }));
    });
    this.roomsBtn.dataset.tutorial = 'rooms';
    this.helpBtn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'replay' })));
    this.editBtn.dataset.tutorial = 'style';
    const cancelMove = el('button',{type:'button',textContent:'Cancel move', hidden:true});
    cancelMove.dataset.tutorial='cancel-move';
    cancelMove.addEventListener('click',()=>store.select(null));
    store.subscribe(()=>{ cancelMove.hidden=!store.holding; });
    this.chrome.append(this.editBtn, this.previewBtn, this.roomsBtn, this.helpBtn, cancelMove);
    // Demo day: the Preview entry points are hidden (see SHOW_PREVIEW_BUTTON). Preview mode still works.
    if (!SHOW_PREVIEW_BUTTON) this.previewBtn.remove();
    this.itemSheet.setAttribute('role', 'dialog');
    this.itemSheet.setAttribute('aria-label', 'Item');
    this.itemSheet.append(
      el('header', { class: 'sheet-head' }, this.itemTitle, this.itemClose),
      this.itemBody,
    );
    this.fillDialog(this.roomsSheet, 'Rooms',
      el('p', { class: 'sheet-copy', textContent: 'Each room saves on its own in this browser. My room starts empty.' }),
      this.roomList);
    this.fillDialog(this.addSheet, 'Add object', this.buildAddForm());
    this.fillDialog(this.importSheet, 'Import', this.buildImport());
    this.buildFab();

    const previewFromEditor = el('button', { type: 'button', textContent: 'Preview room' });
    previewFromEditor.addEventListener('click', () => store.setMode('preview'));
    if (!SHOW_PREVIEW_BUTTON) previewFromEditor.hidden = true;
    root.append(
      this.editorClose, previewFromEditor,
      el('h1', { textContent: 'Misc. Manor' }),
      this.ownerInput,
      this.buildLighting(),
      this.buildSurfaces(),
      this.buildToolbar(repoRooms),
      this.status,
      this.list,
    );
    document.body.append(this.chrome, this.modeNote, this.fab, this.fabMenu, this.backdrop, this.roomsSheet, this.addSheet, this.importSheet, this.itemSheet);
    this.ownerInput.title = 'Room name';
    this.ownerInput.addEventListener('change', () => store.setOwner(this.ownerInput.value));
    let epoch = store.epoch;
    store.subscribe(() => {
      if (epoch !== store.epoch) { epoch = store.epoch; this.closeSheets();
        for (const input of this.addSheet.querySelectorAll('input')) input.value = '';
      }
      this.render();
    });
    document.addEventListener('palace-reveal', event => {
      const target = (event as CustomEvent<string>).detail;
      if (target === 'import') this.openDialog(this.importSheet);
      else if (target === 'add') { this.openDialog(this.addSheet); document.dispatchEvent(new CustomEvent('palace-tutorial',{detail:'open-add'})); }
      else if (target === 'rooms') { this.refreshRooms(); this.openDialog(this.roomsSheet); document.dispatchEvent(new CustomEvent('palace-tutorial',{detail:'open-rooms'})); }
      else if (target === 'close') this.closeSheets();
      else {
        this.store.select(null); this.openEditor();
        const details = this.root.querySelector('details'); if (details) details.open = true;
        document.dispatchEvent(new CustomEvent('palace-tutorial', {detail:'open-style'}));
        if (this.store.state.contentItems.some(c=>!this.store.repFor(c.id))) document.dispatchEvent(new CustomEvent('palace-tutorial', {detail:'inbox-open'}));
      }
    });
    this.render();
  }

  private dialogs(): HTMLElement[] {
    return [this.roomsSheet, this.addSheet, this.importSheet];
  }

  private fillDialog(sheet: HTMLElement, title: string, ...body: Node[]): void {
    const close = el('button', { type: 'button', class: 'sheet-close', textContent: 'Close' });
    close.addEventListener('click', () => this.closeSheets());
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', title);
    sheet.append(el('header', { class: 'sheet-head' }, el('h2', { textContent: title }), close), ...body);
  }

  private openDialog(sheet: HTMLElement): void {
    if (sheet !== this.roomsSheet && !this.store.canEdit) return;
    this.closeSheets();
    sheet.hidden = false;
    this.backdrop.hidden = false;
  }

  private openEditor(): void {
    if (!this.store.canEdit) return;
    this.closeSheets();
    this.root.classList.add('sheet-open');
    this.backdrop.hidden = false;
  }

  private closeSheets(): void {
    this.sheetVersion++;
    if (!this.addSheet.hidden) {
      for (const input of this.addSheet.querySelectorAll('input')) input.value = '';
      document.dispatchEvent(new CustomEvent('palace-tutorial',{detail:'create-cancel'}));
    }
    this.root.classList.remove('sheet-open');
    for (const d of this.dialogs()) d.hidden = true;
    this.fabMenu.hidden = true;
    if (!this.placing) this.itemSheet.hidden = true;
    this.backdrop.hidden = this.itemSheet.hidden && !this.root.classList.contains('sheet-open');
  }

  private anyDialogOpen(): boolean {
    return this.dialogs().some((d) => !d.hidden);
  }

  // ---- rooms ------------------------------------------------------------
  /** Rebuilt on open (not every render) because reading other rooms' names touches localStorage. */
  private refreshRooms(): void {
    const current = this.store.roomId;
    this.roomList.replaceChildren(...ROOM_DIRECTORY.map((slot) => {
      const label = this.store.practicing ? `Practice · ${slot.defaultName}` : slot.id === current ? this.store.state.owner : (Store.savedName(slot.id) ?? slot.defaultName);
      const b = el('button', { type: 'button', textContent: label });
      b.setAttribute('aria-current', String(slot.id === current));
      b.dataset.tutorial = 'room-pick';
      b.dataset.roomId = slot.id;
      b.addEventListener('click', () => this.switchTo(slot.id, label));
      return b;
    }));
  }

  private switchTo(id: string, label: string): void {
    if (id === this.store.roomId) { this.closeSheets(); return; }
    try {
      // openRoom() refreshes a stale showcase save (backing the old one up) before the store reads it.
      this.store.switchRoom(id, openRoom(id, this.repo));
      document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'switched' }));
      this.flash(`Switched to ${label}.`);
      this.closeSheets();
    } catch (e) {
      // An unreadable saved copy would otherwise lock this room out for good. Set it aside (kept under an
      // `unreadable-` key, never deleted) and open the room from its seed instead.
      if (e instanceof Error && /could not be loaded/i.test(e.message)) {
        try {
          const kept = Store.quarantineSaved(id);
          this.store.switchRoom(id, seedRoom(id, this.repo));
          document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'switched' }));
          this.flash(`${label}'s saved copy was unreadable, so it was reset. The old data is kept at ${kept.join(', ') || 'no key'}.`);
          this.closeSheets();
          return;
        } catch (retry) {
          e = retry;
        }
      }
      this.flash(`Could not open ${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---- + button ---------------------------------------------------------
  private buildFab(): void {
    const item = (label: string, fn: () => void) => {
      const b = el('button', { type: 'button', textContent: label });
      if (label === 'Add object') b.dataset.tutorial = 'open-add';
      b.addEventListener('click', fn);
      return b;
    };
    this.fabMenu.append(
      item('Add object', () => { this.openDialog(this.addSheet); document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'open-add' })); }),
      item('Import from bookmarks / files', () => { this.openDialog(this.importSheet); }),
    );
    this.fab.dataset.tutorial = 'add-object';
    this.fab.addEventListener('click', () => {
      if (!this.store.canEdit) return;
      const open = this.fabMenu.hidden;
      this.closeSheets();
      this.fabMenu.hidden = !open;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.fabMenu.hidden || this.anyDialogOpen()) this.closeSheets();
    });
  }

  private buildImport(): HTMLElement {
    const input = (accept: string, multiple: boolean, folder: boolean, onFiles: (files: File[]) => void) => {
      const i = el('input', { type: 'file', accept, multiple, hidden: true });
      if (folder) i.setAttribute('webkitdirectory', '');
      i.addEventListener('change', () => {
        const files = Array.from(i.files ?? []);
        i.value = '';
        if (files.length) onFiles(files);
      });
      return i;
    };
    const entries = (files: File[]) => files
      .filter((f) => !f.name.startsWith('.'))
      .map((f) => ({ title: f.name.replace(/\.[^.]+$/, ''), ref: f.webkitRelativePath || f.name }));
    const done = (msg: string) => { this.flash(msg); this.closeSheets(); };

    const bookmarks = input('.html,text/html', false, false, async ([file]) => {
      const current = this.inputGuard();
      try {
        const text = await file.text();
        if (!current()) return;
        const entries = parseBookmarksHtml(text);
        const { added, placed } = this.store.importBookmarks(entries);
        done(`Imported ${added} bookmarks (${placed} placed, ${added - placed} in inbox).`);
        document.dispatchEvent(new CustomEvent('palace-import', {detail:{entries, added, placed}}));
      } catch (e) {
        this.flash(`Could not import bookmarks: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    const files = input('', true, false, (list) => {
      const { added, placed } = this.store.importFiles(entries(list));
      done(`Added ${added} files by name (${placed} placed in the room, the rest are in the inbox).`);
    });
    const folder = input('', true, true, (list) => {
      const { added, placed } = this.store.importFiles(entries(list));
      done(`Added ${added} files from the folder by name (${placed} placed, the rest in the inbox).`);
    });
    const button = (label: string, target: HTMLInputElement) => {
      const b = el('button', { type: 'button', textContent: label });
      if (target === bookmarks) b.dataset.tutorial = 'bookmark-file';
      b.addEventListener('click', () => target.click());
      return b;
    };
    return el('div', { class: 'neighborhood-actions' },
      button('Bookmarks file (.html)', bookmarks),
      button('Files…', files),
      button('Folder…', folder),
      el('small', { class: 'sheet-copy', textContent: 'Files and folders are saved by name only (browsers hide real paths), up to 200 at a time, and nothing is uploaded. Opening the original file is a later step.' }),
      bookmarks, files, folder);
  }

  private flash(msg: string): void {
    this.flashMsg = msg;
    this.renderStatus();
  }

  // ---- static pieces ----------------------------------------------------
  private buildLighting(): HTMLElement {
    this.lighting.append(el('option', {value:'', textContent:'Original lighting'}));
    for (const [value,p] of Object.entries(LIGHTING_PRESETS)) this.lighting.append(el('option',{value,textContent:p.label}));
    this.lighting.id = 'lighting-preset';
    this.lighting.dataset.tutorial = 'style-choice';
    this.lighting.addEventListener('change', () => {
      this.store.setLighting((this.lighting.value || undefined) as Lighting | undefined);
      document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'styled' }));
    });
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
    this.theme.append(el('option', {value:'', textContent:'Apply a theme…'}));
    for (const [value,t] of Object.entries(THEMES)) this.theme.append(el('option',{value,textContent:t.label}));
    this.theme.addEventListener('change', () => {
      const t = THEMES[this.theme.value];
      this.theme.value = '';
      if (t) { this.store.applyLook({ surfaces: t.surfaces, lighting: t.lighting }); document.dispatchEvent(new CustomEvent('palace-tutorial',{detail:'theme-applied'})); this.flash(`Applied ${t.label}. Undo brings the old look back.`); }
    });
    return el('section',{class:'appearance'},el('h2',{textContent:'Room atmosphere'}),
      el('label',{htmlFor:'room-theme',textContent:'Theme (floor, wall, background, lighting)'}),this.theme,
      el('label',{htmlFor:'lighting-preset',textContent:'Lighting preset'}),this.lighting,
      el('label',{htmlFor:'room-soundtrack',textContent:'Room music'}),this.soundtrack,
      el('small',{textContent:'Follow lighting uses the matching mood track, or the cozy trailer on Original lighting. Pick a track to keep it when lighting changes, or choose no music.'}));
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
        const current = this.inputGuard();
        const token=++generation, state=this.store.state, snapshot=this.store.exportJson();
        upload.disabled=true;error.hidden=true;
        try {
          const imageData=await preparePhoto(file);
          // Undo/import or another edit during decode must not be overwritten by late work.
          if(!current() || token!==generation || this.store.state!==state || this.store.exportJson()!==snapshot) return;
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
    const title = el('input', { placeholder: 'Title (required)', id: 'new-object-title' });
    const ref = el('input', { placeholder: 'Paste a link, or a file name', id: 'new-object-ref' });
    const type = el('select', {id:'new-object-type', ariaLabel:'Content type'});
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
    add.dataset.tutorial = 'add-submit';
    const notify = (detail:string) => document.dispatchEvent(new CustomEvent('palace-tutorial',{detail}));
    kind.addEventListener('change',()=>notify('kind-chosen'));
    const valid = () => Boolean(title.value.trim() && ref.value.trim() && (type.value !== 'link' || safeUrl(ref.value.trim())));
    const submit = () => {
      if (!valid()) { this.flash('Enter a title and content; links require a valid http or https URL.'); notify('create-invalid'); return; }
      const id = this.store.addItem({ title: title.value, sourceRef: ref.value, type: type.value as ContentType | 'auto', kind: (kind.value || undefined) as ObjectKind | undefined });
      if (this.store.practicing && this.store.slotOf(id)) this.store.pickUp(id);
      title.value = ref.value = '';
      this.flash('Added to the room.');
      this.closeSheets();
      document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'created' }));
    };
    title.addEventListener('input', () => { if(title.value.trim()) notify('typed-title'); });
    ref.addEventListener('input', () => { if(valid()) notify('typed-content'); });
    add.addEventListener('click', submit);
    for (const i of [title, ref]) i.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    const photo = el('input', {type:'file',accept:'image/png,image/jpeg',id:'local-photo'});
    photo.addEventListener('change',async()=>{
      const file=photo.files?.[0];if(!file)return;
      const current = this.inputGuard();
      photo.disabled=true;this.flash('Preparing photo locally…');
      try {
        const data=await preparePhoto(file);
        if (!current()) return;
        this.store.addPhoto(title.value.trim() || file.name.replace(/\.[^.]+$/, ''), data);
        this.flash(this.store.saveError ? 'Photo added in memory only. Export your room before leaving.' : 'Photo added. Stored on this device and included in room exports.');
        this.closeSheets();
      } catch(e) {this.flash(`Photo not added: ${e instanceof Error ? e.message : String(e)}`);}
      finally {photo.disabled=false;photo.value='';}
    });
    const cancel = el('button',{type:'button',textContent:'Cancel'}); cancel.dataset.tutorial='create-cancel'; cancel.addEventListener('click',()=>this.closeSheets());
    return el('div', { class: 'add' }, cancel, ref, title, el('label', {htmlFor:'new-object-kind',textContent:'Object representation'}), kind, picker, el('div', { class: 'row-inline' }, type, add),
      el('label',{htmlFor:'local-photo',textContent:'Upload local photo'}),photo,
      el('small',{textContent:'PNG / JPEG · up to 12 MB · resized to 1024 px. No upload to a server.'}));
  }

  private buildToolbar(repoRooms: RepoRoom[]): HTMLElement {
    const pick = (accept: string, onFile: (text: string) => void): HTMLInputElement => {
      const input = el('input', { type: 'file', accept, hidden: true });
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        input.value = '';
        const current = this.inputGuard();
        if (f) { const text = await f.text(); if (current()) onFile(text); }
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

    const button = (label: string, fn: () => void, title = '') => {
      const b = el('button', { textContent: label, title });
      b.addEventListener('click', fn);
      return b;
    };
    this.undoBtn.dataset.tutorial = 'undo';
    this.undoBtn.addEventListener('click', () => this.store.undo());

    const repo = el('select', { title: 'Rooms committed in the repo (rooms/*.json)' });
    repo.append(el('option', { value: '', textContent: 'Load repo room...' }));
    repoRooms.forEach((r, i) => repo.append(el('option', { value: String(i), textContent: r.name })));
    repo.addEventListener('change', () => {
      const room = repoRooms[Number(repo.value)];
      repo.value = '';
      if (!room) return;
      try {
        this.store.visit(room.data, room.name);
        this.flash(`Opened ${room.name} as a visit. Use Return home to get back to your saved room.`);
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
      repo, roomFile,
    );
  }

  // ---- dynamic pieces ---------------------------------------------------
  private render(): void {
    const { state, selectedId, canEdit, mode } = this.store;
    if (mode !== this.lastMode) {
      this.editGeneration++;
      this.closeSheets();
      this.lastMode = mode;
    }
    this.root.inert = !canEdit;
    this.fab.hidden = !canEdit;
    this.helpBtn.hidden = !canEdit;
    this.previewBtn.hidden = !canEdit || !SHOW_PREVIEW_BUTTON;
    this.modeNote.hidden = canEdit;
    this.editBtn.title = canEdit ? 'Open room editor' : 'Leave Preview and edit this room';
    if (document.activeElement !== this.ownerInput) this.ownerInput.value = state.owner;
    this.lighting.value = state.lighting ?? '';
    const soundtrack = state.soundtrack;
    this.soundtrack.value = !soundtrack || soundtrack.mode === 'follow' ? 'follow' : soundtrack.mode === 'off' ? 'off' : soundtrack.track;
    for(const [target,select] of this.surfaceSelects) select.value = state.surfaces?.[target]?.preset ?? '';
    this.undoBtn.disabled = !this.store.canUndo;
    this.roomsBtn.textContent = state.owner || 'Rooms';
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

    const renameable = !c.locked && store.canEdit;
    const title = el('span', { class: 'title', textContent: c.title, title: renameable ? 'Double-click to rename' : '' });
    if (renameable) title.addEventListener('dblclick', () => {
      const next = window.prompt('Rename', c.title);
      if (next) store.renameItem(c.id, next);
    });

    const href = c.sourceKind === 'url' ? previewOpenUrl(c.sourceRef) : null;
    const meta = el('div', { class: 'meta' }, `${c.type}${c.tags.length ? ' - ' + c.tags.join(', ') : ''} - `);
    if (href) meta.append(el('a', { href, target: '_blank', rel: 'noopener noreferrer', textContent: 'open' }));
    else meta.append(c.imageData ? 'local photo · included in export' : c.sourceRef || 'note');

    const where = el('div', { class: 'where' }, rep ? (slotLabel ?? 'held: pick a spot in the room') : 'inbox (not in room)');

    const actions = el('div', { class: 'actions' });
    const act = (label: string, fn: () => void) => {
      const b = el('button', { textContent: label });
      b.dataset.action = label.toLowerCase().replace(/ /g, '-');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      actions.append(b);
    };
    // Preview hides every mutation control; `locked` repo content stays non-editable in Edit too.
    if (store.canEdit) {
      if (!c.locked) act('Edit', () => openContentEditor(store, c.id));
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
          // pickUp remembers the spot, so a missed click or Esc puts it back instead of losing it.
          this.placing = true;
          store.pickUp(rep.id);
          this.closeSheets();
        });
        act('Stash', () => store.stash(rep.id));
      } else {
        act('Bring out', () => store.bringOut(c.id));
      }
      if (!c.locked) act('Delete', () => store.deleteContent(c.id));
    }

    const row = el('div', { class: 'row' }, title, meta, where, actions);
    row.dataset.contentId = contentId;
    if (rep) row.dataset.repId = rep.id;
    row.classList.toggle('selected', Boolean(rep && rep.id === selectedId));
    row.classList.toggle('inbox', !rep);
    if (rep && !inspect) row.addEventListener('click', () => store.select(rep.id === selectedId ? null : rep.id));
    return row;
  }

  private syncItemSheet(selectedId: string | null): void {
    // Placing = the object is in hand (store.holding), however it got there, so the sheet stays out of the way.
    this.placing = selectedId !== null && this.store.holding === selectedId;
    if (!selectedId) {
      this.placing = false;
      this.itemSheet.hidden = true;
      this.itemKey = '';
      if (!this.anyDialogOpen() && !this.root.classList.contains('sheet-open')) this.backdrop.hidden = true;
      return;
    }
    if (this.placing) {
      this.itemSheet.hidden = true;
      this.backdrop.hidden = true;
      return;
    }
    this.root.classList.remove('sheet-open');
    for (const d of this.dialogs()) d.hidden = true;
    this.fabMenu.hidden = true;
    this.itemSheet.hidden = false;
    this.backdrop.hidden = true;
    const key = `${this.store.mode}:${selectedId}:${this.store.exportJson()}`;
    if (key === this.itemKey) return;
    this.itemKey = key;
    const contentId = this.store.state.representations.find((r) => r.id === selectedId)?.contentItemId;
    const content = contentId ? this.store.content(contentId) : undefined;
    this.itemTitle.textContent = content?.title || 'Item';
    this.itemBody.replaceChildren();
    if (contentId) this.itemBody.append(this.buildRow(contentId, selectedId, true));
  }
}
