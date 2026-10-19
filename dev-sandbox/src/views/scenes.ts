import type { Store } from '../core/store';
import { listSceneIds, loadScene, createScene, deleteScene, saveScene, setActiveSceneId } from '../core/scene-store';
import {
  MAX_SCENE_ZOOM, SHOT_EASINGS, SHOT_TYPES, newShot,
  type CameraState, type Scene, type Shot, type ShotEasing, type ShotType,
} from '../core/scenes';
import { RoomView } from './room';
import type { RepoRoom } from './menu';
import { openContentEditor } from './content-editor';
import { buildKindInventory } from './kind-picker';
import { OBJECT_LABELS } from '../core/types';
import {
  FIREPLACE_X_RANGE, LOUNGE_DEFAULT_POS, NEIGHBORHOOD_CENTER, cloneFixtures, newAvatar, newFireplace, newLoungeChair,
  newNeighborhood, type Fixture,
} from '../core/fixtures';
import { THEMES } from '../core/themes';
import { CapturePanel } from './capture';
import { SHOT4_LINKS, MAGIC_TOYS, planShotPlacements } from '../core/shot-objects';
import { ShotPlayer } from './shot-player';
import { planFling, planHeapLaunch, motionLength, type Flight } from '../core/motion';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...kids);
  return node;
}

const cloneFireplace = (f: Fixture): Fixture => JSON.parse(JSON.stringify(f)) as Fixture;

export interface ScenesViewOptions {
  /** Opens the normal-mode room editor panel (Edit room). */
  onEditRoom?: () => void;
}

type CamSlider = 'orbit' | 'tilt' | 'zoom' | 'panX' | 'panY' | 'panZ';

// Pan sliders move the point the camera looks at, in room coordinates (see layout.ts: x along the right wall,
// z along the left wall, y up). Wide enough to frame the outside of the room, e.g. a close-up of one corner.
const PAN_RANGE = { x: [-4, 15], y: [-2, 8], z: [-4, 12] } as const;

/**
 * Scenes mode: a simplified, separate version of the room for composing trailer shots.
 *
 * Layout (nothing overlaps the 3D window):
 *   top HUD bar:  [scene name]   [Exit Scene Mode] [Edit room]
 *   left:         scene list
 *   center:       the room, objects only (they never move when selected, they just glow)
 *   right:        selected-object actions (Edit / kind / Pick up / Stash / Delete / rotation) + camera + save
 */
export class ScenesView {
  private root: HTMLElement;
  private store: Store;
  private onEditRoom: () => void;
  private currentScene: Scene | null = null;
  private scenes = new Map<string, Scene>();
  private roomView: RoomView | null = null;
  private cameraMonitor: number | null = null; // requestAnimationFrame ID
  private dragging: CamSlider | null = null;

  // UI elements
  private container = el('div', { class: 'scenes-container' });
  private hud = el('div', { class: 'scenes-hud' });
  private body = el('div', { class: 'scenes-body' });
  private sidebar = el('div', { class: 'scenes-sidebar' });
  private mainView = el('div', { class: 'scenes-main' });
  private scenesList = el('div', { class: 'scenes-list' });
  private createBtn = el('button', { type: 'button', class: 'scenes-create-btn', textContent: '+ New Scene' });

  // 3D room container
  private roomContainer = el('div', { class: 'scenes-room-container', id: 'scenes-room' });

  // HUD
  private sceneName = el('div', { class: 'scenes-scene-name', textContent: 'No scene selected' });
  private exitBtn = el('button', { type: 'button', class: 'scenes-hud-btn primary', textContent: 'Exit Scene Mode' });
  private editRoomBtn = el('button', { type: 'button', class: 'scenes-hud-btn', textContent: 'Edit room' });

  // Controls panel
  private controlsPanel = el('div', { class: 'scenes-controls' });
  private objectPanel = el('div', { class: 'scenes-object-panel' });
  private sceneDesc = el('textarea', { class: 'scenes-description', placeholder: 'Scene description...' });
  private saveBtn = el('button', { type: 'button', textContent: 'Save Scene' });
  private deleteBtn = el('button', { type: 'button', textContent: 'Delete Scene', class: 'scenes-delete-btn' });

  // Camera sliders. Their values are always derived from the real camera (see syncCameraUi).
  private orbitSlider = el('input', { type: 'range', min: '0', max: '360', step: '1', value: '45', class: 'scenes-orbit-slider' });
  private orbitValue = el('span', { class: 'scenes-orbit-value', textContent: '45°' });
  private tiltSlider = el('input', { type: 'range', min: '-1.1', max: '1.75', step: '0.05', value: '0', class: 'scenes-tilt-slider' });
  private tiltValue = el('span', { class: 'scenes-tilt-value', textContent: '0' });
  private zoomSlider = el('input', { type: 'range', min: '0.2', max: String(MAX_SCENE_ZOOM), step: '0.05', value: '1', class: 'scenes-zoom-slider' });
  private zoomValue = el('span', { class: 'scenes-zoom-value', textContent: '1.0x' });
  // Pan: where the camera looks. Also changed by right-drag / two-finger drag in the 3D window.
  private panXSlider = el('input', { type: 'range', min: String(PAN_RANGE.x[0]), max: String(PAN_RANGE.x[1]), step: '0.1', value: '4.8', class: 'scenes-pan-slider' });
  private panXValue = el('span', { textContent: '4.8' });
  private panYSlider = el('input', { type: 'range', min: String(PAN_RANGE.y[0]), max: String(PAN_RANGE.y[1]), step: '0.1', value: '1.4', class: 'scenes-pan-slider' });
  private panYValue = el('span', { textContent: '1.4' });
  private panZSlider = el('input', { type: 'range', min: String(PAN_RANGE.z[0]), max: String(PAN_RANGE.z[1]), step: '0.1', value: '3.6', class: 'scenes-pan-slider' });
  private panZValue = el('span', { textContent: '3.6' });
  private panResetBtn = el('button', { type: 'button', textContent: 'Reset pan' });

  // Shot 4 props: the link objects that fill the whole-room shot.
  private shot4Btn = el('button', { type: 'button', textContent: `Add shot 4 objects (${SHOT4_LINKS.length})` });
  private shot4Status = el('div', { class: 'scenes-object-hint', textContent: '' });

  // Room add-ons (fireplace). Stored in the room (store.state.fixtures), so they save with the scene and the room.
  private fireplaceToggle = el('input', { type: 'checkbox', class: 'scenes-fireplace-toggle' });
  private fireplaceSlider = el('input', {
    type: 'range', min: String(FIREPLACE_X_RANGE.min), max: String(FIREPLACE_X_RANGE.max), step: '0.05', value: '4.4',
    class: 'scenes-fireplace-slider',
  });
  private fireplaceValue = el('span', { textContent: '' });
  private lastFireplace: Fixture = newFireplace(); // remembered so toggling off/on keeps its position

  // Shots: the trailer's shots inside the current scene. The list is rebuilt on selection / list changes only,
  // never while typing, so text fields keep focus.
  private shotsPanel = el('div', { class: 'scenes-shots' });
  private activeShotId: string | null = null;

  // Capture: 16:9 frame, vignette, guide figure, clean view, and the capture -> review -> save flow.
  private capture = new CapturePanel({
    room: () => this.roomView,
    scene: () => this.currentScene,
    shot: () => this.activeShot(),
    camera: () => this.currentCamera(),
    fireplace: () => this.currentFireplace(),
    clearSelection: () => this.store.select(null),
    onSaved: (info) => this.onShotSaved(info),
  });

  // Playback and the frame-by-frame recorder for the active shot (camera move plus object flights).
  private player = new ShotPlayer({
    room: () => this.roomView,
    shot: () => this.activeShot(),
    viewCamera: (c) => this.viewCamera(c),
    commitCamera: () => this.commitShotCamera(),
    vignette: () => this.capture.getVignette(),
    clearSelection: () => this.store.select(null),
    changed: () => this.refreshShotsPanel(),
  });

  // Magic scene props and exporting the scene into the repo.
  private magicBtn = el('button', { type: 'button', textContent: `Set up magic scene (${MAGIC_TOYS.length} new objects)` });
  private loungeBtn = el('button', { type: 'button', textContent: 'Set up lounge (chair, avatar, vinyl theme)' });
  private neighborhoodBtn = el('button', { type: 'button', textContent: 'Set up neighborhood zoom-out' });
  private exportBtn = el('button', { type: 'button', textContent: 'Export scene to repo' });
  private propsStatus = el('div', { class: 'scenes-object-hint', textContent: '' });
  private exportStatus = el('div', { class: 'scenes-object-hint', textContent: '' });

  // Object rotation (shown inside the object panel)
  private rotationSlider = el('input', { type: 'range', min: '0', max: '360', step: '1', value: '0', class: 'scenes-rotation-slider' });
  private rotationValue = el('span', { textContent: '0°' });

  constructor(container: HTMLElement, store: Store, _repoRooms: RepoRoom[], options: ScenesViewOptions = {}) {
    this.root = container;
    this.store = store;
    this.onEditRoom = options.onEditRoom ?? (() => {});
    this.root.innerHTML = '';

    this.buildUI();
    this.loadScenes();

    this.createBtn.addEventListener('click', () => this.createNewScene());
    this.saveBtn.addEventListener('click', () => this.saveCurrentScene());
    this.deleteBtn.addEventListener('click', () => this.deleteCurrentScene());
    this.exitBtn.addEventListener('click', () => this.closeScenes());
    this.editRoomBtn.addEventListener('click', () => this.onEditRoom());
    this.sceneDesc.addEventListener('change', () => {
      if (this.currentScene) this.currentScene.description = this.sceneDesc.value;
    });

    // Camera sliders. Orbit and tilt re-aim the camera but keep whatever zoom it really has. Zoom ONLY zooms.
    this.orbitSlider.addEventListener('input', () => {
      if (!this.roomView) return;
      const cam = this.roomView.getCameraState();
      this.roomView.setCameraState(parseFloat(this.orbitSlider.value), cam.orbitHeight, cam.zoom);
      this.syncCameraUi();
    });
    this.tiltSlider.addEventListener('input', () => {
      if (!this.roomView) return;
      const cam = this.roomView.getCameraState();
      this.roomView.setCameraState(cam.orbitAngle, parseFloat(this.tiltSlider.value), cam.zoom);
      this.syncCameraUi();
    });
    this.zoomSlider.addEventListener('input', () => {
      if (!this.roomView) return;
      this.roomView.setZoom(parseFloat(this.zoomSlider.value));
      this.syncCameraUi();
    });
    // While a slider is being dragged, don't write the camera's value back into it (avoids 360 -> 0 wrap jitter).
    const track = (which: CamSlider, slider: HTMLInputElement) => {
      slider.addEventListener('pointerdown', () => { this.dragging = which; });
    };
    track('orbit', this.orbitSlider);
    track('tilt', this.tiltSlider);
    track('zoom', this.zoomSlider);
    track('panX', this.panXSlider);
    track('panY', this.panYSlider);
    track('panZ', this.panZSlider);
    window.addEventListener('pointerup', () => { this.dragging = null; });

    // Pan: orbit, tilt and zoom stay exactly as they are; only the look-at point moves.
    const applyPan = () => {
      if (!this.roomView) return;
      this.roomView.setCameraTarget(
        parseFloat(this.panXSlider.value), parseFloat(this.panYSlider.value), parseFloat(this.panZSlider.value),
      );
      this.syncCameraUi();
    };
    for (const slider of [this.panXSlider, this.panYSlider, this.panZSlider]) slider.addEventListener('input', applyPan);
    this.panResetBtn.addEventListener('click', () => {
      if (!this.roomView) return;
      const [x, y, z] = this.roomView.getDefaultTarget();
      this.roomView.setCameraTarget(x, y, z);
      this.syncCameraUi();
    });

    this.shot4Btn.addEventListener('click', () => this.addShot4Objects());
    this.magicBtn.addEventListener('click', () => this.setUpMagicScene());
    this.loungeBtn.addEventListener('click', () => this.setUpLounge());
    this.neighborhoodBtn.addEventListener('click', () => this.setUpNeighborhood());
    this.exportBtn.addEventListener('click', () => void this.exportScene());

    // Object rotation: the only thing that turns an object in scenes mode.
    this.rotationSlider.addEventListener('input', () => {
      const degrees = parseFloat(this.rotationSlider.value);
      this.rotationValue.textContent = `${Math.round(degrees)}°`;
      const repId = this.store.selectedId;
      if (this.currentScene && repId && this.roomView) {
        const radians = (degrees * Math.PI) / 180;
        this.roomView.setObjectRotation(repId, radians);
        (this.currentScene.objectRotations ??= {})[repId] = radians;
      }
    });

    // Fireplace add-on: on/off, and slide it along the wall. Dragging redraws live; releasing saves it into the room.
    // Only the fireplace changes here: the lounge set and neighborhood fixtures stay as they are.
    this.fireplaceToggle.addEventListener('change', () => {
      const others = (this.store.state.fixtures ?? []).filter((f) => f.kind !== 'fireplace');
      this.store.setFixtures(this.fireplaceToggle.checked ? [...others, cloneFireplace(this.lastFireplace)] : others);
    });
    this.fireplaceSlider.addEventListener('input', () => {
      const fixture = this.currentFireplace();
      if (!fixture) return;
      const next = cloneFireplace(fixture);
      next.pos[0] = parseFloat(this.fireplaceSlider.value);
      this.store.setFixtures((this.store.state.fixtures ?? []).map((f) => (f.id === next.id ? next : f)), false);
    });
    this.fireplaceSlider.addEventListener('change', () => {
      const fixtures = cloneFixtures(this.store.state.fixtures);
      if (fixtures) this.store.setFixtures(fixtures); // records history + saves the room
    });

    // Keep the selected-object panel and fireplace controls in step with the shared store.
    this.store.subscribe(() => { this.updateObjectPanel(); this.updateFireplaceUi(); });
    this.updateObjectPanel();
    this.updateFireplaceUi();
  }

  private currentFireplace(): Fixture | undefined {
    return this.store.state.fixtures?.find((f) => f.kind === 'fireplace');
  }

  private updateFireplaceUi(): void {
    const fixture = this.currentFireplace();
    if (fixture) this.lastFireplace = cloneFireplace(fixture);
    this.fireplaceToggle.checked = Boolean(fixture);
    this.fireplaceSlider.disabled = !fixture;
    const x = (fixture ?? this.lastFireplace).pos[0];
    if (document.activeElement !== this.fireplaceSlider) this.fireplaceSlider.value = String(x);
    this.fireplaceValue.textContent = fixture ? x.toFixed(1) : 'off';
  }

  private buildUI(): void {
    // Top HUD: scene name on the left, Exit Scene Mode + Edit room centered.
    this.hud.append(
      this.sceneName,
      el('div', { class: 'scenes-hud-center' }, this.exitBtn, this.editRoomBtn),
      el('div', { class: 'scenes-hud-right' }),
    );

    this.sidebar.append(el('h3', { textContent: 'Scenes' }), this.scenesList, this.createBtn);

    const row = (label: string, input: HTMLElement, value: HTMLElement) =>
      el('div', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: label }), input, value);

    const cameraControls = el('div', { class: 'scenes-camera-controls' },
      row('Orbit', this.orbitSlider, this.orbitValue),
      row('Tilt', this.tiltSlider, this.tiltValue),
      row('Zoom', this.zoomSlider, this.zoomValue),
      row('Pan X', this.panXSlider, this.panXValue),
      row('Pan Z', this.panZSlider, this.panZValue),
      row('Pan up', this.panYSlider, this.panYValue),
      this.panResetBtn,
    );

    const fireplaceControls = el('div', { class: 'scenes-camera-controls' },
      el('label', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: 'On' }), this.fireplaceToggle),
      row('Along wall', this.fireplaceSlider, this.fireplaceValue),
    );

    this.controlsPanel.append(
      this.objectPanel,
      el('h4', { textContent: 'Fireplace' }),
      fireplaceControls,
      el('h4', { textContent: 'Camera' }),
      cameraControls,
      el('h4', { textContent: 'Props' }),
      this.shot4Btn,
      this.shot4Status,
      this.magicBtn,
      this.loungeBtn,
      this.neighborhoodBtn,
      this.propsStatus,
      el('h4', { textContent: 'Shots' }),
      this.shotsPanel,
      el('h4', { textContent: 'Capture' }),
      this.capture.element,
      el('h4', { textContent: 'Scene' }),
      this.sceneDesc,
      this.saveBtn,
      this.exportBtn,
      this.exportStatus,
      this.deleteBtn,
    );

    this.mainView.append(this.roomContainer, this.controlsPanel);
    this.body.append(this.sidebar, this.mainView);
    this.container.append(this.hud, this.body);
    this.root.append(this.container);
  }

  private loadScenes(): void {
    for (const id of listSceneIds()) {
      const scene = loadScene(id, this.store.state);
      if (scene) this.scenes.set(id, scene);
    }
    this.refreshScenesList();
  }

  private refreshScenesList(): void {
    this.scenesList.innerHTML = '';
    for (const [id, scene] of this.scenes) {
      const item = el('div', { class: 'scenes-list-item' },
        el('div', { class: 'scenes-list-title', textContent: scene.name }),
        el('div', { class: 'scenes-list-desc', textContent: scene.description || '(no description)' }),
      );
      item.classList.toggle('active', scene.id === this.currentScene?.id);
      item.addEventListener('click', () => this.loadScene(id));
      this.scenesList.append(item);
    }
  }

  private createNewScene(): void {
    const name = prompt('Scene name:', 'New Scene');
    if (!name) return;
    const scene = createScene(name, this.store.state);
    this.scenes.set(scene.id, scene);
    this.loadScene(scene.id);
  }

  private loadScene(sceneId: string): void {
    const scene = this.scenes.get(sceneId);
    if (!scene) return;

    // Leaving a scene (or reloading it): keep the framing of its active shot. The store still shows that scene's room here.
    this.player.stop();
    if (this.currentScene) {
      this.commitShotCamera();
      this.persistSceneQuietly();
    }

    this.currentScene = scene;
    this.sceneName.textContent = scene.name;
    this.sceneDesc.value = scene.description;

    // Show the scene's saved room layout. Fixtures are set explicitly: Object.assign alone would leave the previous
    // scene's fireplace behind when this scene has none, and would not save a change into the room.
    const fixturesBefore = JSON.stringify(this.store.state.fixtures);
    const sceneFixtures = cloneFixtures(scene.baseRoom.fixtures);
    Object.assign(this.store.state, scene.baseRoom);
    if (JSON.stringify(sceneFixtures) !== fixturesBefore) this.store.setFixtures(sceneFixtures);
    // Intro scenes are warm rooms with a fireplace: older ones saved before fixtures existed get one, once.
    if (sceneFixtures === undefined && this.store.state.fixtures === undefined && /intro/i.test(scene.name)) {
      this.store.setFixtures([newFireplace()]);
      scene.baseRoom.fixtures = cloneFixtures(this.store.state.fixtures);
      saveScene(scene);
    }
    this.store.select(null);

    // The scenes room view is its own RoomView in "scenes" mode: no movement on select, no preview card, no VR.
    if (!this.roomView) {
      this.roomContainer.innerHTML = '';
      this.roomView = new RoomView(this.roomContainer, this.store, [], { scenes: true });
      this.capture.overlay.append(this.player.label);
      this.roomContainer.append(this.capture.overlay);
      this.capture.roomReady();
    }

    this.roomView.clearObjectRotations();
    for (const [repId, rotation] of Object.entries(scene.objectRotations ?? {})) {
      this.roomView.setObjectRotation(repId, rotation);
    }

    // Apply the saved camera once; from here on the camera is the source of truth and the sliders follow it.
    const cam = scene.cameraState;
    this.roomView.setCameraState(cam.orbitAngle, cam.orbitHeight, cam.zoom, true, cam.target);
    this.syncCameraUi();
    this.startCameraMonitor();
    this.refreshScenesList();
    this.updateObjectPanel();
    this.activeShotId = scene.shots?.[0]?.id ?? null;
    // The first shot is the active one, so show its framing: otherwise leaving it would save the scene camera into it.
    const firstShot = this.activeShot();
    if (firstShot) this.viewCamera(firstShot.start);
    this.refreshShotsPanel();

    setActiveSceneId(sceneId);
  }

  // ---- shots --------------------------------------------------------------

  private activeShot(): Shot | undefined {
    return this.currentScene?.shots?.find((s) => s.id === this.activeShotId);
  }

  private static camText(c: CameraState): string {
    return `${Math.round(c.orbitAngle) % 360}° · tilt ${c.orbitHeight.toFixed(2)} · ${c.zoom.toFixed(2)}x`;
  }

  /** Point the real camera at a saved camera state; the sliders follow on their own. */
  private viewCamera(c: CameraState): void {
    if (!this.roomView) return;
    // A saved state without a target (older shots) keeps wherever the camera is looking now.
    this.roomView.setCameraState(c.orbitAngle, c.orbitHeight, c.zoom, false, c.target);
    this.syncCameraUi();
  }

  private currentCamera(): CameraState {
    return this.roomView ? this.roomView.getCameraState() : { orbitAngle: 45, orbitHeight: 0, zoom: 1 };
  }

  /**
   * Write the live camera into the shot being worked on, so moving the camera and then switching shots (or saving)
   * keeps the framing. Only still shots follow the camera: a shot with an end has two framings that are set
   * explicitly with Set start / Set end, and must not be overwritten by wherever the camera happens to be.
   */
  private commitShotCamera(): void {
    const shot = this.activeShot();
    if (!shot || shot.end || !this.roomView) return;
    shot.start = { ...this.currentCamera() };
  }

  /** Save the current scene without the alert Save Scene shows. Same fields saveCurrentScene writes. */
  private persistSceneQuietly(): void {
    const scene = this.currentScene;
    if (!scene) return;
    scene.baseRoom = JSON.parse(JSON.stringify(this.store.state));
    scene.updatedAt = new Date().toISOString();
    try { saveScene(scene); } catch { /* Save Scene can be pressed by hand to see the error */ }
  }

  /** Scatter the shot 4 link objects into random free spots (skipping links already in the room), then save the scene. */
  private addShot4Objects(): void {
    const scene = this.currentScene;
    if (!scene) { this.shot4Status.textContent = 'Open a scene first.'; return; }
    const have = new Set(this.store.state.contentItems.map((c) => c.sourceRef));
    const missing = SHOT4_LINKS.filter((l) => !have.has(l.url));
    if (missing.length === 0) { this.shot4Status.textContent = 'All shot 4 objects are already in this room.'; return; }

    const plan = planShotPlacements(
      missing, this.store.layout.slots, this.store.freeSlotIds(), this.currentFireplace()?.pos[0],
    );
    let added = 0;
    for (const { link, slotId } of plan) {
      this.store.addItem({ title: link.title, sourceRef: link.url, kind: link.kind, slotId });
      added++;
    }
    scene.baseRoom = JSON.parse(JSON.stringify(this.store.state));
    scene.updatedAt = new Date().toISOString();
    try { saveScene(scene); } catch { /* the objects are in the room; Save Scene can be pressed by hand */ }
    const skipped = SHOT4_LINKS.length - missing.length;
    this.shot4Status.textContent = `Added ${added} to "${scene.name}" and saved the scene`
      + `${skipped ? ` (${skipped} already there)` : ''}. Select an object and use Pick up to move it.`;
  }

  // ---- choreography presets ------------------------------------------------

  /** Representations currently in a slot, with the slot they rest in. */
  private placedReps(): Array<{ repId: string; slotId: string; sourceRef: string }> {
    const out: Array<{ repId: string; slotId: string; sourceRef: string }> = [];
    for (const p of this.store.state.placements) {
      const rep = this.store.state.representations.find((r) => r.id === p.representationId);
      const content = rep ? this.store.content(rep.contentItemId) : undefined;
      if (rep && content) out.push({ repId: rep.id, slotId: p.slotId, sourceRef: content.sourceRef });
    }
    return out;
  }

  /** Make the shot long enough for its choreography to finish, plus a short hold at the end. */
  private fitDuration(shot: Shot, flights: readonly Flight[]): void {
    shot.durationSec = Math.max(shot.durationSec, Math.ceil((motionLength(flights) + 0.7) * 2) / 2);
  }

  /** Shot 5: every object on the shelves flies in from off-screen, one after another, and lands on its slot. */
  private applyFling(shot: Shot): string {
    const room = this.roomView;
    if (!room) return 'Open a scene first.';
    const targets = this.placedReps().filter((p) => p.slotId.startsWith('shelf'));
    if (targets.length === 0) return 'No objects are on the shelves. Put objects on the shelf slots, then try again.';
    this.player.stop();
    this.viewCamera(shot.start); // the entry directions are worked out from what this shot's camera sees
    const reach = 10 / shot.start.zoom + 1.5;
    shot.motion = planFling(targets, room.cameraAxes(), reach, Math.random);
    this.fitDuration(shot, shot.motion);
    return `Planned ${targets.length} flights onto the shelves. Press Play to preview.`;
  }

  /** Magic scene: the new toys wait as a straining heap (the full box, never drawn) and burst out to their slots. */
  private applyHeapLaunch(shot: Shot): string {
    const known = new Set(MAGIC_TOYS.map((t) => t.url));
    const targets = this.placedReps().filter((p) => known.has(p.sourceRef));
    if (targets.length === 0) return 'The magic objects are not in this room yet. Use "Set up magic scene" under Props first.';
    this.player.stop();
    const look = shot.start.target ?? this.roomView?.getDefaultTarget() ?? [4.8, 0, 3.6];
    shot.motion = planHeapLaunch(targets, [look[0], 0, look[2]], Math.random);
    if (!shot.label) shot.label = 'CONCEPT SEQUENCE';
    this.fitDuration(shot, shot.motion);
    return `Planned ${targets.length} objects launching from a heap at the camera target. Press Play to preview.`;
  }

  /**
   * One click for the magic shot: put the new toys into free slots (the room is not changed if they are already
   * there), then create or refresh a "magic" shot with the heap launch and the CONCEPT SEQUENCE caption.
   */
  private setUpMagicScene(): void {
    const scene = this.currentScene;
    const room = this.roomView;
    if (!scene || !room) { this.propsStatus.textContent = 'Open a scene first.'; return; }
    this.player.stop();

    const have = new Set(this.store.state.contentItems.map((c) => c.sourceRef));
    const missing = MAGIC_TOYS.filter((t) => !have.has(t.url));
    if (missing.length > 0) {
      const plan = planShotPlacements(missing, this.store.layout.slots, this.store.freeSlotIds(), this.currentFireplace()?.pos[0]);
      for (const { link, slotId } of plan) this.store.addItem({ title: link.title, sourceRef: link.url, kind: link.kind, slotId });
    }

    const shots = (scene.shots ??= []);
    this.commitShotCamera();
    let shot = shots.find((s) => s.id === 'magic');
    if (!shot) {
      const [x, y, z] = room.getDefaultTarget();
      shot = newShot('magic', 'Magic: everything flies out', { orbitAngle: 45, orbitHeight: 0, zoom: 1.15, target: [x, y, z] }, {
        notes: 'No box is shown. The objects waiting in a heap stand in for the full box, then burst out and organize themselves.',
      });
      shots.push(shot);
    }
    this.activeShotId = shot.id;
    this.viewCamera(shot.start);
    const message = this.applyHeapLaunch(shot);
    this.persistSceneQuietly();
    this.refreshShotsPanel();
    this.propsStatus.textContent = `${missing.length ? `Added ${missing.length} objects. ` : 'Objects were already in the room. '}${message}`;
  }

  /** Add fixtures to the room, replacing any with the same id and leaving the others (the fireplace) alone. */
  private addFixtures(add: Fixture[]): void {
    const keep = (this.store.state.fixtures ?? []).filter((f) => !add.some((a) => a.id === f.id));
    this.store.setFixtures([...keep, ...add]);
  }

  /** Find the shot with this storyboard id or create it, make it the active shot and look through its start camera. */
  private ensureShot(id: string, title: string, camera: CameraState, partial: Partial<Shot>): Shot {
    const scene = this.currentScene as Scene;
    const shots = (scene.shots ??= []);
    this.commitShotCamera(); // keep the camera of the shot being left
    let shot = shots.find((s) => s.id === id);
    if (!shot) {
      shot = newShot(id, title, camera, partial);
      shots.push(shot);
    }
    this.activeShotId = shot.id;
    this.viewCamera(shot.start);
    return shot;
  }

  /** Shot 7c: the vinyl lounge theme, a lounge chair with an avatar in it wearing headphones, and a close shot of them. */
  private setUpLounge(): void {
    if (!this.currentScene || !this.roomView) { this.propsStatus.textContent = 'Open a scene first.'; return; }
    this.player.stop();
    const theme = THEMES['vinyl-lounge'];
    this.store.applyLook({ surfaces: theme.surfaces, lighting: theme.lighting });
    this.addFixtures([newLoungeChair(), newAvatar()]);
    const [x, , z] = LOUNGE_DEFAULT_POS;
    this.ensureShot('7c', 'Lounge: avatar listening', { orbitAngle: 45, orbitHeight: 0, zoom: 3, target: [x, 0.65, z] }, {
      notes: 'Avatar lounging in the chair with headphones, nodding to the music. Place objects around them from the slots.',
      durationSec: 6,
    });
    this.persistSceneQuietly();
    this.refreshShotsPanel();
    this.propsStatus.textContent = 'Applied the Vinyl lounge theme, added the chair and avatar at the middle of the floor, '
      + 'and set up shot 7c. Floor objects near the middle may overlap the chair; use a fresh scene for the cleanest lounge.';
  }

  /** Shot 8: a diorama of houses around the room, and a slow pull-out from the room to the whole neighborhood. */
  private setUpNeighborhood(): void {
    if (!this.currentScene || !this.roomView) { this.propsStatus.textContent = 'Open a scene first.'; return; }
    this.player.stop();
    this.addFixtures([newNeighborhood()]);
    const [rx, ry, rz] = this.roomView.getDefaultTarget();
    const [nx, , nz] = NEIGHBORHOOD_CENTER;
    const shot = this.ensureShot('8', 'Zoom out: the neighborhood', { orbitAngle: 45, orbitHeight: 0, zoom: 1.1, target: [rx, ry, rz] }, {
      notes: 'Slow pull-out from this room to every dev\'s room in the neighborhood.',
      durationSec: 7,
      end: { orbitAngle: 45, orbitHeight: 0.6, zoom: 0.24, target: [nx, 0, nz] },
    });
    this.persistSceneQuietly();
    this.refreshShotsPanel();
    this.propsStatus.textContent = `Added the neighborhood and set up shot ${shot.id}: ${shot.durationSec}s pull-out. `
      + 'Press Play on that shot to preview it. The lowest zoom the camera allows is 0.2.';
  }

  /** Write the scene as JSON into docs/trailer-materials/scenes/data/<scene>/ (dev server only) so it can be reviewed in git. */
  private async exportScene(): Promise<void> {
    const scene = this.currentScene;
    if (!scene) { this.exportStatus.textContent = 'Open a scene first.'; return; }
    this.commitShotCamera();
    scene.baseRoom = JSON.parse(JSON.stringify(this.store.state));
    scene.updatedAt = new Date().toISOString();
    try { saveScene(scene); } catch { /* the export below still has the full scene */ }
    const folder = scene.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'scene';
    try {
      const response = await fetch('/__scenes/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, files: [{ name: 'scene.json', data: JSON.stringify(scene, null, 2), encoding: 'utf8' }] }),
      });
      const body = (await response.json().catch(() => ({}))) as { written?: string[]; error?: string };
      this.exportStatus.textContent = response.ok
        ? `Wrote ${(body.written ?? []).join(', ')}`
        : `Export failed: ${body.error ?? response.status}`;
    } catch (error) {
      this.exportStatus.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private refreshShotsPanel(): void {
    this.shotsPanel.replaceChildren();
    this.player.syncLabel(); // the frame preview always shows the active shot's caption
    const scene = this.currentScene;
    if (!scene) {
      this.shotsPanel.append(el('div', { class: 'scenes-object-hint', textContent: 'Select a scene to add shots.' }));
      return;
    }
    const shots = (scene.shots ??= []);

    const btn = (label: string, onClick: () => void, cls = '') => {
      const b = el('button', { type: 'button', textContent: label, class: cls });
      b.addEventListener('click', onClick);
      return b;
    };

    this.shotsPanel.append(el('div', { class: 'scenes-object-actions' },
      btn('+ Shot', () => {
        const id = prompt('Shot id (matches the storyboard, e.g. 2 or 7a):', '');
        if (!id?.trim()) return;
        if (shots.some((s) => s.id === id.trim())) { alert(`Shot ${id.trim()} already exists in this scene.`); return; }
        this.commitShotCamera(); // the shot being left keeps its framing before the new one starts from the live camera
        shots.push(newShot(id.trim(), `Shot ${id.trim()}`, this.currentCamera()));
        this.activeShotId = id.trim();
        this.refreshShotsPanel();
      }),
    ));

    if (shots.length === 0) {
      this.shotsPanel.append(el('div', { class: 'scenes-object-hint', textContent: 'No shots in this scene yet. A scene works fine without any.' }));
      return;
    }

    const list = el('div', { class: 'scenes-shot-list' });
    for (const shot of shots) {
      const row = el('div', { class: 'scenes-shot-item' },
        el('span', { class: 'scenes-shot-id', textContent: shot.id }),
        el('span', { class: 'scenes-shot-title', textContent: shot.title }),
        el('span', { class: `scenes-shot-type ${shot.type}`, textContent: shot.type }),
      );
      row.classList.toggle('active', shot.id === this.activeShotId);
      row.addEventListener('click', () => {
        if (this.player.busy) return; // a recording or playback is using the camera
        if (shot.id !== this.activeShotId) {
          this.player.stop();
          this.commitShotCamera(); // keep the framing of the shot being left
          this.activeShotId = shot.id;
          this.persistSceneQuietly();
        }
        this.viewCamera(shot.start);
        this.refreshShotsPanel();
      });
      list.append(row);
    }
    this.shotsPanel.append(list);

    const shot = this.activeShot();
    if (shot) this.shotsPanel.append(this.buildShotEditor(shot, btn));
  }

  private buildShotEditor(shot: Shot, btn: (label: string, onClick: () => void, cls?: string) => HTMLButtonElement): HTMLElement {
    const field = (label: string, input: HTMLElement) =>
      el('div', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: label }), input);

    const title = el('input', { type: 'text', value: shot.title, class: 'scenes-shot-input' });
    title.addEventListener('change', () => {
      shot.title = title.value.trim() || shot.title;
      this.refreshShotsPanel();
    });

    const type = el('select', { class: 'scenes-shot-input' });
    for (const t of SHOT_TYPES) type.append(el('option', { value: t, textContent: t, selected: t === shot.type }));
    type.addEventListener('change', () => { shot.type = type.value as ShotType; this.refreshShotsPanel(); });

    const duration = el('input', { type: 'number', min: '0.5', max: '120', step: '0.5', value: String(shot.durationSec), class: 'scenes-shot-input' });
    duration.addEventListener('change', () => {
      const n = parseFloat(duration.value);
      if (Number.isFinite(n) && n > 0) shot.durationSec = n;
      duration.value = String(shot.durationSec);
    });

    const easing = el('select', { class: 'scenes-shot-input' });
    for (const e of SHOT_EASINGS) easing.append(el('option', { value: e, textContent: e, selected: e === shot.easing }));
    easing.addEventListener('change', () => { shot.easing = easing.value as ShotEasing; });

    const notes = el('textarea', { class: 'scenes-description', placeholder: 'Shot notes...', value: shot.notes });
    notes.addEventListener('change', () => { shot.notes = notes.value; });

    const startText = el('div', { class: 'scenes-shot-cam', textContent: `Start: ${ScenesView.camText(shot.start)}` });
    const endText = el('div', { class: 'scenes-shot-cam', textContent: shot.end ? `End: ${ScenesView.camText(shot.end)}` : 'End: none (camera holds still)' });

    const camActions = el('div', { class: 'scenes-object-actions' },
      btn('Set start', () => { shot.start = { ...this.currentCamera() }; this.refreshShotsPanel(); }),
      btn('Set end', () => { shot.end = { ...this.currentCamera() }; this.refreshShotsPanel(); }),
      btn('View start', () => this.viewCamera(shot.start)),
    );
    if (shot.end) {
      const end = shot.end;
      camActions.append(
        btn('View end', () => this.viewCamera(end)),
        btn('Clear end', () => { shot.end = null; this.refreshShotsPanel(); }),
      );
    }

    const presetStatus = el('div', { class: 'scenes-object-hint', textContent: '' });
    const runPreset = (plan: (shot: Shot) => string) => {
      presetStatus.textContent = plan(shot);
      this.persistSceneQuietly();
      // Rebuild so the motion line, duration and caption reflect the new choreography. The message survives the rebuild below.
      const message = presetStatus.textContent;
      this.refreshShotsPanel();
      const fresh = this.shotsPanel.querySelector('.scenes-preset-status');
      if (fresh) fresh.textContent = message;
    };
    presetStatus.classList.add('scenes-preset-status');
    const presets = el('div', { class: 'scenes-shot-presets' },
      el('div', { class: 'scenes-object-actions' }, el('strong', { textContent: 'Choreography' })),
      el('div', { class: 'scenes-object-actions' },
        btn('Fling onto shelves', () => runPreset((s) => this.applyFling(s))),
        btn('Heap launch', () => runPreset((s) => this.applyHeapLaunch(s))),
      ),
      presetStatus,
    );

    return el('div', { class: 'scenes-shot-editor' },
      field('Title', title),
      field('Type', type),
      field('Seconds', duration),
      field('Easing', easing),
      startText,
      endText,
      camActions,
      presets,
      this.player.buildControls(shot),
      notes,
      el('div', { class: 'scenes-object-actions' },
        btn('Delete shot', () => {
          const scene = this.currentScene;
          if (!scene?.shots || !confirm(`Delete shot ${shot.id}?`)) return;
          this.player.stop();
          scene.shots = scene.shots.filter((s) => s.id !== shot.id);
          this.activeShotId = scene.shots[0]?.id ?? null;
          this.refreshShotsPanel();
        }, 'scenes-delete-btn'),
      ),
      el('div', { class: 'scenes-object-hint', textContent: 'Shots are stored with the scene: press Save Scene to keep changes.' }),
    );
  }

  /**
   * Make the sliders, labels and the saved scene camera mirror the REAL camera. Called every frame by the monitor
   * (so dragging / scrolling in the 3D window moves the sliders) and right after a slider is used.
   */
  private syncCameraUi(): void {
    if (!this.roomView) return;
    const cam = this.roomView.getCameraState();
    if (this.currentScene) Object.assign(this.currentScene.cameraState, cam);

    const set = (which: CamSlider, slider: HTMLInputElement, label: HTMLElement, value: number, text: string) => {
      if (this.dragging !== which) {
        const next = String(value);
        if (slider.value !== next) slider.value = next;
      }
      if (label.textContent !== text) label.textContent = text;
    };
    set('orbit', this.orbitSlider, this.orbitValue, Math.round(cam.orbitAngle) % 360, `${Math.round(cam.orbitAngle) % 360}°`);
    set('tilt', this.tiltSlider, this.tiltValue, Math.round(cam.orbitHeight * 20) / 20, (Math.round(cam.orbitHeight * 20) / 20).toFixed(2));
    set('zoom', this.zoomSlider, this.zoomValue, Math.round(cam.zoom * 20) / 20, `${cam.zoom.toFixed(2)}x`);
    const [tx, ty, tz] = cam.target.map((n) => Math.round(n * 10) / 10);
    set('panX', this.panXSlider, this.panXValue, tx, tx.toFixed(1));
    set('panY', this.panYSlider, this.panYValue, ty, ty.toFixed(1));
    set('panZ', this.panZSlider, this.panZValue, tz, tz.toFixed(1));
  }

  private startCameraMonitor(): void {
    if (this.cameraMonitor !== null) return;
    const monitor = () => {
      // Only the visible scenes view needs to track the camera.
      if (document.body.classList.contains('scenes-active')) {
        this.syncCameraUi();
        this.capture.updateOverlay();
      }
      this.cameraMonitor = requestAnimationFrame(monitor);
    };
    this.cameraMonitor = requestAnimationFrame(monitor);
  }

  /** Rebuild the selected-object actions: the same options the normal item sheet has, but inside the HUD. */
  private updateObjectPanel(): void {
    const repId = this.store.selectedId;
    const rep = repId ? this.store.state.representations.find((r) => r.id === repId) : undefined;
    const content = rep ? this.store.content(rep.contentItemId) : undefined;
    this.objectPanel.replaceChildren();
    if (!rep || !content || !this.currentScene) {
      this.objectPanel.hidden = true;
      return;
    }
    this.objectPanel.hidden = false;

    const store = this.store;
    const btn = (label: string, onClick: () => void, cls = '') => {
      const b = el('button', { type: 'button', textContent: label, class: cls });
      b.addEventListener('click', onClick);
      return b;
    };

    const placed = Boolean(store.slotOf(rep.id));
    const holding = store.holding === rep.id;

    const actions = el('div', { class: 'scenes-object-actions' },
      btn('Edit', () => openContentEditor(store, content.id)),
    );
    if (placed) actions.append(btn('Pick up', () => store.pickUp(rep.id)));
    actions.append(
      btn('Stash', () => store.stash(rep.id)),
      btn('Delete', () => store.deleteContent(content.id), 'scenes-delete-btn'),
    );

    const kind = buildKindInventory({ value: rep.objectKind, onChange: (next) => store.setKind(rep.id, next) });

    // Rotation reflects this object's actual orientation.
    if (this.roomView) {
      const degrees = (((this.roomView.getObjectRotation(rep.id) * 180) / Math.PI) % 360 + 360) % 360;
      this.rotationSlider.value = String(Math.round(degrees));
      this.rotationValue.textContent = `${Math.round(degrees)}°`;
    }

    this.objectPanel.append(
      el('h4', { textContent: 'Selected object' }),
      el('div', { class: 'scenes-object-title', textContent: content.title || OBJECT_LABELS[rep.objectKind] }),
      kind,
      actions,
      holding
        ? el('div', { class: 'scenes-object-hint', textContent: 'Click a glowing slot in the room to place it. Clicking empty space puts it back.' })
        : el('div', { class: 'scenes-rotation' },
            el('div', { class: 'scenes-slider-row' }, el('span', { class: 'scenes-slider-label', textContent: 'Turn' }), this.rotationSlider, this.rotationValue)),
    );
  }

  private saveCurrentScene(): void {
    if (!this.currentScene) {
      alert('No scene selected');
      return;
    }
    this.commitShotCamera();
    // Capture the layout as it is now, including anything moved / edited / deleted from this HUD.
    this.currentScene.baseRoom = JSON.parse(JSON.stringify(this.store.state));
    this.currentScene.updatedAt = new Date().toISOString();
    try {
      saveScene(this.currentScene);
      this.refreshScenesList();
      alert('Scene saved!');
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private deleteCurrentScene(): void {
    if (!this.currentScene) return;
    if (!confirm(`Delete scene "${this.currentScene.name}"?`)) return;
    const sceneId = this.currentScene.id;
    deleteScene(sceneId);
    this.scenes.delete(sceneId);
    this.currentScene = null;
    this.activeShotId = null;
    this.refreshScenesList();
    this.refreshShotsPanel();
    this.sceneName.textContent = 'No scene selected';
    this.updateObjectPanel();
  }

  /**
   * A shot was captured and saved into the repo: make sure the scene has a matching shot (this is how the first save
   * becomes shot 01), point its start at the captured camera, and keep the scene.
   */
  private onShotSaved(info: { shotId: string; title: string; camera: CameraState }): void {
    const scene = this.currentScene;
    if (!scene) return;
    const shots = (scene.shots ??= []);
    let shot = shots.find((s) => s.id === info.shotId);
    if (!shot) {
      shot = newShot(info.shotId, info.title, info.camera, { type: 'composite' });
      shots.push(shot);
    } else {
      shot.start = { ...info.camera };
    }
    this.activeShotId = shot.id;
    this.refreshShotsPanel();
    // Persist quietly (Save Scene alerts). Same fields saveCurrentScene writes.
    scene.baseRoom = JSON.parse(JSON.stringify(this.store.state));
    scene.updatedAt = new Date().toISOString();
    try { saveScene(scene); } catch { /* the shot files are already in the repo; the scene can be saved by hand */ }
  }

  private closeScenes(): void {
    this.player.stop();
    this.capture.exitClean();
    this.store.select(null); // also puts back anything that was picked up
    const toggleScenes = (window as unknown as { toggleScenes?: (active: boolean) => void }).toggleScenes;
    toggleScenes?.(false);
  }

  public show(): void {
    this.container.style.display = '';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }
}
