// A room layout is plain data: boxes to draw and slots to place objects on.
// Units are roughly meters, Y-up, right-handed (three.js convention).
// Back corner is the origin; +x runs along the right wall, +z along the left wall.
// Built from pitch-off-materials/references/isometric-vibey-room-idea-zoom.jpeg (repo root).
// A view can swap this for a modeled GLB later without touching saved placements (slot ids stay stable).
// Slot ids are a contract: saved placements point at them, so only ever ADD slots to a layout, never rename or move them.

export type Vec3 = [number, number, number];
export type Material = 'wall' | 'floor' | 'accent';

export interface Box {
  id: string;
  min: Vec3;
  size: Vec3;
  material: Material;
}

export interface Slot {
  id: string;
  label: string;
  /** Center of the surface point the object's base rests on. */
  pos: Vec3;
}

export interface RoomLayout {
  id: string;
  name: string;
  palette: Record<Material | 'background', string>;
  boxes: Box[];
  slots: Slot[];
  /** Where the camera looks by default (room center). */
  focus: Vec3;
  /** Orthographic frustum height; bigger rooms need a bigger value. */
  viewHeight: number;
}

const box = (id: string, min: Vec3, size: Vec3, material: Material): Box => ({ id, min, size, material });

// Interior runs x = 0..W (along the right wall) and z = 0..D (along the left wall). Rectangular on purpose.
const W = 10.3;
const D = 7.3;

// Four cantilevered stair steps climbing the left wall toward the loft.
const STEP_TOPS = [0.6, 1.2, 1.75, 2.3];
const steps: Box[] = STEP_TOPS.map((top, i) => {
  const front = 5.8 - 0.75 * i;
  // The landing starts at the loft edge, not 0.2m inside its coplanar top.
  const back = i === 3 ? 3.0 : front - 0.75;
  return box(`step-${i + 1}`, [0, top - 0.3, back], [1.4, 0.3, front - back], 'accent');
});

// New floor area added beyond the original 6.3 x 6.3 footprint: a grid along the right wall plus a front strip.
const extraFloor = (): Slot[] => {
  const slots: Slot[] = [];
  let n = 7;
  for (const z of [2.6, 4.2, 5.8]) {
    for (const x of [6.8, 8.2, 9.6]) {
      slots.push({ id: `floor-${n}`, label: `Floor, east side ${n - 6}`, pos: [x, 0, z] });
      n++;
    }
  }
  return slots;
};

const cozyLoft: RoomLayout = {
  id: 'cozy-loft',
  name: 'Cozy loft',
  palette: { wall: '#7f6ba8', floor: '#9a86bf', accent: '#dba08f', background: '#c8935f' },
  focus: [4.8, 1.4, 3.6],
  viewHeight: 14,
  boxes: [
    box('floor', [-0.3, -0.3, -0.3], [W + 0.6, 0.3, D + 0.6], 'floor'),

    // Left wall (x = -0.3..0): solid below the window, lintel above, pillars at both ends.
    box('left-low', [-0.3, 0, -0.3], [0.3, 2.0, D + 0.3], 'wall'),
    box('left-lintel', [-0.3, 3.4, -0.3], [0.3, 0.8, D + 0.3], 'wall'),
    box('left-pillar-back', [-0.3, 2.0, -0.3], [0.5, 1.4, 0.5], 'wall'),
    box('left-pillar-front', [-0.3, 2.0, D - 0.5], [0.5, 1.4, 0.5], 'wall'),

    // Right wall (z = -0.3..0): long opening with a rail and mullions.
    box('right-low', [0, 0, -0.3], [W, 1.8, 0.3], 'wall'),
    box('right-rail', [0, 2.5, -0.3], [W, 0.2, 0.3], 'wall'),
    box('right-mullion', [2.3, 1.8, -0.3], [0.25, 1.6, 0.3], 'wall'),
    box('right-mullion-2', [6.0, 1.8, -0.3], [0.25, 1.6, 0.3], 'wall'),
    box('right-lintel', [0, 3.4, -0.3], [W, 0.8, 0.3], 'wall'),
    box('right-pillar-front', [W - 0.5, 1.8, -0.3], [0.5, 1.6, 0.5], 'wall'),

    // Loft platform along the left wall, with a peach block on it.
    box('loft', [0, 2.0, 0], [4.0, 0.3, 3.0], 'floor'),
    box('loft-block', [1.3, 2.3, 0.1], [2.0, 0.6, 0.9], 'accent'),
    ...steps,

    // East side: a low bench and a wall shelf for tidy collections.
    box('bench', [6.6, 0, 0.05], [3.4, 0.45, 0.9], 'accent'),
    box('shelf', [6.6, 1.6, 0], [3.4, 0.12, 0.5], 'accent'),
  ],
  slots: [
    // Old first floor: 3x4 on the original 6.3 room, pitched to match the east grid, starting
    // right of the stair run (x 0–1.4) instead of placing cells under the treads.
    { id: 'floor-1', label: 'Floor, back left', pos: [2.6, 0, 1.0] },
    { id: 'floor-2', label: 'Floor, back middle', pos: [4.0, 0, 1.0] },
    { id: 'floor-3', label: 'Floor, back right', pos: [5.4, 0, 1.0] },
    { id: 'floor-6', label: 'Floor, under the loft', pos: [2.6, 0, 2.6] },
    { id: 'floor-old-7', label: 'Floor, mid left-center', pos: [4.0, 0, 2.6] },
    { id: 'floor-old-8', label: 'Floor, mid right', pos: [5.4, 0, 2.6] },
    { id: 'floor-4', label: 'Floor, near the stairs', pos: [2.6, 0, 4.2] },
    { id: 'floor-old-9', label: 'Floor, center', pos: [4.0, 0, 4.2] },
    { id: 'floor-old-10', label: 'Floor, right center', pos: [5.4, 0, 4.2] },
    { id: 'floor-old-11', label: 'Floor, front left', pos: [2.6, 0, 5.8] },
    { id: 'floor-old-12', label: 'Floor, front middle', pos: [4.0, 0, 5.8] },
    { id: 'floor-5', label: 'Floor, front right', pos: [5.4, 0, 5.8] },
    { id: 'loft-1', label: 'Loft, front left', pos: [0.7, 2.3, 2.15] },
    { id: 'loft-2', label: 'Loft, front middle', pos: [2.0, 2.3, 2.15] },
    { id: 'loft-3', label: 'Loft, front right', pos: [3.3, 2.3, 2.15] },
    { id: 'loft-4', label: 'Loft, back left', pos: [0.7, 2.3, 1.15] },
    { id: 'block-1', label: 'Loft shelf, left', pos: [1.8, 2.9, 0.55] },
    { id: 'block-2', label: 'Loft shelf, right', pos: [2.8, 2.9, 0.55] },
    { id: 'floor-front-loft-1', label: 'Floor, under the loft (back)', pos: [1.2, 0, 1.0] },
    { id: 'floor-front-loft-2', label: 'Floor, under the loft', pos: [1.2, 0, 2.6] },
    { id: 'step-1', label: 'Stairs, bottom', pos: [0.7, 0.6, 5.425] },
    { id: 'step-2', label: 'Stairs, second', pos: [0.7, 1.2, 4.675] },
    { id: 'step-3', label: 'Stairs, third', pos: [0.7, 1.75, 3.925] },
    ...extraFloor(),
    { id: 'bench-1', label: 'Bench, left', pos: [7.2, 0.45, 0.5] },
    { id: 'bench-2', label: 'Bench, middle', pos: [8.3, 0.45, 0.5] },
    { id: 'bench-3', label: 'Bench, right', pos: [9.4, 0.45, 0.5] },
    { id: 'shelf-1', label: 'Wall shelf, left', pos: [7.2, 1.72, 0.28] },
    { id: 'shelf-2', label: 'Wall shelf, middle', pos: [8.3, 1.72, 0.28] },
    { id: 'shelf-3', label: 'Wall shelf, right', pos: [9.4, 1.72, 0.28] },
  ],
};

const LAYOUTS: Record<string, RoomLayout> = { [cozyLoft.id]: cozyLoft };

export const DEFAULT_LAYOUT_ID = cozyLoft.id;
export const getLayout = (id: string): RoomLayout | undefined => LAYOUTS[id];
