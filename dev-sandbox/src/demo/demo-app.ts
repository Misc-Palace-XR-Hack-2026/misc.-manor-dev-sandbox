import * as THREE from 'three';
import { Store, roomKeys } from '../core/store';
import type { RoomState } from '../core/types';
import { DOOR_POS, INTRO_DURATION, JUKEBOX_POS, TRAY_POS, TUTORIAL_VIEW, introFrame, markIntroSeen } from '../core/intro-timeline';
import { RoomView } from '../views/room';
import { buildKindInventory } from '../views/kind-picker';
import { buildJukebox } from './jukebox';
import { DEMO_ROOM_ID, TUTORIAL_SLOTS, seedDemoRoom, tutorialDone } from './demo-room';

// The demo is one real room (the same RoomView the sandbox uses). A visitor's first time, a scripted walk-in plays
// inside it and ends on a locked tutorial view of the shelf: they can only pick up the starter objects, look at
// them and set them on the shelf. Finishing (or skipping) lifts the lock and they stay in the same, now open, room.

type Mode = 'intro' | 'tutorial' | 'open';

const std = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

function slab(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** An open wooden box under the three starter slots. Decoration only; it is not part of the saved room. */
function buildBox(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(TRAY_POS[0], 0, TRAY_POS[2]);
  const wood = 0xb08150, dark = 0x7a5230;
  const w = 4.0, d = 1.2, h = 0.42, t = 0.08;
  group.add(
    slab(w, 0.05, d, dark, 0, 0.025, 0),
    slab(w, h, t, wood, 0, h / 2, d / 2 - t / 2),
    slab(w, h, t, wood, 0, h / 2, -d / 2 + t / 2),
    slab(t, h, d, wood, -w / 2 + t / 2, h / 2, 0),
    slab(t, h, d, wood, w / 2 - t / 2, h / 2, 0),
  );
  return group;
}

const DOOR_W = 2.2, DOOR_H = 3.3, POST = 0.2, DEPTH = 0.3;

interface Door {
  group: THREE.Group;
  /** Hinged leaf; rotation.y 0 is closed, about pi/2 swings it open toward the visitor. */
  leaf: THREE.Object3D;
  /** The bright light filling the doorway. */
  light: THREE.MeshBasicMaterial;
  /** A dark veil over everything around the door (and the room behind it), lifted once the visitor is through. */
  veil: THREE.MeshBasicMaterial;
}

/** A wooden door standing in the dark at the east entrance. It swings open on blinding light. */
function buildDoor(): Door {
  const group = new THREE.Group();
  group.position.set(DOOR_POS[0], 0, DOOR_POS[2]);
  const basic = (color: number) => new THREE.MeshBasicMaterial({ color });
  const part = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic(color));
    m.position.set(x, y, z);
    return m;
  };
  const frameColor = 0x3a2616, leafColor = 0x6b4a30;
  const half = DOOR_W / 2;
  group.add(
    part(DEPTH, DOOR_H + POST, POST, frameColor, 0, (DOOR_H + POST) / 2, -half - POST / 2),
    part(DEPTH, DOOR_H + POST, POST, frameColor, 0, (DOOR_H + POST) / 2, half + POST / 2),
    part(DEPTH, POST, DOOR_W + POST * 2, frameColor, 0, DOOR_H + POST / 2, 0),
  );

  const light = new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 1, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), light);
  glow.rotation.y = Math.PI / 2;
  glow.position.set(-0.08, DOOR_H / 2, 0);
  glow.renderOrder = 10;
  group.add(glow);

  // The leaf is hinged on the north post; its pivot sits on the hinge line.
  const leaf = new THREE.Group();
  leaf.position.set(0.1, 0, -half);
  leaf.add(part(0.1, DOOR_H, DOOR_W, leafColor, 0, DOOR_H / 2, half));
  group.add(leaf);

  // The veil is a huge wall with the doorway cut out of it, facing east (the visitor). Seen from behind it vanishes.
  const wall = new THREE.Shape();
  wall.moveTo(-40, -5); wall.lineTo(40, -5); wall.lineTo(40, 30); wall.lineTo(-40, 30); wall.lineTo(-40, -5);
  const hole = new THREE.Path();
  hole.moveTo(-half, 0); hole.lineTo(-half, DOOR_H); hole.lineTo(half, DOOR_H); hole.lineTo(half, 0); hole.lineTo(-half, 0);
  wall.holes.push(hole);
  const veil = new THREE.MeshBasicMaterial({ color: 0x04050a, transparent: true, opacity: 0.92, depthWrite: false });
  const veilMesh = new THREE.Mesh(new THREE.ShapeGeometry(wall), veil);
  veilMesh.rotation.y = Math.PI / 2;
  veilMesh.position.set(-0.2, 0, 0);
  veilMesh.renderOrder = 9;
  group.add(veilMesh);

  return { group, leaf, light, veil };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function startDemo(container: HTMLElement, wantIntro: boolean, storage: Storage | null, search: string): void {
  // ---- the visitor's room -------------------------------------------------
  let initial: RoomState;
  try {
    initial = Store.loadSaved(DEMO_ROOM_ID) ?? seedDemoRoom();
  } catch (error) {
    // Never start a fresh room over an unreadable save.
    const warning = el('p', 'demo-error', error instanceof Error ? error.message : String(error));
    warning.setAttribute('role', 'alert');
    container.append(warning);
    console.error('demo room', roomKeys(DEMO_ROOM_ID).main, error);
    return;
  }
  const store = new Store(initial, DEMO_ROOM_ID);
  // ?intro is an explicit replay: start the starter objects over in their box.
  const replay = wantIntro && new URLSearchParams(search).has('intro') && tutorialDone(store.state);
  if (replay) store.replaceState(seedDemoRoom());

  const view = new RoomView(container, store, []);
  const camera = new THREE.PerspectiveCamera(TUTORIAL_VIEW.fov, 1, 0.1, 120);

  // ---- scenery outside the saved room -------------------------------------
  const jukebox = buildJukebox();
  jukebox.group.position.set(...JUKEBOX_POS);
  jukebox.group.rotation.y = -Math.PI / 2; // outside the room, its face toward the room (west)
  jukebox.group.scale.setScalar(0.6);
  jukebox.setGlow(0.4);
  jukebox.setOpacity(0.55); // a little see-through so it does not pull the eye
  const box = buildBox();
  const door = buildDoor();
  view.addToScene(jukebox.group, box, door.group);

  // ---- overlay --------------------------------------------------------------
  const black = el('div', 'demo-black');
  const skip = el('button', 'demo-skip', 'Skip intro');
  skip.type = 'button';
  // The one place the selected object's preview and kind picker live during the tutorial (bottom right).
  const dock = el('aside', 'demo-dock');
  dock.hidden = true;
  document.body.append(black, skip, dock);
  document.body.classList.add('demo-locked');

  let mode: Mode = 'open';
  let elapsed = 0;
  let last = performance.now();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const look = new THREE.Vector3();

  const aimAt = (pos: readonly number[], lookAt: readonly number[], fov: number, bob = 0, sway = 0) => {
    camera.position.set(pos[0], pos[1] + bob, pos[2] + sway);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    look.set(lookAt[0], lookAt[1], lookAt[2]);
    camera.lookAt(look);
  };

  // ---- modes ----------------------------------------------------------------
  const hooks = {
    camera,
    slots: TUTORIAL_SLOTS,
    yaw: 0, // objects face the tutorial camera, which looks north along -z
    dock,
    frame: (t: number) => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      jukebox.update(t, dt);
      if (mode !== 'intro') return;
      elapsed = Math.min(INTRO_DURATION, elapsed + dt);
      const f = introFrame(elapsed);
      const bob = f.walking && !reduced ? Math.sin(t * 7.5) * 0.022 : 0;
      const sway = f.walking && !reduced ? Math.sin(t * 3.75) * 0.025 : 0;
      aimAt(f.camera, f.lookAt, f.fov, bob, sway);
      black.style.opacity = String(f.black);
      door.leaf.rotation.y = f.doorOpen * Math.PI * 0.52;
      door.light.opacity = f.doorLight;
      door.veil.opacity = f.darkness;
      if (f.phase === 'done') beginTutorial();
    },
  };

  function beginTutorial(): void {
    if (mode !== 'intro') return;
    mode = 'tutorial';
    aimAt(TUTORIAL_VIEW.camera, TUTORIAL_VIEW.lookAt, TUTORIAL_VIEW.fov);
    door.group.visible = false;
    black.style.opacity = '0';
    skip.textContent = 'Skip tutorial';
    checkDone();
  }

  // No instructions: the visitor drives. A moment after the last starter object is on the shelf, the lock lifts.
  let doneTimer = 0;
  function checkDone(): void {
    if (mode !== 'tutorial') return;
    window.clearTimeout(doneTimer);
    if (tutorialDone(store.state)) doneTimer = window.setTimeout(release, 1400);
  }

  /** Lift the lock: the same room, now open (isometric view, orbit, edit tools). */
  function release(): void {
    if (mode === 'open') return;
    window.clearTimeout(doneTimer);
    mode = 'open';
    markIntroSeen(storage);
    black.style.transition = 'opacity 0.45s ease';
    black.style.opacity = '1';
    window.setTimeout(() => {
      view.setDemo({ frame: hooks.frame }); // default camera and slots again; the jukebox keeps animating
      door.group.visible = false;
      box.visible = false;
      document.body.classList.remove('demo-locked');
      skip.remove();
      dock.remove();
      void import('./room-app').then(({ mountEditTools }) => mountEditTools(store, view));
      black.style.opacity = '0';
      window.setTimeout(() => black.remove(), 600);
    }, reduced ? 0 : 480);
  }

  // The dock shows the selected object's name and lets the visitor swap its object kind (the link and text stay fixed).
  let dockKey = '';
  function syncDock(): void {
    const rep = mode === 'tutorial' && store.selectedId
      ? store.state.representations.find((r) => r.id === store.selectedId) : undefined;
    const content = rep && store.content(rep.contentItemId);
    if (!rep || !content) { dock.hidden = true; dockKey = ''; return; }
    dock.hidden = false;
    const key = `${rep.id}:${rep.objectKind}`;
    if (key === dockKey) return;
    dockKey = key;
    dock.replaceChildren(
      el('div', 'demo-dock-title', content.title),
      buildKindInventory({ value: rep.objectKind, onChange: (kind) => store.setKind(rep.id, kind) }),
    );
  }

  store.subscribe(() => { checkDone(); syncDock(); });
  skip.addEventListener('click', release);

  // ---- start ----------------------------------------------------------------
  if (wantIntro && !tutorialDone(store.state)) {
    mode = 'intro';
    view.setDemo(hooks);
    const f = introFrame(0);
    aimAt(f.camera, f.lookAt, f.fov);
    black.style.opacity = '1';
    if (reduced) elapsed = INTRO_DURATION;
  } else {
    // A returning visitor goes straight to their open room (the black overlay fades away on release).
    mode = 'tutorial';
    release();
  }
}
