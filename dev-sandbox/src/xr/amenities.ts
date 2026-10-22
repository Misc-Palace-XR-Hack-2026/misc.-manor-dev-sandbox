import * as THREE from 'three';
import { buildSavePoint, type SavePoint } from '../demo/save-point';
import { buildJukebox, type Jukebox } from '../demo/jukebox';
import { JUKEBOX_POS, SAVE_POINT_POS } from '../core/intro-timeline';

/** The public build's own jukebox scale (demo-app's JUKEBOX_SCALE). */
const JUKEBOX_SCALE = 0.6;

/** Session-owned instances of the production scenery. No saved room mutations. */
export class XrAmenities {
  portal: SavePoint | null = null;
  jukebox: Jukebox | null = null;
  get active(): boolean { return this.portal !== null; }
  constructor(private scene: THREE.Scene) {}
  start(): void {
    this.end();
    // Same anchors, facing and scale as the public build, so both views describe one room.
    this.portal = buildSavePoint();
    this.portal.group.position.set(...SAVE_POINT_POS);
    this.jukebox = buildJukebox();
    this.jukebox.group.position.set(...JUKEBOX_POS);
    this.jukebox.group.rotation.y = -Math.PI / 2; // outside the room, face turned in (west)
    this.jukebox.group.scale.setScalar(JUKEBOX_SCALE);
    this.scene.add(this.portal.group, this.jukebox.group);
  }
  update(t: number, dt: number): void {
    this.portal?.update(t, dt);
    this.jukebox?.update(t, dt);
  }
  hit(ray: THREE.Raycaster): { kind: 'portal' | 'jukebox'; distance: number; point: THREE.Vector3 } | null {
    const hits = ([['portal', this.portal], ['jukebox', this.jukebox]] as const).flatMap(([kind, model]) => {
      const distance = model?.hit(ray);
      return distance == null ? [] : [{ kind, distance, point: ray.ray.at(distance, new THREE.Vector3()) }];
    });
    return hits.sort((a,b) => a.distance - b.distance)[0] ?? null;
  }
  end(): void {
    this.portal?.dispose();
    this.jukebox?.dispose();
    this.portal = this.jukebox = null;
  }
}
