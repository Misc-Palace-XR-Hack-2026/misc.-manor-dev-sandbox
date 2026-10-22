import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../core/types';
import { safeUrl } from '../core/content';
import type { Store } from '../core/store';

export type DraftField = 'title' | 'text';
export type DraftMode = 'link' | 'note';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const URL_PUNCT = ".,-/'!?:&=_%#+@";
/** Multi-character inserts that save a lot of ray-aiming on URLs. */
export const SHORTCUTS: Record<string, string> = { https: 'https://', com: '.com' };
const CONTROLS = ['space', 'backspace', 'caps', ...Object.keys(SHORTCUTS)] as const;

function keyboardKeys(caps: boolean): string[] {
  const letters = caps ? LETTERS.toUpperCase() : LETTERS;
  return [...letters, ...'0123456789', ...URL_PUNCT, ...CONTROLS];
}

// QWERTY rows, then a digit row, then the URL punctuation, then the controls. Everything is on
// screen at once: the old flat 54-key list was paged ten-at-a-time, which meant five screens of
// giant buttons to type a single URL.
const ROW_LETTERS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const ROW_DIGITS = '0123456789';
const ROW_PUNCT_A = ".,-/'!?:&=_%#";
const ROW_PUNCT_B = '+@';
const ROW_CONTROLS = ['caps', 'space', 'backspace', 'https', 'com'];

/** The on-panel keyboard layout: rows of key tokens, mirroring `key()`'s token contract. */
export function keyboardRows(draft: { caps: boolean }): string[][] {
  const cased = (row: string) => [...(draft.caps ? row.toUpperCase() : row)];
  return [
    ...ROW_LETTERS.map(cased),
    [...ROW_DIGITS],
    [...ROW_PUNCT_A],
    [...ROW_PUNCT_B, ...ROW_CONTROLS],
  ];
}

/** Relative width of a key, in grid units, so space and the shortcuts stay easy to hit. */
export function keyWidthUnits(token: string): number {
  if (token === 'space') return 3;
  if (token === 'caps' || token === 'backspace' || token === 'https' || token === 'com') return 2;
  return 1;
}

export function keyLabel(token: string, caps: boolean): string {
  if (token === 'space') return 'Space';
  if (token === 'backspace') return '⌫';
  if (token === 'caps') return caps ? 'CAPS' : 'caps';
  if (token in SHORTCUTS) return SHORTCUTS[token];
  return token;
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
  editingContentId: string | null = null;

  get keys(): string[] { return keyboardKeys(this.caps); }
  get editing(): boolean { return this.editingContentId !== null; }

  beginEdit(contentId: string, title: string, sourceRef: string, mode: DraftMode): void {
    this.editingContentId = contentId;
    this.title = title;
    this.text = sourceRef;
    this.mode = mode;
    this.kind = '';
    this.field = 'title';
    this.error = '';
    this.message = '';
    this.created = false;
  }

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
    else if (token in SHORTCUTS) this[target] += SHORTCUTS[token];
    else if (/^[A-Za-z0-9]$/.test(token) || URL_PUNCT.includes(token)) this[target] += token;
    this.error = '';
  }

  create(store: Store): string | null {
    if (this.created) return null;
    const title = this.title.trim();
    if (!title) { this.error = 'Enter a title.'; return null; }
    let sourceRef = this.text.trim();
    let type: 'link' | 'note' = this.mode;
    if (!sourceRef) { this.error='Enter content.'; return null; }
    if (this.mode === 'link') {
      if (/^[a-z][a-z0-9+.-]*:/i.test(sourceRef) && !/^https?:/i.test(sourceRef)) { this.error = 'Enter a valid http or https URL.'; return null; }
      const url = safeUrl(sourceRef.startsWith('http') ? sourceRef : `https://${sourceRef}`);
      if (url) sourceRef = url;
      else { this.error='Enter a valid http or https URL.'; return null; }
    }

    if (this.editingContentId) {
      store.updateContent(this.editingContentId, { title, sourceRef });
      this.created = true;
      this.error = '';
      this.message = 'Saved changes.';
      return null;
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
      this.message = store.state.contentItems.length > before ? 'Room is full. Find it in the item pillar’s Unpack tray.' : 'Created.';
    }
    if (store.state.representations.some((r) => r.id === id)) store.select(id);
    return id;
  }
}

export function creationFormButtons(draft: XrCreation): Array<{id:string;label:string}> {
  return [
    { id: 'create:title', label: 'Title: ' + (draft.title || '(empty)') },
    { id: 'create:text', label: (draft.mode === 'link' ? 'URL: ' : 'Note: ') + (draft.text || '(empty)') },
    { id: 'create:field-title', label: draft.field === 'title' ? '• Title' : 'Title' },
    { id: 'create:field-text', label: draft.field === 'text' ? (draft.mode === 'link' ? '• URL' : '• Note') : (draft.mode === 'link' ? 'URL' : 'Note') },
    { id: 'create:mode', label: draft.mode === 'link' ? 'Mode: link' : 'Mode: note' },
  ];
}

export function creationKindButtons(draft: XrCreation): Array<{id:string;label:string}> {
  if (draft.editing) return [];
  return [
    { id: 'create-kind:', label: (draft.kind ? '' : '• ') + 'Automatic object' },
    ...OBJECT_KINDS.map((kind) => ({ id: 'create-kind:' + kind, label: (draft.kind === kind ? '• ' : '') + OBJECT_LABELS[kind] })),
  ];
}

export function creationActionButtons(draft: XrCreation): Array<{id:string;label:string}> {
  return [
    { id: 'create:submit', label: draft.editing ? 'Save changes' : 'Create object' },
    { id: 'create:cancel', label: 'Cancel' },
  ];
}

export function creationDoneButtons(draft: XrCreation): Array<{id:string;label:string}> {
  return [
    { id: 'create:done', label: draft.message || 'Place it, then close' },
    { id: 'page:home', label: 'Close' },
  ];
}

/** Flat list kept for the tutorial's action matching and for non-grid callers. */
export function creationButtons(draft: XrCreation): Array<{id:string;label:string}> {
  if (draft.created) return creationDoneButtons(draft);
  const form = creationFormButtons(draft);
  return [
    ...form.slice(0, 2),
    form[4],
    ...form.slice(2, 4),
    ...draft.keys.map((k) => ({ id: 'key:' + k, label: keyLabel(k, draft.caps) })),
    ...creationKindButtons(draft),
    ...creationActionButtons(draft),
  ];
}

