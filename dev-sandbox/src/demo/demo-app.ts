import * as THREE from 'three';
import { Store, roomKeys } from '../core/store';
import type { ObjectKind, RoomState } from '../core/types';
import {
  BOX_POS, DOOR_POS, INTRO_DURATION, JUKEBOX_POS, PHASE_STARTS, ROOM_EAST, SAVE_POINT_POS, SAVE_POINT_REACH, clampLook, introFrame, lookAround,
  markIntroSeen, markSeq2Done, seq2Done, tutorialView, type View,
} from '../core/intro-timeline';
import { RoomView, type DemoHooks, type DemoTap } from '../views/room';
import { REPO_ROOMS, REPO_ROOM_MAP } from '../core/repo-rooms';
import { devRoomObjects } from '../core/random-drop';
import { randomPortalDrop } from '../core/room-amenities';
import { buildKindInventory } from '../views/kind-picker';
import { buildObject } from '../views/objects';
import { disposeGroup } from '../views/resources';
import { buildJukebox } from './jukebox';
import { buildCardboardBox } from './cardboard-box';
import { buildSavePoint } from './save-point';
import { loadCamera, mountDemoHud, mountJukeboxPanel, mountSavePointPanel, saveCamera, type CameraChoice, type DemoHud, type SavePointPanel } from './demo-hud';
import type { DemoEditor } from './room-app';
import type { SoundtrackPlayer } from '../views/soundtrack';
import { mountWalkMode, type WalkHandle } from './walk-mode';
import {
  DEMO_ROOM_ID, SHELF_SLOTS, TUTORIAL_SLOTS, inBox, migrateDemoRoom, normalizeDemoOwner, prepareIntroReplayRoom,
  seedDemoRoom, tutorialDone, vacuumTargets,
} from './demo-room';
import { EYE_HEIGHT, poseFromLookAt, type WalkPose } from '../core/walk';

// The demo is one real room (the same RoomView the sandbox uses). Every visit, a scripted walk-in plays inside it and
// ends on a locked tutorial view of the shelf: the visitor unpacks the starter objects from a cardboard box, looks at
// them and sets them on the shelf. Finishing (or skipping) lifts the lock: the camera drops to standing height and
// they walk the room in first person ("tactile"). Their goal now is the save point across the room: they get there by
// walking or by switching the Camera to "dollhouse" (the isometric room). The save point (the "portal") adds links,
// files, bookmarks or a random drop from the devs' rooms. Objects can be picked up and moved anywhere. Using the portal
// once ends sequence 2: Edit room, the jukebox, and free mode (Rooms, photo, mute while music plays).
// Exit tutorial jumps straight to free mode. A later visit still walks through the door, then lands in free mode.

type Mode = 'intro' | 'tutorial' | 'walk';

/** Drag-to-look sensitivity in the tutorial, radians per pixel. */
const LOOK_SENS = 0.0042;
/**
 * Where the held object stands, in camera space (its base; it grows upward): low and left of centre, under the box
 * and clear of the shelf and bench spots above it and the dock on the right.
 */
const HANDS = new THREE.Vector3(-0.14, -0.5, -1.1);
const HELD_SCALE = 0.4;
const POP_S = 0.45;
/** Where the visitor stands once the tutorial is over: back from the bench, facing the shelf. */
const STAND: WalkPose = { x: 8.3, y: EYE_HEIGHT, z: 4.8, yaw: 0, pitch: -0.12 };
/** The goal line shows this long after the tutorial ends even if the visitor never looks toward the save point. */
const GOAL_AFTER_MS = 6000;
/** The middle of the room's floor plan (x, z): a random drop turns the visitor toward it. */
const ROOM_MIDDLE = [ROOM_EAST / 2, 3.6] as const;
/** Same stand as after the tutorial, looking into the room (west) instead of at the shelf. */
const RETURN_STAND: WalkPose = {
  ...STAND,
  yaw: poseFromLookAt([STAND.x, STAND.y, STAND.z], [ROOM_MIDDLE[0], STAND.y, ROOM_MIDDLE[1]]).yaw,
};
const JUKEBOX_SCALE = 0.6;
const JUKEBOX_FADE_S = 3;
const FLY_IN = { delay: 0.32, stagger: 0.1, duration: 0.85 };

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
  let shouldPersist = normalizeDemoOwner(initial);
  if (initial.surfaces === undefined) {
    initial = { ...initial, surfaces: { floor: { preset: 'stone' } } };
    shouldPersist = true;
  }
  const returningFree = seq2Done(storage);
  /** Return visits stop just inside the door (looking into the room) instead of turning to the shelf. */
  const introEnd = returningFree ? PHASE_STARTS.setpiece : INTRO_DURATION;
  // `/` always plays the walk-in. Sequence 2 unfinished: a finished shelf tutorial puts starters back in the box.
  // Sequence 2 finished: keep the room as it was and skip the shelf after the door.
  if (tutorialDone(initial) && !returningFree) {
    initial = prepareIntroReplayRoom(initial);
    shouldPersist = true;
  }
  if (shouldPersist) {
    try { localStorage.setItem(roomKeys(DEMO_ROOM_ID).main, JSON.stringify(initial)); }
    catch { /* storage may be blocked/full; keep repaired/replayed state for this session */ }
  }
  const store = new Store(initial, DEMO_ROOM_ID);

  // The in-VR room picker needs the committed rooms here too: a headset visitor has no desktop toolbar.
  const view = new RoomView(container, store, REPO_ROOMS);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

  // ---- scenery outside the saved room -------------------------------------
  const jukebox = buildJukebox();
  jukebox.group.position.set(...JUKEBOX_POS);
  jukebox.group.rotation.y = -Math.PI / 2; // outside the room, its face toward the room (west)
  jukebox.group.scale.setScalar(JUKEBOX_SCALE);
  jukebox.group.visible = false; // it appears when sequence 2 is done (free mode)
  const box = buildCardboardBox(inBox(seedDemoRoom()).length);
  box.group.position.set(...BOX_POS);
  box.setFill(inBox(store.state).length);
  if (returningFree) box.group.visible = false;
  const door = buildDoor();
  const savePoint = buildSavePoint();
  savePoint.group.position.set(...SAVE_POINT_POS);
  const desktopScenery = new THREE.Group();
  desktopScenery.userData.xrDesktopOnly = true;
  desktopScenery.add(jukebox.group, box.group, door.group, savePoint.group);
  view.addToScene(desktopScenery);

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
  // Dev shortcut: straight to the save point part with the starters already on the shelf (still in the tutorial).
  const skipSeq = el('button', 'demo-skip-seq', 'skip seq 1');
  skipSeq.type = 'button';
  skipSeq.title = 'Skip the walk-in and unpacking (starters go on the shelf)';
  document.body.append(black, skip, dock, hint, dev, skipSeq);
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
  view.canvas.addEventListener('pointerdown', (e) => { if (mode === 'tutorial' && e.button === 0) drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
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
    // Only the tutorial holds an object in front of the camera. Walking, things stay on their spots until moved.
    const eye = mode === 'tutorial' ? camera : null;
    const id = eye ? holding() : null;
    const rep = id ? store.state.representations.find((r) => r.id === id) : undefined;
    if (!eye || !id || !rep) { dropHeld(); return; }
    if (!held || held.repId !== id || held.kind !== rep.objectKind) {
      const popping = !held || held.repId !== id;
      dropHeld();
      const group = buildObject(rep.objectKind, store.content(rep.contentItemId));
      view.addToScene(group);
      held = { repId: id, kind: rep.objectKind, group, from: boxTop.clone(), at: popping && !reduced ? t : -Infinity };
    }
    eye.updateMatrixWorld();
    handsPos.copy(HANDS).applyMatrix4(eye.matrixWorld);
    const k = Math.min(1, (t - held.at) / POP_S);
    const e = k * k * (3 - 2 * k);
    const g = held.group;
    g.position.lerpVectors(held.from, handsPos, e);
    g.position.y += Math.sin(Math.PI * e) * 0.5 + (reduced ? 0 : Math.sin(t * 2.2) * 0.012);
    g.scale.setScalar(1.6 * HELD_SCALE * (0.35 + 0.65 * e));
    g.quaternion.copy(eye.quaternion);
    if (!reduced) g.rotateY(Math.sin(t * 0.9) * 0.35);
  }

  let hintTimer = 0;
  function showHint(text = 'Place the object down', ms = 1600): void {
    hud?.hideGoal(); // both sit at the top of the screen
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
    // Same facing as the dollhouse (π/4). A north-facing yaw here made return visits snap every object 45° when free mode started.
    dock,
    keepSelectionOnPlace: true,
    liftSelected: false,
    compactPreview: true,
    tap: onTap,
    frame: (t: number) => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      jukebox.update(t, dt);
      fadeJukebox(t);
      box.update(t, dt);
      savePoint.update(t, dt);
      if (mode === 'walk') { watchForSavePoint(); return; }
      if (skippingIntro) return;
      if (mode === 'intro') {
        elapsed = Math.min(introEnd, elapsed + dt);
        const f = introFrame(elapsed, currentView(), framedAspect);
        const bob = f.walking && !reduced ? Math.sin(t * 7.5) * 0.022 : 0;
        const sway = f.walking && !reduced ? Math.sin(t * 3.75) * 0.025 : 0;
        aimAt(f.camera, f.lookAt, f.fov, bob, sway);
        black.style.opacity = String(f.black);
        door.leaf.rotation.y = f.doorOpen * Math.PI * 0.52;
        door.light.opacity = f.doorLight;
        door.veil.opacity = f.darkness;
        if (elapsed >= introEnd) beginTutorial();
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

  /** Skip the walk-in: cut through black to the tutorial (or, on a return visit, to free mode just inside the door). */
  let skippingIntro = false;
  function skipIntro(): void {
    if (mode !== 'intro' || skippingIntro) return;
    skippingIntro = true;
    black.style.transition = 'opacity 0.45s ease';
    black.style.opacity = '1';
    window.setTimeout(() => {
      elapsed = introEnd;
      skippingIntro = false;
    }, reduced ? 0 : 480);
  }

  function beginTutorial(): void {
    if (mode !== 'intro') return;
    mode = 'tutorial';
    door.group.visible = false;
    black.style.opacity = '0';
    if (returningFree) {
      skip.remove();
      skipSeq.remove();
      release();
      goFree();
      return;
    }
    skip.textContent = 'Skip tutorial';
    checkDone();
  }

  // No instructions: the visitor drives. Once the last starter is on the shelf the box goes, then the lock lifts.
  let doneTimer = 0;
  let boxGone = returningFree;
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

  // ---- after the tutorial (sequence 2): the portal, moving things, the camera choice; then free mode ---------------
  let walk: WalkHandle | null = null;
  let hud: DemoHud | null = null;
  let free = false;
  let goalShown = false;
  const dropPool = devRoomObjects(REPO_ROOM_MAP);
  const savePanel: SavePointPanel = mountSavePointPanel(store, (text, ms) => showHint(text, ms), randomDrop, portalUsed, setVacuumHold);
  const jukeboxPanel: SavePointPanel = mountJukeboxPanel(store, () => jukebox.setMouthOpen(0), () => music?.startFromGesture());
  let music: SoundtrackPlayer | null = null;
  const portalMouth = new THREE.Vector3();
  let jukeboxFadeDelay = 0;

  /**
   * A handful of the devs' objects sprout out of the save point and fly to random free spots. The visitor turns most
   * of the way toward the middle of the room so they see them land.
   */
  function randomDrop(): void {
    const { picked, placed } = randomPortalDrop(store, dropPool);
    if (!placed.length) {
      showHint(picked.length ? 'Room is full, visit portal for spring cleaning.' : 'Nothing new to drop in', 2200);
      return;
    }
    walk?.lookToward(ROOM_MIDDLE[0], ROOM_MIDDLE[1], 1, 1.05);
    view.flyIn(placed, portalMouth.copy(savePoint.center).setY(savePoint.center.y + 1.1), FLY_IN);
    // Fade the jukebox in after the last object has landed.
    jukeboxFadeDelay = FLY_IN.delay + Math.max(0, placed.length - 1) * FLY_IN.stagger + FLY_IN.duration;
    // First drop also unlocks free mode (editor, jukebox); wait a frame so that load does not eat the fly-out.
    requestAnimationFrame(() => portalUsed());
  }

  let vacuumHold = false;
  let vacuuming: string | null = null;
  let pointerVacuum = false;
  let vacuumBatch = false;
  let vacuumKick: ReturnType<typeof setTimeout> | null = null;
  const VACUUM_WINDUP_MS = 320;

  function setVacuumHold(on: boolean): void {
    if (on) {
      pointerVacuum = true;
      startVacuum();
      return;
    }
    if (!pointerVacuum) return;
    pointerVacuum = false;
    stopVacuum();
  }

  function startVacuum(): void {
    if (!free) return;
    if (!vacuumHold) {
      store.beginBatch();
      vacuumBatch = true;
    }
    vacuumHold = true;
    showHint('Hold to keep clearing…', 2800);
    if (vacuuming || vacuumKick !== null) return;
    if (reduced) {
      suckNext();
      return;
    }
    vacuumKick = setTimeout(() => {
      vacuumKick = null;
      suckNext();
    }, VACUUM_WINDUP_MS);
  }

  function stopVacuum(): void {
    vacuumHold = false;
    if (vacuumKick !== null) {
      clearTimeout(vacuumKick);
      vacuumKick = null;
    }
    if (!vacuumBatch) return;
    vacuumBatch = false;
    store.endBatch();
  }

  function nearestVacuum(): string | null {
    const mouth = savePoint.center;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of vacuumTargets(store.state)) {
      if (id === vacuuming) continue;
      const slotId = store.slotOf(id);
      const pos = slotId ? store.layout.slots.find((s) => s.id === slotId)?.pos : undefined;
      const d = pos ? Math.hypot(pos[0] - mouth.x, pos[2] - mouth.z) : 0;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  function suckNext(): void {
    if (!vacuumHold || vacuuming) return;
    const id = nearestVacuum();
    if (!id) {
      vacuumHold = false;
      showHint('The first objects stay. The rest went back into the portal.', 2400);
      return;
    }
    vacuuming = id;
    if (store.selectedId) store.select(null);
    const to = portalMouth.copy(savePoint.center).setY(savePoint.center.y + 1.1);
    const finish = (): void => {
      if (store.state.representations.some((r) => r.id === id)) store.stash(id);
      vacuuming = null;
      if (vacuumHold) suckNext();
    };
    if (reduced) {
      finish();
      return;
    }
    view.flyOut(id, to, 0.48, finish);
  }

  const typing = (e: Event): boolean => {
    const t = e.target;
    return t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  };
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (e.repeat || typing(e) || !free) return;
    e.preventDefault();
    savePanel.close();
    startVacuum();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.key === ' ') stopVacuum();
  });
  window.addEventListener('pointerup', () => setVacuumHold(false));
  window.addEventListener('pointercancel', () => setVacuumHold(false));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const t = e.target;
    if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (!moving && !store.selectedId && !store.holding) return;
    dropPickup();
  });

  // ---- progression: the first portal use ends sequence 2 (Edit room, jukebox, free mode) ----
  let editor: Promise<DemoEditor> | null = null;
  const loadEditor = (): Promise<DemoEditor> => {
    document.body.classList.add('demo-edit-tools');
    return (editor ??= import('./room-app').then(({ mountEditor }) => mountEditor(store)));
  };

  function portalUsed(): void {
    goFree();
  }

  function unlockEditRoom(): void {
    void loadEditor();
    hud?.showEditRoom(() => { void loadEditor().then((e) => e.openEditor()); });
    showJukebox();
    void import('./room-app').then(({ mountMusic }) => { music ??= mountMusic(store); });
  }

  /** Sequence 2 is done (first portal use, or Exit tutorial): Rooms, photo and mute come in. */
  function goFree(): void {
    if (free) return;
    free = true;
    markSeq2Done(storage);
    unlockEditRoom();
    hud?.free();
    document.body.classList.add('demo-free');
    savePanel.showClean();
    void import('./room-app').then(({ mountMusic, mountMute, mountPhoto }) => {
      music ??= mountMusic(store);
      mountMute(music);
      mountPhoto(view);
    });
  }

  let jukeboxFadeAt = -1;
  function showJukebox(): void {
    if (jukeboxFadeAt !== -1 || jukebox.group.visible) return;
    jukebox.group.scale.setScalar(JUKEBOX_SCALE);
    if (returningFree || reduced) {
      jukebox.group.visible = true;
      jukebox.setGlow(0.6);
      jukebox.setOpacity(1);
      jukeboxFadeAt = -2;
      return;
    }
    jukebox.group.visible = false;
    jukebox.setGlow(0);
    jukebox.setOpacity(0);
    jukeboxFadeAt = NaN; // starts on the next frame, after jukeboxFadeDelay
  }
  function fadeJukebox(t: number): void {
    if (jukeboxFadeAt === -2) return;
    if (Number.isNaN(jukeboxFadeAt)) jukeboxFadeAt = t + jukeboxFadeDelay;
    if (jukeboxFadeAt < 0 || t < jukeboxFadeAt) return;
    jukebox.group.visible = true;
    const k = Math.min(1, (t - jukeboxFadeAt) / JUKEBOX_FADE_S);
    jukebox.setOpacity(k);
    jukebox.setGlow(0.6 * k);
    if (k >= 1) jukeboxFadeAt = -2;
  }

  const seen = new THREE.Vector3();

  /** The goal shows the first time the save point comes into view while walking, or after GOAL_AFTER_MS anyway. */
  function watchForSavePoint(): void {
    if (goalShown || !walk || !hud || walk.mode !== 'walk') return;
    const ndc = seen.copy(savePoint.center).project(walk.camera);
    if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 0.8 || Math.abs(ndc.y) > 0.9) return;
    showGoal();
  }
  function showGoal(): void {
    if (goalShown || !hud) return;
    goalShown = true;
    hud.showGoal();
  }

  /**
   * How far the walking visitor stands from a point, across the floor only: height never counts, and neither does the
   * step back (and up) that zooming out adds.
   */
  const reachTo = (pos: readonly number[]): number => {
    const eye = walk!.camera.position;
    return Math.max(0, Math.hypot(eye.x - pos[0], eye.z - pos[2]) - walk!.steppedBack);
  };

  /** Did this tap land on the thing (and not on something in front of it)? */
  function tapped(tap: DemoTap, hit: (raycaster: THREE.Raycaster) => number | null): boolean {
    if (tap.repId) return false;
    const d = hit(tap.raycaster);
    return d !== null && (!tap.room || tap.room.distance >= d);
  }

  /**
   * Taps on the portal or the jukebox never walk the visitor there. Walking, they open from within reach; from farther
   * a line says to come closer (that is how walking gets learned). From the dollhouse they open from anywhere.
   */
  function openFromAfar(name: string, pos: readonly number[], open: () => void): true {
    if (walk!.mode === 'walk' && reachTo(pos) > SAVE_POINT_REACH) {
      showHint(free ? `Too far. Move closer to get to the ${name}.` : `Too far. Move closer, or switch camera, to get to the ${name}.`, 2400);
      return true;
    }
    moving = false;
    store.select(null);
    open();
    return true;
  }

  /** Second tap on the same object: glowing pads, still on its spot. First tap is preview only. */
  let moving = false;
  /** First three objects tapped this visit get a "Double tap to pick up" line. */
  const pickHinted = new Set<string>();

  function dropPickup(): void {
    moving = false;
    if (store.holding || store.selectedId) store.select(null);
    view.refresh();
  }

  /**
   * Moving things: tap an object (card only), tap it again to move it (pads show, it stays put), then tap an empty
   * glowing spot. Tapping another object only shows that object's card — it never swaps.
   */
  function onObjectTap(tap: DemoTap): boolean {
    if (tap.repId) {
      if (tap.repId === store.selectedId && store.slotOf(tap.repId)) {
        moving = true;
        view.refresh();
        return true;
      }
      moving = false;
      if (pickHinted.size < 3 && !pickHinted.has(tap.repId)) {
        pickHinted.add(tap.repId);
        showHint('Double tap to pick up', 1800);
      }
      return false;
    }
    const selected = store.selectedId;
    const from = selected ? store.slotOf(selected) : undefined;
    if (moving && selected && from && tap.slotId && tap.slotId !== from) {
      if (store.repAt(tap.slotId)) return true;
      store.place(selected, tap.slotId);
      dropPickup();
      return true;
    }
    if (moving) {
      dropPickup();
      return true;
    }
    return false;
  }

  function onWalkTap(tap: DemoTap): boolean {
    if (!walk) return false;
    if (!store.holding && tapped(tap, savePoint.hit)) {
      return openFromAfar('portal', SAVE_POINT_POS, () => { hud?.goalMet(); savePanel.open(); });
    }
    if (!store.holding && tapped(tap, jukebox.hit)) {
      return openFromAfar('jukebox', JUKEBOX_POS, () => {
        jukebox.setMouthOpen(0.5);
        jukeboxPanel.open();
        if (music && music.soundState !== 'playing' && music.soundState !== 'paused') music.startFromGesture();
      });
    }
    return onObjectTap(tap);
  }

  /** Walk the room from wherever the tutorial camera is: it glides down to standing height, then the visitor is free. */
  function startWalking(): void {
    camera.updateMatrixWorld();
    const p = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const from = poseFromLookAt([p.x, p.y, p.z], [p.x + dir.x, p.y + dir.y, p.z + dir.z]);
    walk = mountWalkMode(view, store, {
      overview: false, // the Camera choice switches to the dollhouse; no Overview button or Esc
      overviewTapWalks: false,
      start: { from, to: returningFree ? RETURN_STAND : STAND, fov: camera.fov },
      hooks: {
        frame: hooks.frame, keepSelectionOnPlace: false, liftSelected: false, compactPreview: true, tap: onWalkTap,
        slotMarkers: () => moving,
      },
      say: (text, ms) => showHint(text, ms),
      afterFrame: syncHeld,
    });
    const cameraChoice: CameraChoice = loadCamera(storage);
    hud = mountDemoHud({
      dev,
      camera: cameraChoice,
      onCamera: (choice) => {
        saveCamera(storage, choice);
        dropPickup();
        choice === 'dollhouse' ? walk?.toOverview() : walk?.toWalk();
      },
      onExit: goFree,
    });
    if (cameraChoice === 'dollhouse') walk.toOverview();
    if (returningFree) goalShown = true;
    else window.setTimeout(showGoal, GOAL_AFTER_MS);
  }

  /** Lift the lock and walk in first person (tactile): sequence 2. */
  function release(): void {
    if (mode !== 'tutorial') return;
    window.clearTimeout(doneTimer);
    mode = 'walk';
    markIntroSeen(storage);
    dropHeld();
    unpackRest();
    store.select(null);
    skip.remove();
    skipSeq.remove();
    dock.remove();
    hint.classList.remove('demo-hint-on');
    door.group.visible = false;
    if (!boxGone) box.vanish();
    boxGone = true;
    startWalking();
  }

  // The dock lets the visitor swap the selected object's kind (the link and text stay fixed); its name is on the card.
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
    dock.replaceChildren(buildKindInventory({ value: rep.objectKind, onChange: (kind) => store.setKind(rep.id, kind) }));
  }

  store.subscribe(() => {
    if (!store.selectedId) moving = false;
    box.setFill(inBox(store.state).length - (holding() ? 1 : 0));
    checkDone();
    syncDock();
  });
  skip.addEventListener('click', () => (mode === 'intro' ? skipIntro() : release()));
  skipSeq.addEventListener('click', () => {
    if (mode === 'intro') {
      elapsed = introEnd;
      skippingIntro = false;
      beginTutorial();
      if (!returningFree) {
        const v = currentView();
        aimAt(v.camera, lookAround(v, 0, 0), v.fov);
      }
    }
    release();
  });

  // ---- start ----------------------------------------------------------------
  view.setDemo(hooks);
  const f = introFrame(0, currentView(), framedAspect);
  aimAt(f.camera, f.lookAt, f.fov);
  black.style.opacity = '1';
  if (reduced) elapsed = introEnd;
}
