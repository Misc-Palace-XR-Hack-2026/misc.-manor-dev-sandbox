import { parseBookmarksHtml } from '../core/bookmarks';
import { safeUrl } from '../core/content';
import type { Store } from '../core/store';
import { CONTENT_TYPES, OBJECT_KINDS, OBJECT_LABELS, type ContentType, type ObjectKind } from '../core/types';
import { buildKindInventory } from './kind-picker';
import { preparePhoto } from './photo-upload';

// The "Add object" and "Import" forms. The sandbox menu shows them in its + sheets; the demo shows the same forms
// from the save point. Built with DOM nodes + textContent only, so imported titles and URLs can never inject markup.

export interface FormHost {
  store: Store;
  /** Show a short status message. */
  flash(msg: string): void;
  /** Close the sheet the form sits in. */
  close(): void;
  /** True while a slow input (file read, photo decode) may still apply: same room session, same sheet. */
  inputGuard(): () => boolean;
  /** Prefix for element ids, so a second copy of a form on the page keeps its labels pointing at its own inputs. */
  idPrefix?: string;
  /** A form finished its job (something was added or imported). */
  done?(): void;
}

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

export function buildAddForm(host: FormHost): HTMLElement {
  const id = (name: string) => `${host.idPrefix ?? ''}${name}`;
  const title = el('input', { placeholder: 'Title (required)', id: id('new-object-title') });
  const ref = el('input', { placeholder: 'Paste a link, or a file name', id: id('new-object-ref') });
  const type = el('select', {id:id('new-object-type'), ariaLabel:'Content type'});
  type.append(el('option', { value: 'link', textContent: 'type: link' }));
  for (const t of CONTENT_TYPES.filter((value) => value !== 'link')) type.append(el('option', { value: t, textContent: t }));
  type.append(el('option', { value: 'auto', textContent: 'type: auto' }));
  const kind = el('select', { id: id('new-object-kind'), class: 'kind-select' });
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
    if (!valid()) { host.flash('Enter a title and content; links require a valid http or https URL.'); notify('create-invalid'); return; }
    const added = host.store.addItem({ title: title.value, sourceRef: ref.value, type: type.value as ContentType | 'auto', kind: (kind.value || undefined) as ObjectKind | undefined });
    if (host.store.practicing && host.store.slotOf(added)) host.store.pickUp(added);
    title.value = ref.value = '';
    host.flash('Added to the room.');
    host.close();
    host.done?.();
    document.dispatchEvent(new CustomEvent('palace-tutorial', { detail: 'created' }));
  };
  title.addEventListener('input', () => { if(title.value.trim()) notify('typed-title'); });
  ref.addEventListener('input', () => { if(valid()) notify('typed-content'); });
  add.addEventListener('click', submit);
  for (const i of [title, ref]) i.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  const photo = el('input', {type:'file',accept:'image/png,image/jpeg',id:id('local-photo')});
  photo.addEventListener('change',async()=>{
    const file=photo.files?.[0];if(!file)return;
    const current = host.inputGuard();
    photo.disabled=true;host.flash('Preparing photo locally…');
    try {
      const data=await preparePhoto(file);
      if (!current()) return;
      host.store.addPhoto(title.value.trim() || file.name.replace(/\.[^.]+$/, ''), data);
      host.flash(host.store.saveError ? 'Photo added in memory only. Export your room before leaving.' : 'Photo added. Stored on this device and included in room exports.');
      host.close();
      host.done?.();
    } catch(e) {host.flash(`Photo not added: ${e instanceof Error ? e.message : String(e)}`);}
    finally {photo.disabled=false;photo.value='';}
  });
  const cancel = el('button',{type:'button',textContent:'Cancel'}); cancel.dataset.tutorial='create-cancel'; cancel.addEventListener('click',()=>host.close());
  return el('div', { class: 'add' }, cancel, ref, title, el('label', {htmlFor:id('new-object-kind'),textContent:'Object representation'}), kind, picker, el('div', { class: 'row-inline' }, type, add),
    el('label',{htmlFor:id('local-photo'),textContent:'Upload local photo'}),photo,
    el('small',{textContent:'PNG / JPEG · up to 12 MB · resized to 1024 px. No upload to a server.'}));
}

export function buildImport(host: FormHost): HTMLElement {
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
  const done = (msg: string) => { host.flash(msg); host.close(); host.done?.(); };

  const bookmarks = input('.html,text/html', false, false, async ([file]) => {
    const current = host.inputGuard();
    try {
      const text = await file.text();
      if (!current()) return;
      const entries = parseBookmarksHtml(text);
      const { added, placed } = host.store.importBookmarks(entries);
      done(`Imported ${added} bookmarks (${placed} placed, ${added - placed} in Packed items).`);
      document.dispatchEvent(new CustomEvent('palace-import', {detail:{entries, added, placed}}));
    } catch (e) {
      host.flash(`Could not import bookmarks: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const files = input('', true, false, (list) => {
    const { added, placed } = host.store.importFiles(entries(list));
    done(`Added ${added} files by name (${placed} placed in the room, the rest are in Packed items).`);
  });
  const folder = input('', true, true, (list) => {
    const { added, placed } = host.store.importFiles(entries(list));
    done(`Added ${added} files from the folder by name (${placed} placed, the rest in Packed items).`);
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
