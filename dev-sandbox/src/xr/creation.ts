import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../core/types';
import { safeUrl } from '../core/content';
import type { Store } from '../core/store';

export type DraftField = 'title' | 'text';
export type DraftMode = 'link' | 'note';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const URL_PUNCT = ".,-/'!?:&=_%#+@";
const CONTROLS = ['space', 'backspace', 'caps'] as const;

function keyboardKeys(caps: boolean): string[] {
  const letters = caps ? LETTERS.toUpperCase() : LETTERS;
  return [...letters, ...'0123456789', ...URL_PUNCT, ...CONTROLS];
}

export class XrCreation {
  title = '';
  text = '';
  mode: DraftMode = 'link';
  kind: ObjectKind | '' = '';
  field: DraftField = 'title';
  error = '';
  message = '';
  created = false;
  caps = false;

  get keys(): string[] { return keyboardKeys(this.caps); }

  key(token: string): void {
    if (this.created) return;
    if (token === 'caps') {
      this.caps = !this.caps;
      this.error = '';
      return;
    }
    const target = this.field === 'title' ? 'title' : 'text';
    if (token === 'backspace') this[target] = this[target].slice(0, -1);
    else if (token === 'space' || token === ' ') this[target] += ' ';
    else if (/^[A-Za-z0-9]$/.test(token) || URL_PUNCT.includes(token)) this[target] += token;
    this.error = '';
  }

  create(store: Store): string | null {
    if (this.created) return null;
    const title = this.title.trim();
    if (!title) { this.error = 'Enter a title.'; return null; }
    let sourceRef = this.text.trim();
    const type: 'link' | 'note' = this.mode;
    if (this.mode === 'link') {
      const url = safeUrl(sourceRef);
      if (!url) { this.error = 'Enter a valid http or https URL.'; return null; }
      sourceRef = url;
    }
    const kind = this.kind && OBJECT_KINDS.includes(this.kind) ? this.kind : undefined;
    const before = store.state.contentItems.length;
    const id = store.addItem({ title, sourceRef, type, kind, place: store.freeSlotIds().length > 0 });
    this.created = true;
    this.error = '';
    if (store.slotOf(id)) {
      store.pickUp(id);
      this.message = 'Point at a pad to place it, or cancel to leave it in the room.';
    } else {
      if (store.state.representations.some((r) => r.id === id)) store.stash(id);
      this.message = store.state.contentItems.length > before ? 'Room is full. Find it in Inbox.' : 'Created.';
    }
    if (store.state.representations.some((r) => r.id === id)) store.select(id);
    return id;
  }
}

export function creationButtons(draft: XrCreation): Array<{id:string;label:string}> {
  if (draft.created) return [
    { id: 'create:done', label: draft.message || 'Place it, then close' },
    { id: 'page:home', label: 'Close' },
  ];
  const kinds = OBJECT_KINDS.map((kind) => ({ id: 'create-kind:' + kind, label: (draft.kind === kind ? '• ' : '') + OBJECT_LABELS[kind] }));
  return [
    { id: 'create:title', label: 'Title: ' + (draft.title || '(empty)') },
    { id: 'create:text', label: (draft.mode === 'link' ? 'URL: ' : 'Note: ') + (draft.text || '(empty)') },
    { id: 'create:mode', label: draft.mode === 'link' ? 'Mode: link' : 'Mode: note' },
    { id: 'create:field-title', label: draft.field === 'title' ? '• Typing title' : 'Type title' },
    { id: 'create:field-text', label: draft.field === 'text' ? '• Typing URL/note' : 'Type URL/note' },
    ...draft.keys.map((k) => ({
      id: 'key:' + k,
      label: k === 'space' ? 'Space' : k === 'backspace' ? 'Delete' : k === 'caps' ? (draft.caps ? 'Caps on' : 'Caps') : k,
    })),
    { id: 'create-kind:', label: draft.kind ? OBJECT_LABELS[draft.kind] : 'Automatic object' },
    ...kinds,
    { id: 'create:submit', label: 'Create object' },
    { id: 'create:cancel', label: 'Cancel' },
  ];
}
