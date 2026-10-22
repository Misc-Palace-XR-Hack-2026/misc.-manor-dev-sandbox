export const ONBOARDING_KEY = 'mp-sandbox:onboarding';
export type OnboardingStatus = 'fresh' | 'skipped' | 'done';
export type LessonId = 'create' | 'move' | 'rooms' | 'style' | 'bookmarks';
export interface TutorialStep {
  id: string;
  lesson: LessonId;
  title: string;
  prompt: string;
  target: string;
  event: string;
}
export interface OnboardingState {
  status: OnboardingStatus;
  lesson: LessonId | null;
  step: number;
  snapshot: string | null;
  roomId: string | null;
}

export const LESSONS: Record<LessonId, TutorialStep[]> = {
  bookmarks: [
    { id:'import-export', lesson:'bookmarks', title:'Export bookmarks on desktop', prompt:'In your browser bookmark manager, export bookmarks as HTML. Or download the sample below. File picking is desktop-first; VR has no file importer. Confirm when ready.', target:'[data-tutorial="export-ready"]', event:'export-ready' },
    { id:'import-empty', lesson:'bookmarks', title:'Try an empty or malformed file', prompt:'Download the empty/malformed sample. Open Import and choose it with Bookmarks file (.html). No supported links means zero changes; cancel the picker and retry anytime.', target:'[data-tutorial="bookmark-file"]', event:'import-empty' },
    { id:'import-file', lesson:'bookmarks', title:'Import the overflow sample', prompt:'Choose tutorial-bookmarks.html using the actual Bookmarks file control. It contains folder tags, an exact duplicate, unsupported URLs, and more links than free pads.', target:'[data-tutorial="bookmark-file"]', event:'imported' },
    { id:'import-dedupe', lesson:'bookmarks', title:'Import the same sample again', prompt:'Read the added / placed / Packed items counts below. Folders become tags, not rooms. Exact URL duplicates are skipped. Select the same sample again: added must be zero.', target:'[data-tutorial="bookmark-file"]', event:'import-duplicate' },
    { id:'import-inbox', lesson:'bookmarks', title:'Find overflow in Packed items', prompt:'Open the editor and find the rows marked Packed items. Imported content remains saved in practice even without a room object. In VR open the item pillar’s Unpack tray after desktop import.', target:'.row.inbox', event:'inbox-open' },
    { id:'import-stash', lesson:'bookmarks', title:'Free a pad', prompt:'Choose Pack item on one imported object. Packing keeps its link and tags in Packed items; it is not Delete.', target:'.row:not(.inbox) [data-action="stash"]', event:'stashed' },
    { id:'import-restore', lesson:'bookmarks', title:'Recover an overflow item', prompt:'Unpack one of the original overflow links into the free pad. In VR use the item pillar → Unpack. No room reset is needed.', target:'.row.inbox [data-action="bring-out"]', event:'restored' },
    { id:'import-undo', lesson:'bookmarks', title:'Undo practice import', prompt:'Use Undo to reverse unpacking, packing, then the import. Empty/duplicate imports create no undo entry. Personal rooms remain untouched; Exit discards all practice.', target:'[data-tutorial="undo"]', event:'import-undone' },
  ],
  create: [
    { id: 'create-open', lesson: 'create', title: 'Open Add object', prompt: 'Open Add object from Edit room or the VR menu.', target: '[data-tutorial="open-add"], [data-tutorial="add-object"], [data-tutorial="xr-add"]', event: 'open-add' },
    { id:'create-invalid', lesson:'create', title:'Try invalid input', prompt:'Leave content empty and press Add to room / Create object. Validation must keep the room unchanged.', target:'[data-tutorial="add-submit"]', event:'create-invalid' },
    { id:'create-cancel', lesson:'create', title:'Cancel this draft', prompt:'Cancel (or Close / Escape) discards your draft. Reopen to try again.', target:'[data-tutorial="create-cancel"]', event:'create-cancel' },
    { id:'create-reopen', lesson:'create', title:'Reopen Add object', prompt:'Open Add object again for a fresh sample.', target:'[data-tutorial="open-add"], [data-tutorial="add-object"]', event:'open-add' },
    { id: 'create-title' , lesson: 'create', title: 'Give it a title', prompt: 'Type a title. Practice uses sample text and never overwrites your saved room.', target: '#new-object-title, [data-tutorial="xr-title"]', event: 'typed-title' },
    { id: 'create-content', lesson: 'create', title: 'Add a link or note', prompt: 'Enter a https link or a short note.', target: '#new-object-ref, [data-tutorial="xr-text"]', event: 'typed-content' },
    { id:'create-kind', lesson:'create', title:'Choose its representation', prompt:'Choose an object kind. The link or note is content; the kind only changes how it looks.', target:'#new-object-kind, .add .kind-current', event:'kind-chosen' },
    { id: 'create-save' , lesson: 'create', title: 'Create it', prompt: 'Choose a kind if you want, then Add to room / Create object.', target: '[data-tutorial="add-submit"], [data-tutorial="xr-submit"]', event: 'created' },
    { id: 'create-place', lesson: 'create', title: 'Find it in the room', prompt: 'Tap the highlighted free pad to place your sample. Cancel restores its starting pad. Practice is discarded on exit/reload; normal creations are saved locally and survive reload.', target: '.slot-marker, [data-tutorial="place-pad"]', event: 'placed' },
  ],
  move: [
    { id: 'move-select', lesson: 'move', title: 'Select an object', prompt: 'Select the highlighted practice object.', target: '[data-tutorial="practice-object"]', event: 'selected' },
    { id: 'move-pick', lesson: 'move', title: 'Pick it up', prompt: 'Choose Move / Pick up. Cancel restores it.', target: 'button[data-action="pick-up"], [data-tutorial="xr-move"]', event: 'picked' },
    { id:'move-cancel', lesson:'move', title:'Cancel the move', prompt:'Press Escape or Cancel move. The same object and content return to their original pad.', target:'[data-tutorial="cancel-move"]', event:'move-cancelled' },
    { id:'move-pick-again', lesson:'move', title:'Pick up again', prompt:'Select Practice object and Pick up again. Occupied pink pads swap both objects when moving a placed object; neither content is deleted. Use a free yellow pad next.', target:'[data-action="pick-up"]', event:'picked' },
    { id: 'move-place' , lesson: 'move', title: 'Place it', prompt: 'Drop it on a free pad.', target: '.slot-marker, [data-tutorial="place-pad"]', event: 'placed' },
    { id: 'move-stash', lesson: 'move', title: 'Pack item', prompt: 'Pack item keeps its content in the item pillar’s Unpack tray; it does not delete it.', target: 'button[data-action="stash"], [data-tutorial="xr-stash"]', event: 'stashed' },
    { id: 'move-restore', lesson: 'move', title: 'Bring it back', prompt: 'Open the item pillar’s Unpack tray and restore it.', target: '[data-action="bring-out"], [data-tutorial="xr-inbox"]', event: 'restored' },
  ],
  rooms: [
    { id: 'rooms-open', lesson: 'rooms', title: 'Open Rooms', prompt: 'Open the Rooms list. Each room keeps its own local save.', target: '[data-tutorial="rooms"], [data-tutorial="xr-rooms"]', event: 'open-rooms' },
    { id: 'rooms-switch', lesson: 'rooms', title: 'Visit another room', prompt: 'Pick a named room. Practice visits disposable copies; no personal room is loaded or changed.', target: '[data-tutorial="room-pick"], [data-tutorial="xr-room"]', event: 'switched' },
    { id: 'rooms-home', lesson: 'rooms', title: 'Return home', prompt: 'Open Rooms again and choose your original named practice room. Normal rooms are browser-local, not cloud sync or multiplayer; unreadable saves are left intact.', target: '[data-tutorial="home-room"], [data-tutorial="xr-home-room"]', event: 'returned' },
  ],
  style: [
    { id: 'style-open', lesson: 'style', title: 'Open style controls', prompt: 'Open Lighting, Surfaces, or Theme. Layout stays the same.', target: '[data-tutorial="style"], [data-tutorial="xr-lighting"]', event: 'open-style' },
    { id:'style-theme', lesson:'style', title:'Apply a theme', prompt:'Choose a theme: it replaces lighting plus floor, wall and background together. It does not change layout or content.', target:'#room-theme', event:'theme-applied' },
    { id: 'style-change' , lesson: 'style', title: 'Try a look', prompt: 'Change lighting or a surface. Practice restores on Skip/Exit.', target: '[data-tutorial="style-choice"], [data-tutorial="xr-light"]', event: 'styled' },
    ...(['wall','floor','background'] as const).map(target=>({id:`style-${target}`,lesson:'style' as const,title:`Change the ${target}`,prompt:`Choose a different ${target} preset. This changes only that surface; objects and layout stay put.`,target:`#surface-${target}`,event:`surface-${target}`})),
    {id:'style-revert',lesson:'style',title:'Revert the practice look',prompt:'Use Undo repeatedly to return all surfaces and lighting to Original. Normal style edits save in this browser across reload. Practice is disposable; Exit never applies it to personal rooms.',target:'[data-tutorial="undo"]',event:'style-reverted'},
  ],
};

export function loadOnboarding(storage: Pick<Storage,'getItem'> = localStorage): OnboardingState {
  try {
    const raw = storage.getItem(ONBOARDING_KEY);
    if (!raw) return { status: 'fresh', lesson: null, step: 0, snapshot: null, roomId: null };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (parsed.status === 'done' || parsed.status === 'skipped' || parsed.status === 'fresh') {
      return { status: parsed.status, lesson: null, step: 0, snapshot: null, roomId: null };
    }
  } catch { /* keep first-run welcome if the flag is unreadable */ }
  return { status: 'fresh', lesson: null, step: 0, snapshot: null, roomId: null };
}

export function persistOnboarding(status: OnboardingStatus, storage: Pick<Storage,'setItem'> = localStorage): void {
  try { storage.setItem(ONBOARDING_KEY, JSON.stringify({ status })); } catch { /* onboarding is optional chrome */ }
}

export function beginLesson(lesson: LessonId, snapshot: string, roomId: string | null, status: OnboardingStatus = 'fresh'): OnboardingState {
  return { status, lesson, step: 0, snapshot, roomId };
}

export function visibleTarget(selector: string, root: { querySelector(sel: string): unknown; querySelectorAll?(sel:string): Iterable<unknown> } = document): unknown {
  return selector.split(',').filter(part=>part.trim()).flatMap((part) => root.querySelectorAll ? Array.from(root.querySelectorAll(part.trim())) : [root.querySelector(part.trim())]).find((node) => {
    if (!node || typeof node !== 'object') return false;
    const el = node as { hidden?: boolean; getBoundingClientRect?: () => { width: number; height: number } };
    if (el.hidden) return false;
    if (typeof getComputedStyle === 'function' && node instanceof Element) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    if (typeof el.getBoundingClientRect === 'function') {
      const box = el.getBoundingClientRect();
      if ('width' in box && box.width + box.height === 0) return false;
    }
    return true;
  }) ?? null;
}

export function currentStep(state: OnboardingState): TutorialStep | null {
  if (!state.lesson) return null;
  return LESSONS[state.lesson][state.step] ?? null;
}

export function progressLabel(state: OnboardingState): string {
  const step = currentStep(state);
  if (!step || !state.lesson) return '';
  return `${state.step + 1} of ${LESSONS[state.lesson].length}`;
}

export function advance(state: OnboardingState, event: string): OnboardingState {
  const step = currentStep(state);
  if (!step || event !== step.event) return state;
  const next = state.step + 1;
  if (!state.lesson || next >= LESSONS[state.lesson].length) return { ...state, lesson: null, step: 0, snapshot: null };
  return { ...state, step: next };
}

export function skip(state: OnboardingState): OnboardingState {
  return { status: state.status === 'fresh' ? 'skipped' : state.status, lesson: null, step: 0, snapshot: null, roomId: null };
}

export function finish(state: OnboardingState): OnboardingState {
  return { status: 'done', lesson: null, step: 0, snapshot: null, roomId: state.roomId };
}
