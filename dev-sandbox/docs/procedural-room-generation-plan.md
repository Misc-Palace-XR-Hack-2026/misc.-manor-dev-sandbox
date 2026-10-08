# Procedural room design and starting-layout plan

Status: proposal only. No generator implementation performed.
Base: `experiment/room-sandbox`. Implement later on a feature branch from this branch; do not change `main`.

## Outcome

Give the sandbox **repeatable variety** in two independent layers:

1. **Room design** — architecture: footprint, walls/openings, loft/steps/alcoves, slot positions.
2. **Starting layout** — which objects occupy which slots when a room is created or regenerated.

Keep one environment. Do not introduce appearance themes. Floor, wall, background, and lighting remain independent user controls. Generated architecture is still a list of boxes and named slots. Generated objects remain ordinary assignable, movable content through pickup/place, swap, stash, and undo.

A generated room must be playable immediately: add, place, move, stash, undo, export, reload.

## Why not random boxes

The current room is authored data in `src/core/layout.ts`:

- `boxes[]` for walls, floors, loft, stairs, accents
- `slots[]` with stable ids such as `floor-1` and `loft-2`
- Saved rooms store `layoutId` plus placements that point at those slot ids
- `validateRoom()` rejects unknown layouts and unknown slots

Unconstrained noise would produce unusable rooms: overlapping slots, objects in walls, stairs to nowhere, camera framing that clips the scene, and saved placements that no longer resolve.

Variety should come from **seeded grammars**, not from scattering primitives.

## Current constraints to preserve

- Existing `cozy-loft` rooms keep loading. Do not rename or remove its slot ids.
- Changing architecture is an explicit user action, not a silent reload mutation.
- If a generated design uses different slot ids, occupied placements cannot be auto-migrated by name. Unplace unmatched objects into inventory rather than dropping content.
- `src/core` stays engine-free. Generation returns `RoomLayout` data; `RoomView` continues to draw boxes and slots.
- Custom surface uploads, lighting, photos, and furniture kinds stay available on every generated room.
- Keep the isometric camera framing the room; later VR locomotion can consume the same walkable regions, but VR is not part of this plan.

## Two products, one seed

A generation request produces:

```ts
interface GeneratedRoom {
  seed: string;            // user-visible, copyable
  family: LayoutFamily;    // loft, studio, gallery, alcove, ...
  layout: RoomLayout;      // boxes + slots + palette defaults
  starting: StartingPlan;  // object kinds + slot ids + optional sample content
}
```

Persist enough to rebuild exactly:

- `layoutId` for authored layouts (`cozy-loft`)
- or `layout: { kind: 'generated', family, seed, params }` for generated layouts

Do not bake thousands of unique layouts into the source tree. Rebuild from seed at load time, then validate slots before accepting placements.

If a generator version changes, bump a `generatorVersion` and keep old versions callable so older saved generated rooms still rebuild. If a version cannot rebuild, fail visibly and offer inventory recovery, never a silent substitute layout.

## Layer A — room design grammar

Generate from **families**, then vary parameters inside each family. Families are recognizable room types, not texture packs.

### Families (first set)

| Family | What changes | Why it feels different |
| --- | --- | --- |
| `loft` | Current cozy loft, parameterized | Familiar baseline |
| `studio` | Single floor, no loft, more open wall | Wider placement field |
| `gallery` | Long back wall, rail/opening, shallow depth | Display-oriented |
| `alcove` | Side nook plus main floor | Natural reading corner |
| `split` | Partial platform, short run of steps | Two heights without copying cozy-loft |

Add families only when each one has occupancy rules, camera framing, and at least one good starting layout.

### Parameters inside a family

Seeded, bounded, and validated:

- Footprint width/depth in a small discrete set (for example 5.5 / 6.5 / 7.5 m), not continuous floats
- Window/opening pattern: closed, wide rail, two bays, corner opening
- Vertical feature: none, loft, alcove shelf, low platform
- Stair/step presence only when a reachable upper surface exists
- Accent volumes: 0–2 blocks or rails that create extra slots
- Slot density: sparse, medium, dense
- Default palette only as a fallback; user surface/lighting selections override

Do not randomize object meshes here. Architecture is boxes and slots. Furniture variety belongs in starting layouts and the existing object catalog.

### Slot generation rules

Slots are the playable contract. Every generated layout must satisfy:

- Unique slot ids local to that layout, with labels humans can read
- One slot per surface point; no two slots closer than a minimum radius (start at ~0.9 m for floor furniture, closer only for tabletop/shelf slots)
- Slot y matches the supporting surface
- Slot xz sits on a walkable/placeable surface, inset from edges and openings
- No slot inside a wall thickness or under a loft with insufficient headroom for the intended object class
- Enough slots for a useful room: minimum ~8, maximum ~18 for the first generator
- Slot classes: `floor`, `platform`, `shelf`, `step` so starting layouts can prefer sensible objects (rug/armchair on floor, mug/book on shelf)

Keep authored `cozy-loft` ids unchanged. Generated ids should be namespaced, for example `gen-floor-3`, so they never collide with later authored layouts.

### Geometry rules

- Watertight-enough box assembly: floor, two primary walls, optional loft/steps
- Openings punched as authored segments, not boolean soup
- Stairs exist only as a short, regular run to a platform; no decorative floating steps
- Preserve the back-corner origin and +x/+z wall convention so the isometric camera can keep using a family-specific look-at target
- Record a camera framing hint on the layout (`target`, suggested distance) so larger/smaller footprints still read in the current view
- Tag boxes with existing materials (`floor`, `wall`, `accent`) so current surface textures continue to apply

Reject and retry a seed if validation fails. Do not repair invalid geometry in the view layer.

## Layer B — starting layouts

A starting layout fills some slots of an already-valid design. It never creates immovable decor.

### Starter recipes

Each recipe is a weighted list of placements:

| Recipe | Intent | Example fills |
| --- | --- | --- |
| `empty` | Blank canvas | no objects |
| `reading` | Quiet corner | armchair, side table, plant, books, rug |
| `listening` | Music nook | turntable, records, plant, rug |
| `mixed-sample` | Current sandbox energy | photo, book, plant, mug, one furniture piece |
| `dense-studio` | Lived-in | many small objects, few large furniture pieces |
| `sparse-gallery` | Display | photo frames and one seating piece |

Rules:

- Use only existing `OBJECT_KINDS`
- Large furniture (`armchair`, `turntable`, `rug`, `sideTable`) only on floor/platform classes with clearance
- Rugs occupy a floor slot and reserve neighboring radius so a chair is not embedded in the rug
- Content items are either empty placeholders the user can retarget, or clearly marked sample links
- Do not auto-upload or invent personal photos
- Leave at least ~30% of slots free so the first action is still placement, not demolition
- `autoOrganize()` can later consume slot classes; it must not become the only generator

### Applying a starter

Starting layout is a Store operation, not a second scene graph:

1. Build/select layout
2. Optionally clear generated sample objects only (never user content without confirmation)
3. Create content + representations + placements through existing commands
4. One undo step should revert the whole starter apply

Regenerating architecture on a room that already has user content:

- Prompt: keep objects in inventory, or cancel
- Never delete content to make a new shape
- Re-place only when a slot class and clearance match; otherwise stash

## User-facing controls

Add a **Room design** section, separate from Floor/walls/background:

- Family picker, including authored `Cozy loft`
- Seed field with New seed / Copy seed
- Density: sparse / medium / dense
- Starting recipe
- Generate preview (does not overwrite until Apply)
- Apply to this room (undoable)
- Reset to Cozy loft architecture (undoable; content preserved in inventory if slots differ)

Preview must show the actual 3D room, not a 2D schematic. If preview-apply is too sharp for a first slice, generate into a new empty room instead of mutating the current one.

Do not hide these controls in a theme toggle.

## Persistence model

Recommended room fields:

```ts
layoutId: string; // 'cozy-loft' or generated id such as 'gen-loft-ab12'
layoutSpec?: {
  generatorVersion: number;
  family: string;
  seed: string;
  params: { density: 'sparse' | 'medium' | 'dense'; footprint?: string };
};
startingRecipe?: string;
```

Load path:

1. If `layoutId === 'cozy-loft'` and no `layoutSpec`, use authored layout (current rooms).
2. If `layoutSpec` present, rebuild, verify slot ids used by placements exist, then load.
3. If rebuild fails, show the error and recovery download; do not load sample.

Export includes `layoutSpec` so another machine can rebuild without a catalog of generated JSON meshes.

## Implementation slices

### 1. Layout registry and validation helpers

- Keep `cozy-loft` as the default authored layout
- Add pure functions: slot clearance, surface occupancy, box overlap, slot-on-surface
- Tests first: current cozy-loft passes; mutated overlapping slots fail

Done when authored rooms are unchanged and validators catch bad fixtures.

### 2. One parameterized family: loft

- Generate loft variants from seed: footprint, opening pattern, loft depth, slot density
- Always include a reachable loft when the family is loft
- Camera framing hint so the isometric view still shows the whole room
- Menu: seed + generate into a **new empty room** first, not in-place mutation

Done when 50 seeds all validate, produce visibly different slot maps, and roundtrip through export/import/reload.

### 3. Starting recipes on generated and authored rooms

- `empty`, `reading`, `listening`, `mixed-sample`
- Applied through Store commands; one undo reverts
- Respect slot classes and clearance
- Preserve user content when re-applying by stashing unmatched placements

Done when recipes place only legal objects, leave free slots, and survive reload.

### 4. In-place regenerate with inventory safety

- Apply previewed design to the current room
- Unmatched placements move to inbox; content is never deleted
- Explicit Reset to Cozy loft

Done when a furnished room can change shape without losing titles, photos, or URLs.

### 5. Additional families

Add `studio` and `alcove` only after loft variants are stable. Each family needs:

- occupancy tests
- at least two starter recipes
- a screenshot review set (low/medium/high density, two seeds)

### 6. Optional later

- Slot-class-aware `autoOrganize()`
- Shared recipe files in `rooms/` as generated samples, not as the generator itself
- VR walkable regions derived from the same occupancy grid
- Authoring a family visually and freezing it as `cozy-loft`-style source

## Acceptance evidence

1. **Model tests:** 50+ seeds per family validate; unique slot ids; minimum clearance; stairs only with platforms; unknown old rooms still load; failed rebuild never overwrites storage.
2. **Desktop:** generate, apply, undo, export/import/reload; furniture still pickable; surfaces/lighting independent; custom uploads still work.
3. **Visual:** screenshot grid of families × densities. Variety should be architectural (open vs lofted vs alcove), not just recolored walls.
4. **Safety:** generating never deletes content; cozy-loft slot ids remain stable; no theme split returns.

Browser checks should assert slot counts, occupancy, and that canvas pixels change across seeds. Pixel change alone is not enough.

## Out of scope

- Neural/LLM mesh generation
- Per-frame animated rooms
- Physics debris or destructible walls
- Multi-room neighborhoods
- Replacing pickup/place with freeform 6DoF furniture transforms
- Generating personal media
- VR locomotion implementation (consume occupancy data later)

## First deliverable

Ship slices 1–3 for the loft family only:

> New seed → a different loft shape with legal slots → apply Reading starter → move the armchair → undo → export/import → same seed rebuilds the same architecture.

That is enough to prove variety without risking current rooms.

## Grounding

- Current layout contract: `src/core/layout.ts`
- Room validation and placement: `src/core/store.ts`
- Independent surfaces: `src/core/surfaces.ts`
- Existing sandbox principle: rooms are data; views are adapters (`plan.md`)
