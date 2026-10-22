import * as THREE from 'three';
import { Store, roomKeys } from '../core/store';
import type { ObjectKind, RoomState } from '../core/types';
import {
  BOX_POS, DOOR_POS, INTRO_DURATION, JUKEBOX_POS, clampLook, introFrame, lookAround, markIntroSeen, tutorialView,
  type View,
} from '../core/intro-timeline';
import { RoomView, type DemoHooks, type DemoTap } from '../views/room';
import { REPO_ROOMS } from '../core/repo-rooms';
import { buildKindInventory } from '../views/kind-picker';
import { buildObject } from '../views/objects';
import { disposeGroup } from '../views/resources';
import { buildJukebox } from './jukebox';
import { buildCardboardBox } from './cardboard-box';
import { mountWalkMode } from './walk-mode';
import {
  DEMO_ROOM_ID, SHELF_SLOTS, TUTORIAL_SLOTS, inBox, migrateDemoRoom, normalizeDemoOwner, seedDemoRoom, tutorialDone,
} from './demo-room';
import { EYE_HEIGHT, poseFromLookAt, type WalkPose } from '../core/walk';

// The demo is one real room (the same RoomView the sandbox uses). Every visit, a scripted walk-in plays inside it and
// ends on a locked tutorial view of the shelf: the visitor unpacks the starter objects from a cardboard box, looks at
// them and sets them on the shelf. Finishing (or skipping) lifts the lock: the camera drops to standing height and
// they walk the room in first person. The isometric room with edit tools ("free demo mode") is not reachable yet.

type Mode = 'intro' | 'tutorial' | 'walk';

/** Drag-to-look sensitivity in the tutorial, radians per pixel. */
const LOOK_SENS = 0.0035;
/**
 * Where the held object stands, in camera space (its base; it grows upward): low and left of centre, under the box
 * and clear of the shelf and bench spots above it and the dock on the right.
 */
const HANDS = new THREE.Vector3(-0.14, -0.5, -1.1);
const HELD_SCALE = 0.4;
const POP_S = 0.45;
/** Where the visitor stands once the tutorial is over: back from the bench, facing the shelf. */
const STAND: WalkPose = { x: 8.3, y: EYE_HEIGHT, z: 4.8, yaw: 0, pitch: -0.12 };

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

export function startDemo(container: HTMLElement, storage: Storage | null): void {
  // ---- the visitor's room -------------------------------------------------
  let initial: RoomState;
  try {
    initial = migrateDemoRoom(Store.loadSaved(DEMO_ROOM_ID) ?? seedDemoRoom());
  } catch (error) {
    // Never start a fresh room over an unreadable save.
    const warning = el('p', 'demo-error', error instanceof Error ? error.message : String(error));
    warning.setAttribute('role', 'alert');
    container.append(warning);
    console.error('demo room', roomKeys(DEMO_ROOM_ID).main, error);
    return;
  }
  if (normalizeDemoOwner(initial)) {
    try { localStorage.setItem(roomKeys(DEMO_ROOM_ID).main, JSON.stringify(initial)); }
    catch { /* storage may be blocked/full; the repaired label still appears for this session */ }
  }
  const store = new Store(initial, DEMO_ROOM_ID);
  // `/` is always the demo and always plays the walk-in. Partial progress is kept (placed starters stay put, the rest
  // wait in the box); only a finished room starts over with a full box.
  if (tutorialDone(store.state)) store.replaceState(seedDemoRoom());

  // The in-VR room picker needs the committed rooms here too: a headset visitor has no desktop toolbar.
  const view = new RoomView(container, store, REPO_ROOMS);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

  // ---- scenery outside the saved room -------------------------------------
  const jukebox = buildJukebox();
  jukebox.group.position.set(...JUKEBOX_POS);
  jukebox.group.rotation.y = -Math.PI / 2; // outside the room, its face toward the room (west)
  jukebox.group.scale.setScalar(0.6);
  jukebox.setGlow(0.4);
  jukebox.setOpacity(0.55); // a little see-through so it does not pull the eye
  const box = buildCardboardBox(inBox(seedDemoRoom()).length);
  box.group.position.set(...BOX_POS);
  box.setFill(inBox(store.state).length);
  const door = buildDoor();
  view.addToScene(jukebox.group, box.group, door.group);

  // ---- overlay --------------------------------------------------------------
  const black = el('div', 'demo-black');
  const skip = el('button', 'demo-skip', 'Skip intro');
  skip.type = 'button';
  // The one place the selected object's preview and kind picker live during the tutorial (bottom right).
  const dock = el('aside', 'demo-dock');
  dock.hidden = true;
  const hint = el('p', 'demo-hint', 'Place the object down');
  hint.setAttribute('role', 'status');
  const dev = el('a', 'demo-dev', 'dev');
  dev.href = `${import.meta.env.BASE_URL}dev/`;
  dev.title = 'Dev sandbox';
  // Placeholder: what adding objects does is not decided yet.
  const add = el('button', 'demo-add', '+');
  add.type = 'button';
  add.setAttribute('aria-label', 'Add objects');
  add.hidden = true;
  document.body.append(black, skip, dock, hint, dev, add);
  document.body.classList.add('demo-locked');

  let mode: Mode = 'intro';
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

  // The tutorial framing follows the screen shape (it is solved for a phone; wider screens see more around it).
  let framedAspect = NaN;
  let framing: View = tutorialView(1);
  const currentView = (): View => {
    const aspect = view.canvas.clientWidth / (view.canvas.clientHeight || 1);
    if (aspect !== framedAspect) { framedAspect = aspect; framing = tutorialView(aspect); }
    return framing;
  };

  // ---- tutorial: drag to look a little --------------------------------------
  let turn = { yaw: 0, pitch: 0 };
  let drag: { id: number; x: number; y: number } | null = null;
  view.canvas.addEventListener('pointerdown', (e) => { if (mode === 'tutorial') drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  view.canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || mode !== 'tutorial') return;
    // Grab-the-world, like walking: drag right turns left, drag down tilts up.
    turn = clampLook(turn.yaw + (e.clientX - drag.x) * LOOK_SENS, turn.pitch + (e.clientY - drag.y) * LOOK_SENS);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const endDrag = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; };
  view.canvas.addEventListener('pointerup', endDrag);
  view.canvas.addEventListener('pointercancel', endDrag);

  // ---- tutorial: the object in the visitor's hands -------------------------
  // RoomView only draws objects that have a slot, so the one just taken out of the box is drawn here.
  let held: { repId: string; kind: ObjectKind; group: THREE.Group; from: THREE.Vector3; at: number } | null = null;
  const handsPos = new THREE.Vector3();
  const boxTop = new THREE.Vector3(BOX_POS[0], 0.55, BOX_POS[2]);

  /** The selected starter while it is out of the box but not on a slot yet. */
  const holding = (): string | null => {
    const id = store.selectedId;
    return id && !store.slotOf(id) && store.state.representations.some((r) => r.id === id) ? id : null;
  };

  function dropHeld(): void {
    if (!held) return;
    view.removeFromScene(held.group);
    disposeGroup(held.group);
    held = null;
  }

  function syncHeld(t: number): void {
    const id = mode === 'tutorial' ? holding() : null;
    const rep = id ? store.state.representations.find((r) => r.id === id) : undefined;
    if (!id || !rep) { dropHeld(); return; }
    if (!held || held.repId !== id || held.kind !== rep.objectKind) {
      const popping = !held || held.repId !== id;
      dropHeld();
      const group = buildObject(rep.objectKind, store.content(rep.contentItemId));
      view.addToScene(group);
      held = { repId: id, kind: rep.objectKind, group, from: boxTop.clone(), at: popping && !reduced ? t : -Infinity };
    }
    camera.updateMatrixWorld();
    handsPos.copy(HANDS).applyMatrix4(camera.matrixWorld);
    const k = Math.min(1, (t - held.at) / POP_S);
    const e = k * k * (3 - 2 * k);
    const g = held.group;
    g.position.lerpVectors(held.from, handsPos, e);
    g.position.y += Math.sin(Math.PI * e) * 0.5 + (reduced ? 0 : Math.sin(t * 2.2) * 0.012);
    g.scale.setScalar(1.6 * HELD_SCALE * (0.35 + 0.65 * e));
    g.quaternion.copy(camera.quaternion);
    if (!reduced) g.rotateY(Math.sin(t * 0.9) * 0.35);
  }

  let hintTimer = 0;
  function showHint(text = 'Place the object down', ms = 1600): void {
    hint.textContent = text;
    hint.classList.add('demo-hint-on');
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('demo-hint-on'), ms);
  }

  /** Tutorial taps: the box hands out one object at a time, and it has to be put down before the next one. */
  function onTap(tap: DemoTap): boolean {
    if (mode !== 'tutorial') return mode === 'intro';
    if (holding()) {
      if (tap.slotId) return false;
      showHint();
      return true;
    }
    const remaining = inBox(store.state).filter((id) => id !== store.selectedId);
    if (remaining.length && box.hit(tap.raycaster)) {
      store.select(remaining[Math.floor(Math.random() * remaining.length)]);
      box.pop();
      return true;
    }
    return false;
  }

  // ---- modes ----------------------------------------------------------------
  const hooks: DemoHooks = {
    camera,
    slots: TUTORIAL_SLOTS,
    yaw: 0, // objects face the tutorial camera, which looks north along -z
    dock,
    keepSelectionOnPlace: true,
    liftSelected: false,
    tap: onTap,
    frame: (t: number) => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      jukebox.update(t, dt);
      box.update(t, dt);
      if (mode === 'intro') {
        elapsed = Math.min(INTRO_DURATION, elapsed + dt);
        const f = introFrame(elapsed, currentView());
        const bob = f.walking && !reduced ? Math.sin(t * 7.5) * 0.022 : 0;
        const sway = f.walking && !reduced ? Math.sin(t * 3.75) * 0.025 : 0;
        aimAt(f.camera, f.lookAt, f.fov, bob, sway);
        black.style.opacity = String(f.black);
        door.leaf.rotation.y = f.doorOpen * Math.PI * 0.52;
        door.light.opacity = f.doorLight;
        door.veil.opacity = f.darkness;
        if (f.phase === 'done') beginTutorial();
        return;
      }
      if (mode !== 'tutorial') return;
      if (!drag) {
        const k = reduced ? 1 : 1 - Math.exp(-dt * 3);
        turn = { yaw: turn.yaw * (1 - k), pitch: turn.pitch * (1 - k) };
      }
      const v = currentView();
      aimAt(v.camera, lookAround(v, turn.yaw, turn.pitch), v.fov);
      box.cue(!holding() && inBox(store.state).length > 0);
      syncHeld(t);
    },
  };

  function beginTutorial(): void {
    if (mode !== 'intro') return;
    mode = 'tutorial';
    door.group.visible = false;
    black.style.opacity = '0';
    skip.textContent = 'Skip tutorial';
    checkDone();
  }

  // No instructions: the visitor drives. Once the last starter is on the shelf the box goes, then the lock lifts.
  let doneTimer = 0;
  let boxGone = false;
  function checkDone(): void {
    if (mode !== 'tutorial') return;
    window.clearTimeout(doneTimer);
    if (tutorialDone(store.state)) {
      boxGone = true;
      box.vanish();
      doneTimer = window.setTimeout(release, 1400);
    }
  }

  /** Nothing is lost on Skip: whatever is still in the box or in hand goes onto a free bench or shelf spot. */
  function unpackRest(): void {
    for (const id of inBox(store.state)) {
      const free = SHELF_SLOTS.find((slot) => !store.repAt(slot));
      if (free) store.place(id, free);
    }
  }

  /** Walk the room from wherever the tutorial camera is: it glides down to standing height, then the visitor is free. */
  function startWalking(): void {
    camera.updateMatrixWorld();
    const p = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const from = poseFromLookAt([p.x, p.y, p.z], [p.x + dir.x, p.y + dir.y, p.z + dir.z]);
    mountWalkMode(view, store, {
      overview: false,
      start: { from, to: STAND, fov: camera.fov },
      hooks: { frame: hooks.frame, yaw: 0, keepSelectionOnPlace: true, liftSelected: false },
      say: (text, ms) => showHint(text, ms),
    });
    add.hidden = false;
  }

  /** Lift the lock and stay in first person. Free demo mode (overview, edit tools in `room-app.ts`) comes later. */
  function release(): void {
    if (mode === 'walk') return;
    const fromIntro = mode === 'intro';
    window.clearTimeout(doneTimer);
    mode = 'walk';
    markIntroSeen(storage);
    dropHeld();
    unpackRest();
    store.select(null);
    skip.remove();
    dock.remove();
    hint.classList.remove('demo-hint-on');
    door.group.visible = false;
    if (fromIntro) box.group.visible = false;
    else if (!boxGone) box.vanish();
    boxGone = true;
    if (!fromIntro) {
      startWalking();
      return;
    }
    // Skipped mid walk-in: cut through black to the tutorial view, then walk from there.
    black.style.transition = 'opacity 0.45s ease';
    black.style.opacity = '1';
    window.setTimeout(() => {
      const v = currentView();
      aimAt(v.camera, lookAround(v, 0, 0), v.fov);
      door.veil.opacity = 0;
      startWalking();
      black.style.opacity = '0';
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

  store.subscribe(() => {
    box.setFill(inBox(store.state).length - (holding() ? 1 : 0));
    checkDone();
    syncDock();
  });
  skip.addEventListener('click', release);

  // ---- start ----------------------------------------------------------------
  view.setDemo(hooks);
  const f = introFrame(0, currentView());
  aimAt(f.camera, f.lookAt, f.fov);
  black.style.opacity = '1';
  if (reduced) elapsed = INTRO_DURATION;
}
