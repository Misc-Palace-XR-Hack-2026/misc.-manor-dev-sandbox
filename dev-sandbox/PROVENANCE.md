# DataMemoryPalace reuse — first pass

Sandbox-only adaptation. Source remains read-only; this file records what was copied and how it was changed.

## Source (do not modify)

- `/home/dvgpro/Projects/DataMemoryPalace/src/xr/study.js`
- `/home/dvgpro/Projects/DataMemoryPalace/src/xr/study-visuals.js`
- `/home/dvgpro/Projects/DataMemoryPalace/src/xr/room-layout.js`
- `/home/dvgpro/Projects/DataMemoryPalace/src/xr/room-editor.js`
- `/home/dvgpro/Projects/DataMemoryPalace/src/library.js`
- `/home/dvgpro/Projects/DataMemoryPalace/src/model.js`

No license file was present in the source tree at the time of this pass.

## Copied into the sandbox

| Target | Source | What moved |
| --- | --- | --- |
| `src/core/appearance.ts` | `study.js` `LIGHTING_PRESETS` | Preset keys, labels, sun/hemi/lamp colors and intensities, verbatim. Sandbox adds a `loft` lighting option so the original room is unchanged until the user picks a study preset. |
| `src/views/study-decor.ts` | `study-visuals.js` `addStudyDecor` | Armchair, side-table, record-player groups (local origins, walnut/brass/fabric, candle, vinyl platter, album sleeves). Leaf geometry + `plant()` (no hanging strands). `surfaceTexture('wood')` and `surfaceTexture('rug')` canvas generators. |
| `src/views/objects.ts` `titleTexture` | `study.js` `titleTexture` | Local canvas title, Georgia, no HTML. Sized for standing books and lying notebooks. |

## Intentionally not reused this pass

- Full VR / neighborhood / free furniture editor (`room-editor.js`).
- Writing desk, pegboard, easel, clock, telescope, globe, and other study architecture.
- GLB models (source furniture is procedural).
- Arbitrary remote image URLs as textures.
- Source storage keys or personal browser data.

## Sandbox mapping

- Original loft geometry and `cozy-loft` slots stay the layout of record. There is no split appearance theme; lighting is independently selectable.
- Armchair, side table, turntable cabinet, rug and leafy plant are ordinary content representations. Each has an independent local-origin builder and uses the existing assignment, pickup/place, swap, stash and undo flow.
- Legacy appearance saves migrate to optional top-level lighting, preserving content and placements. Invalid local saves show recovery downloads without overwriting stored data.
- Photos are `ContentItem.imageData` (PNG/JPEG data URLs, max 1024px / 1.5 MB encoded). Import/export uses the existing room JSON path.
- `mp-sandbox:room` remains the only localStorage key; tests must not write into DataMemoryPalace keys.
