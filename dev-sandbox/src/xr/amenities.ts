import * as THREE from 'three';
import { buildSavePoint, type SavePoint } from '../demo/save-point';
import { buildJukebox, type Jukebox } from '../demo/jukebox';

/** Session-owned instances of the production scenery. No saved room mutations. */
export class XrAmenities {
  portal: SavePoint | null = null;
  jukebox: Jukebox | null = null;
  get active(): boolean { return this.portal !== null; }
  constructor(private scene: THREE.Scene) {}
  start(): void {
    this.end();
    this.portal = buildSavePoint();
    this.portal.group.position.set(8.8, 0, 5.6);
    this.jukebox = buildJukebox();
    this.jukebox.group.position.set(8.8, 0, 1.7);
    this.jukebox.group.rotation.y = -Math.PI / 2;
    this.jukebox.group.scale.setScalar(.65);
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
