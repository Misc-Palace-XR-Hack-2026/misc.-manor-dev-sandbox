import type { Store } from '../core/store';
import { ROOM_TRACKS, TRACK_LABELS, validTrack, type Soundtrack } from '../core/soundtrack';
import { buildAddForm, buildImport, type FormHost } from '../views/add-forms';

// The demo's HUD after the starter tutorial (still the tutorial: the edit tools wait for Exit tutorial).
// Bottom: Help and the Camera choice. Bottom left, beside `dev`: Exit tutorial. Top: the goal, once the visitor first
// sees the save point. The save point's own panel (add a link or file, import bookmarks, random drop) lives here too.

export type CameraChoice = 'tactile' | 'dollhouse';

export const CAMERA_LABELS: Record<CameraChoice, string> = { tactile: 'Tactile', dollhouse: 'Dollhouse' };

export const HELP_LINES = [
  'Tap the floor to walk there.',
  'Drag to look around.',
  'Pinch or scroll to step back.',
  'Camera: Tactile walks the room, Dollhouse shows all of it.',
  'Tap the glowing portal to add your stuff.',
  'Tap an object, then tap it again to pick it up. Tap a glowing spot to put it down.',
];

export const GOAL_LINE = 'Choose your camera / motion to get to the portal';
/** The Camera choice stops pulsing after this long (ms) if it isn't used. */
const PULSE_MS = 8000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export interface DemoHud {
  /** Show the goal line and draw the eye to the Camera choice (until it is used or the save point opens). */
  showGoal(): void;
  /** Stop drawing the eye to the Camera choice. */
  goalMet(): void;
  /** Hide the goal line now (another line is about to show in its place). */
  hideGoal(): void;
  /** Show Edit room, left of Help (once the portal has been used). */
  showEditRoom(onClick: () => void): void;
  /** Free mode: the tutorial is over, so Exit tutorial goes. */
  free(): void;
  dispose(): void;
}

export function mountDemoHud(opts: {
  /** The `dev` link; Exit tutorial goes right after it. */
  dev: HTMLElement;
  camera: CameraChoice;
  onCamera: (choice: CameraChoice) => void;
  onExit: () => void;
}): DemoHud {
  const hud = el('nav', 'demo-hud');
  hud.setAttribute('aria-label', 'Demo');

  // ---- help ----
  const help = el('section', 'demo-panel demo-help');
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-label', 'Help');
  help.hidden = true;
  const list = el('ul', 'demo-help-list');
  for (const line of HELP_LINES) list.append(el('li', '', line));
  const closeHelp = () => { help.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); };
  const helpHead = el('header', 'demo-panel-head');
  helpHead.append(el('h2', '', 'Getting around'), button('demo-panel-close', 'Close', closeHelp));
  help.append(helpHead, list);
  const helpBtn = button('demo-hud-btn', 'Help', () => {
    help.hidden = !help.hidden;
    helpBtn.setAttribute('aria-expanded', String(!help.hidden));
  });
  helpBtn.setAttribute('aria-expanded', 'false');

  // ---- camera ----
  const cameraWrap = el('label', 'demo-camera');
  const select = el('select', 'demo-camera-select');
  for (const [value, label] of Object.entries(CAMERA_LABELS)) {
    const option = el('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = opts.camera;
  cameraWrap.append(el('span', 'demo-camera-label', 'Camera'), select);
  select.addEventListener('change', () => {
    goalMet();
    opts.onCamera(select.value as CameraChoice);
    select.blur(); // arrow keys and WASD walk again
  });
  hud.append(helpBtn, cameraWrap);

  // ---- exit tutorial ----
  const exit = button('demo-exit', 'Exit tutorial', () => opts.onExit());
  exit.title = 'Leave the tutorial: edit tools and Rooms';
  opts.dev.after(exit);

  // ---- goal ----
  const goal = el('p', 'demo-goal', GOAL_LINE);
  goal.setAttribute('role', 'status');
  let goalTimer = 0, pulseTimer = 0;
  const goalMet = () => { window.clearTimeout(pulseTimer); cameraWrap.classList.remove('demo-pulse'); };

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !help.hidden) closeHelp(); };
  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!help.hidden && !help.contains(t) && !helpBtn.contains(t)) closeHelp();
  };
  window.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDown, true);
  document.body.append(hud, help, goal);

  return {
    showGoal() {
      goal.classList.add('demo-goal-on');
      cameraWrap.classList.add('demo-pulse');
      window.clearTimeout(goalTimer);
      goalTimer = window.setTimeout(() => goal.classList.remove('demo-goal-on'), 6000);
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(goalMet, PULSE_MS);
    },
    goalMet,
    hideGoal() {
      window.clearTimeout(goalTimer);
      goal.classList.remove('demo-goal-on');
    },
    showEditRoom(onClick) {
      if (hud.querySelector('.demo-edit-room')) return;
      helpBtn.before(button('demo-hud-btn demo-edit-room', 'Edit room', onClick));
    },
    free() {
      exit.remove();
    },
    dispose() {
      window.clearTimeout(goalTimer);
      window.clearTimeout(pulseTimer);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      hud.remove();
      help.remove();
      goal.remove();
      exit.remove();
    },
  };
}

export interface SavePointPanel {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

/**
 * What the save point offers: the sandbox's own Add object and Import forms (shared with its + menu), and Random drop
 * (`onRandomDrop`). `onUsed` runs whenever one of the forms finishes. Element ids are prefixed so they never clash
 * with the sandbox menu once it mounts.
 */
export function mountSavePointPanel(
  store: Store, say: (text: string, ms?: number) => void, onRandomDrop: () => void, onUsed: () => void,
): SavePointPanel {
  let version = 0;
  const backdrop = el('button', 'sheet-backdrop');
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close');
  backdrop.hidden = true;

  const menu = el('section', 'demo-panel demo-sp');
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Add objects to room');
  menu.hidden = true;

  const sheet = (title: string, body: HTMLElement) => {
    const s = el('div', 'sheet dialog-sheet demo-sp-sheet');
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-label', title);
    s.hidden = true;
    const head = el('header', 'sheet-head');
    head.append(el('h2', '', title), button('sheet-close', 'Close', close));
    s.append(head, body);
    return s;
  };
  const host: FormHost = {
    store,
    flash: (msg) => say(msg, 2800),
    close: () => close(),
    inputGuard: () => {
      const session = store.sessionGuard(), v = version;
      return () => session() && v === version;
    },
    idPrefix: 'sp-',
    done: onUsed,
  };
  const addSheet = sheet('Add link or file', buildAddForm(host));
  const importSheet = sheet('Import', buildImport(host));

  const show = (target: HTMLElement) => {
    close();
    target.hidden = false;
    backdrop.hidden = false;
  };
  const head = el('header', 'demo-panel-head');
  head.append(el('h2', '', 'Add objects to room'), button('demo-panel-close', 'Close', close));
  menu.append(
    head,
    button('', 'Add link or file', () => show(addSheet)),
    button('', 'Import from bookmarks (file)', () => show(importSheet)),
    button('', 'Random drop', () => { close(); onRandomDrop(); }),
  );

  function close(): void {
    version++;
    for (const input of addSheet.querySelectorAll('input')) input.value = '';
    for (const node of [menu, addSheet, importSheet, backdrop]) node.hidden = true;
  }
  backdrop.addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) close(); });
  document.body.append(backdrop, menu, addSheet, importSheet);

  return {
    open: () => { if (store.canEdit) show(menu); },
    close,
    get isOpen() { return !backdrop.hidden; },
  };
}

const MUSIC_OFF = 'off';
const MUSIC_FOLLOW = 'follow';

/**
 * The jukebox's panel: pick the room's music (the same choice as Room music in the room editor). Feeding it your own
 * music comes later.
 */
export function mountJukeboxPanel(store: Store, onClose: () => void, onPick?: () => void): SavePointPanel {
  const backdrop = el('button', 'sheet-backdrop');
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close');
  backdrop.hidden = true;
  const panel = el('section', 'demo-panel demo-jukebox');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Jukebox');
  panel.hidden = true;
  const head = el('header', 'demo-panel-head');
  head.append(el('h2', '', 'Jukebox'), button('demo-panel-close', 'Close', () => close()));
  const select = el('select', 'demo-jukebox-select');
  select.id = 'demo-jukebox-music';
  const option = (value: string, label: string) => {
    const o = el('option', '', label);
    o.value = value;
    select.append(o);
  };
  option(MUSIC_FOLLOW, 'Follow lighting');
  option(MUSIC_OFF, 'No music');
  for (const track of ROOM_TRACKS) option(track, TRACK_LABELS[track]);
  select.addEventListener('change', () => {
    const v = select.value;
    const soundtrack: Soundtrack = v === MUSIC_OFF ? { mode: 'off' } : validTrack(v) ? { mode: 'track', track: v } : { mode: 'follow' };
    store.setSoundtrack(soundtrack);
    onPick?.();
  });
  const label = el('label', 'demo-jukebox-label', 'Room music');
  label.htmlFor = select.id;
  panel.append(head, label, select, el('p', 'demo-jukebox-note', 'Feeding it your own music comes later.'));

  function close(): void {
    if (backdrop.hidden) return;
    panel.hidden = backdrop.hidden = true;
    onClose();
  }
  backdrop.addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) close(); });
  document.body.append(backdrop, panel);

  return {
    open() {
      if (!store.canEdit) return;
      const s = store.state.soundtrack;
      select.value = !s || s.mode === 'follow' ? MUSIC_FOLLOW : s.mode === 'off' ? MUSIC_OFF : s.track;
      panel.hidden = backdrop.hidden = false;
    },
    close,
    get isOpen() { return !backdrop.hidden; },
  };
}
