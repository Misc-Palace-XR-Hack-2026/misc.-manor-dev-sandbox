import type { Store } from '../core/store';
import { preparePhoto } from './photo-upload';

/** Draft stays outside the store; cancel/Escape never creates history or saves. */
export function openContentEditor(store: Store, contentId: string): void {
  if (!store.canEdit) return;
  const current = store.sessionGuard();
  const content = store.content(contentId);
  if (!content) return;
  const snapshot = JSON.stringify(content), roomId = store.state.id;
  const returnFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'content-dialog'; dialog.setAttribute('aria-label', 'Edit item');
  const heading = document.createElement('h2'); heading.textContent = 'Edit item';
  const form = document.createElement('form');
  const title = document.createElement('input'); title.id = 'edit-content-title'; title.value = content.title; title.required = true;
  const ref = content.type === 'note' ? document.createElement('textarea') : document.createElement('input');
  ref.id = 'edit-content-ref'; ref.value = content.sourceRef;
  const field = (name: string, input: HTMLInputElement | HTMLTextAreaElement) => {
    const label = document.createElement('label'); label.htmlFor = input.id; label.textContent = name;
    form.append(label, input);
  };
  const notes = document.createElement('textarea');
  notes.id = 'edit-content-notes'; notes.value = content.notes ?? ''; notes.maxLength = 4000;
  field('Title', title);
  field(content.type === 'note' ? 'Note text' : content.sourceKind === 'url' ? 'URL' : 'File reference', ref);
  const help = document.createElement('small');
  help.textContent = content.type === 'note' ? 'Notes are saved locally with your room.' : content.sourceKind === 'url' ? 'Only http and https links are supported.' : 'File references are labels or paths, not uploaded files. Local PNG/JPEG photos can be replaced below.';
  form.append(help);
  field('Notes', notes);
  let imageData: string | undefined;
  const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.hidden = true;
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save changes';
  if (content.imageData) {
    const upload = document.createElement('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg'; upload.id = 'edit-content-photo';
    field('Replace local photo', upload);
    upload.onchange = async () => {
      const file = upload.files?.[0]; if (!file) return;
      save.disabled = true; upload.disabled = true; error.hidden = true;
      try { imageData = await preparePhoto(file); }
      catch (e) { error.textContent = `Photo not replaced: ${e instanceof Error ? e.message : String(e)}`; error.hidden = false; }
      finally { save.disabled = false; upload.disabled = false; upload.value = ''; }
    };
  }
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = () => dialog.close();
  const preview = document.createElement('button'); preview.type = 'button'; preview.textContent = 'Preview room';
  preview.title = 'Discard this draft and enter desktop/mobile Preview';
  preview.onclick = () => store.setMode('preview');
  const actions = document.createElement('div'); actions.className = 'dialog-actions'; actions.append(save, cancel, preview);
  form.append(error, actions); dialog.append(heading, form);
  form.onsubmit = event => {
    event.preventDefault();
    try {
      if (!current() || store.state.id !== roomId || JSON.stringify(store.content(contentId)) !== snapshot) throw new Error('This item changed while editing. Cancel and reopen it to edit the latest version.');
      store.updateContent(contentId, {title: title.value, sourceRef: ref.value, imageData, notes: notes.value});
      if (store.saveError) {
        error.textContent = `Changes kept in memory only. Export your room before leaving. ${store.saveError}`;
        error.hidden = false; save.disabled = true; cancel.textContent = 'Close'; return;
      }
      dialog.close();
    } catch (e) { error.textContent = e instanceof Error ? e.message : String(e); error.hidden = false; }
  };
  const unsubscribe = store.subscribe(() => { if (!store.canEdit || !current()) dialog.close(); });
  dialog.addEventListener('close', () => { unsubscribe(); dialog.remove(); if (store.canEdit && returnFocus?.isConnected) returnFocus.focus(); });
  document.body.append(dialog); dialog.showModal(); title.focus();
}
