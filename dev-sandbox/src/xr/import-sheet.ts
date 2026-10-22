import type { Store } from '../core/store';
import { buildAddForm, buildImport, type FormHost } from '../views/add-forms';

/** Uses the actual desktop import/photo/file forms, including their asynchronous session guards. */
export class XrImportSheet {
  private sheet: HTMLElement | null = null;
  private version = 0;
  constructor(private store: Store) {}
  open(parent: HTMLElement): void {
    this.close();
    const sheet = document.createElement('section');
    sheet.className = 'xr-import-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Portal files, photos and bookmarks');
    const heading = document.createElement('h2'); heading.textContent = 'Portal · files, photos & bookmarks';
    const note = document.createElement('p');
    note.textContent = 'Files/folders save names only; photos stay on this device. Browser file pickers may require removing your headset. Your room is kept.';
    const status = document.createElement('p'); status.setAttribute('role','status');
    const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => this.close();
    const host: FormHost = {
      store: this.store, idPrefix: 'xr-portal-', close: () => this.close(),
      flash: message => { status.textContent = message; },
      inputGuard: () => {
        const session = this.store.sessionGuard(), version = this.version;
        return () => session() && version === this.version;
      },
    };
    sheet.append(heading, note, close, status, buildImport(host), buildAddForm(host));
    // Prevent the same overlay click from also selecting the world behind it.
    sheet.addEventListener('beforexrselect', event => event.preventDefault());
    parent.append(sheet);
    this.sheet = sheet;
  }
  close(): void { this.version++; this.sheet?.remove(); this.sheet = null; }
  get visible(): boolean { return this.sheet !== null; }
}
