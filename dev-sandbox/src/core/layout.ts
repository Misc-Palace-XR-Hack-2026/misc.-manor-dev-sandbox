// A room layout is plain data: boxes to draw and slots to place objects on.
// Units are roughly meters, Y-up, right-handed (three.js convention).
// Back corner is the origin; +x runs along the right wall, +z along the left wall.
// Built from pitch-off-materials/references/isometric-vibey-room-idea-zoom.jpeg (repo root).
// A view can swap this for a modeled GLB later without touching saved placements (slot ids stay stable).

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
}

const box = (id: string, min: Vec3, size: Vec3, material: Material): Box => ({ id, min, size, material });

// Four cantilevered stair steps climbing the left wall toward the loft.
const STEP_TOPS = [0.6, 1.2, 1.75, 2.3];
const steps: Box[] = STEP_TOPS.map((top, i) =>
  box(`step-${i + 1}`, [0, top - 0.3, 5.05 - 0.75 * i], [1.4, 0.3, 0.75], 'accent'),
);

const cozyLoft: RoomLayout = {
  id: 'cozy-loft',
  name: 'Cozy loft',
  palette: { wall: '#7f6ba8', floor: '#9a86bf', accent: '#dba08f', background: '#c8935f' },
  boxes: [
    box('floor', [-0.3, -0.3, -0.3], [6.9, 0.3, 6.9], 'floor'),

    // Left wall (x = -0.3..0): solid below the window, lintel above, pillars at both ends.
    box('left-low', [-0.3, 0, -0.3], [0.3, 2.0, 6.6], 'wall'),
    box('left-lintel', [-0.3, 3.4, -0.3], [0.3, 0.8, 6.6], 'wall'),
    box('left-pillar-back', [-0.3, 2.0, -0.3], [0.5, 1.4, 0.5], 'wall'),
    box('left-pillar-front', [-0.3, 2.0, 5.8], [0.5, 1.4, 0.5], 'wall'),

    // Right wall (z = -0.3..0): big opening with a rail and a mullion.
    box('right-low', [0, 0, -0.3], [6.3, 1.8, 0.3], 'wall'),
    box('right-rail', [0, 2.5, -0.3], [6.3, 0.2, 0.3], 'wall'),
    box('right-mullion', [2.3, 1.8, -0.3], [0.25, 1.6, 0.3], 'wall'),
    box('right-lintel', [0, 3.4, -0.3], [6.3, 0.8, 0.3], 'wall'),
    box('right-pillar-front', [5.8, 1.8, -0.3], [0.5, 1.6, 0.5], 'wall'),

    // Loft platform along the left wall, with a peach block on it.
    box('loft', [0, 2.0, 0], [4.0, 0.3, 3.0], 'floor'),
    box('loft-block', [1.3, 2.3, 0.1], [2.0, 0.6, 0.9], 'accent'),
    ...steps,
  ],
  slots: [
    { id: 'floor-1', label: 'Floor, under the loft', pos: [2.0, 0, 2.2] },
    { id: 'floor-2', label: 'Floor, by the right wall', pos: [4.6, 0, 1.0] },
    { id: 'floor-3', label: 'Floor, middle', pos: [4.2, 0, 3.4] },
    { id: 'floor-4', label: 'Floor, near the stairs', pos: [2.6, 0, 4.6] },
    { id: 'floor-5', label: 'Floor, front corner', pos: [5.2, 0, 5.2] },
    { id: 'floor-6', label: 'Floor, under the loft (right)', pos: [3.2, 0, 2.3] },
    { id: 'loft-1', label: 'Loft, left', pos: [0.7, 2.3, 2.2] },
    { id: 'loft-2', label: 'Loft, middle', pos: [2.0, 2.3, 2.2] },
    { id: 'loft-3', label: 'Loft, right', pos: [3.3, 2.3, 2.0] },
    { id: 'block-1', label: 'Loft block, left', pos: [1.8, 2.9, 0.55] },
    { id: 'block-2', label: 'Loft block, right', pos: [2.8, 2.9, 0.55] },
    { id: 'step-1', label: 'Stairs, bottom', pos: [0.7, 0.6, 5.425] },
    { id: 'step-2', label: 'Stairs, second', pos: [0.7, 1.2, 4.675] },
    { id: 'step-3', label: 'Stairs, third', pos: [0.7, 1.75, 3.925] },
  ],
};

const LAYOUTS: Record<string, RoomLayout> = { [cozyLoft.id]: cozyLoft };

export const DEFAULT_LAYOUT_ID = cozyLoft.id;
export const getLayout = (id: string): RoomLayout | undefined => LAYOUTS[id];
