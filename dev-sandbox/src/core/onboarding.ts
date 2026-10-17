export const ONBOARDING_KEY = 'mp-sandbox:onboarding';
export type OnboardingStatus = 'fresh' | 'skipped' | 'done';
export type LessonId = 'create' | 'move' | 'rooms' | 'style';
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
  create: [
    { id: 'create-open', lesson: 'create', title: 'Open Add object', prompt: 'Open Add object from Edit room or the VR menu.', target: '[data-tutorial="add-object"], [data-tutorial="xr-add"]', event: 'open-add' },
    { id: 'create-title', lesson: 'create', title: 'Give it a title', prompt: 'Type a title. Practice uses sample text and never overwrites your saved room.', target: '#new-object-title, [data-tutorial="xr-title"]', event: 'typed-title' },
    { id: 'create-content', lesson: 'create', title: 'Add a link or note', prompt: 'Enter a https link or a short note.', target: '#new-object-ref, [data-tutorial="xr-text"]', event: 'typed-content' },
    { id: 'create-save', lesson: 'create', title: 'Create it', prompt: 'Choose a kind if you want, then Add to room / Create object.', target: '.add button, [data-tutorial="xr-submit"]', event: 'created' },
    { id: 'create-place', lesson: 'create', title: 'Find it in the room', prompt: 'If it is unplaced, tap a pad. Cancel leaves it safely in Inbox or on a free slot.', target: '.slot-marker, [data-tutorial="place-pad"]', event: 'placed' },
  ],
  move: [
    { id: 'move-select', lesson: 'move', title: 'Select an object', prompt: 'Select the highlighted practice object.', target: '[data-tutorial="practice-object"]', event: 'selected' },
    { id: 'move-pick', lesson: 'move', title: 'Pick it up', prompt: 'Choose Move / Pick up. Cancel restores it.', target: 'button[data-action="pickup"], [data-tutorial="xr-move"]', event: 'picked' },
    { id: 'move-place', lesson: 'move', title: 'Place it', prompt: 'Drop it on a free pad.', target: '.slot-marker, [data-tutorial="place-pad"]', event: 'placed' },
    { id: 'move-stash', lesson: 'move', title: 'Put it away', prompt: 'Put away / Stash sends it to Inbox, not delete.', target: 'button[data-action="stash"], [data-tutorial="xr-stash"]', event: 'stashed' },
    { id: 'move-restore', lesson: 'move', title: 'Bring it back', prompt: 'Open Inbox and restore it.', target: '[data-tutorial="inbox"], [data-tutorial="xr-inbox"]', event: 'restored' },
  ],
  rooms: [
    { id: 'rooms-open', lesson: 'rooms', title: 'Open Rooms', prompt: 'Open the Rooms list. Each room keeps its own local save.', target: '[data-tutorial="rooms"], [data-tutorial="xr-rooms"]', event: 'open-rooms' },
    { id: 'rooms-switch', lesson: 'rooms', title: 'Visit another room', prompt: 'Pick a named room. This does not overwrite your home save.', target: '[data-tutorial="room-pick"], [data-tutorial="xr-room"]', event: 'switched' },
    { id: 'rooms-home', lesson: 'rooms', title: 'Return home', prompt: 'Switch back to your original room.', target: '[data-tutorial="home-room"], [data-tutorial="xr-home-room"]', event: 'returned' },
  ],
  style: [
    { id: 'style-open', lesson: 'style', title: 'Open style controls', prompt: 'Open Lighting, Surfaces, or Theme. Layout stays the same.', target: '[data-tutorial="style"], [data-tutorial="xr-lighting"]', event: 'open-style' },
    { id: 'style-change', lesson: 'style', title: 'Try a look', prompt: 'Change lighting or a surface. Practice restores on Skip/Exit.', target: '[data-tutorial="style-choice"], [data-tutorial="xr-light"]', event: 'styled' },
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

export function beginLesson(lesson: LessonId, snapshot: string, roomId: string | null): OnboardingState {
  return { status: 'fresh', lesson, step: 0, snapshot, roomId };
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
