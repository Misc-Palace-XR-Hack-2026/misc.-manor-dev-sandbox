import type { Store } from '../core/store';
import { listSceneIds, loadScene, createScene, deleteScene, saveScene, setActiveSceneId } from '../core/scene-store';
import {
  SHOT_EASINGS, SHOT_TYPES, newShot,
  type CameraState, type Scene, type Shot, type ShotEasing, type ShotType,
} from '../core/scenes';
import { RoomView } from './room';
import type { RepoRoom } from './menu';
import { openContentEditor } from './content-editor';
import { buildKindInventory } from './kind-picker';
import { OBJECT_LABELS } from '../core/types';
import { FIREPLACE_X_RANGE, cloneFixtures, newFireplace, type Fixture } from '../core/fixtures';
import { CapturePanel } from './capture';

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

type CamSlider = 'orbit' | 'tilt' | 'zoom';

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
  private zoomSlider = el('input', { type: 'range', min: '0.2', max: '5', step: '0.05', value: '1', class: 'scenes-zoom-slider' });
  private zoomValue = el('span', { class: 'scenes-zoom-value', textContent: '1.0x' });

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
    window.addEventListener('pointerup', () => { this.dragging = null; });

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
    this.fireplaceToggle.addEventListener('change', () => {
      this.store.setFixtures(this.fireplaceToggle.checked ? [cloneFireplace(this.lastFireplace)] : []);
    });
    this.fireplaceSlider.addEventListener('input', () => {
      const fixture = this.currentFireplace();
      if (!fixture) return;
      const next = cloneFireplace(fixture);
      next.pos[0] = parseFloat(this.fireplaceSlider.value);
      this.store.setFixtures([next], false);
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
      el('h4', { textContent: 'Shots' }),
      this.shotsPanel,
      el('h4', { textContent: 'Capture' }),
      this.capture.element,
      el('h4', { textContent: 'Scene' }),
      this.sceneDesc,
      this.saveBtn,
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
      this.roomContainer.append(this.capture.overlay);
      this.capture.roomReady();
    }

    this.roomView.clearObjectRotations();
    for (const [repId, rotation] of Object.entries(scene.objectRotations ?? {})) {
      this.roomView.setObjectRotation(repId, rotation);
    }

    // Apply the saved camera once; from here on the camera is the source of truth and the sliders follow it.
    const cam = scene.cameraState;
    this.roomView.setCameraState(cam.orbitAngle, cam.orbitHeight, cam.zoom, true);
    this.syncCameraUi();
    this.startCameraMonitor();
    this.refreshScenesList();
    this.updateObjectPanel();
    this.activeShotId = scene.shots?.[0]?.id ?? null;
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
    this.roomView.setCameraState(c.orbitAngle, c.orbitHeight, c.zoom);
    this.syncCameraUi();
  }

  private currentCamera(): CameraState {
    return this.roomView ? this.roomView.getCameraState() : { orbitAngle: 45, orbitHeight: 0, zoom: 1 };
  }

  private refreshShotsPanel(): void {
    this.shotsPanel.replaceChildren();
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
        this.activeShotId = shot.id;
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

    return el('div', { class: 'scenes-shot-editor' },
      field('Title', title),
      field('Type', type),
      field('Seconds', duration),
      field('Easing', easing),
      startText,
      endText,
      camActions,
      notes,
      el('div', { class: 'scenes-object-actions' },
        btn('Delete shot', () => {
          const scene = this.currentScene;
          if (!scene?.shots || !confirm(`Delete shot ${shot.id}?`)) return;
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
