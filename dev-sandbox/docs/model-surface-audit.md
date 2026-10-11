# Model surface and landing audit

## Fixed causes

- **Teapot:** the handle torus was rotated into YZ, edge-on to the spout/body silhouette. Keep it in XY and lower its center from 0.12 to 0.10 so both attachment arcs enter the tapered body.
- **Headphones:** rotating the half torus by pi inverted the headband. Use its default upward arch with endpoints at y=0.13 inside the earcup tops.
- **Top stair:** step-4 occupied z=2.8..3.55 while the loft occupied z=0..3, both with top y=2.3 and bottom y=2.0. Trim the stair to z=3..3.55, retaining landing height, outer edge, IDs, and every saved slot.

The XR floor/loft guide meshes were inspected: their y positions are 0.02/2.32 (20mm above the floors), their materials disable depth writes, and the loft guide ends at z=2.6, before the stair. They do not explain the concrete coplanar stair/loft overlap. No XR interaction or guide changes were made.

## All-kind triangle audit

`tests/coplanar-audit.ts` examines production meshes in world space, buckets same-facing coplanar triangles, clips projected triangles to require positive-area overlap, and ray-tests overlap centroids from outside to reject buried joints. It includes a synthetic detector test for exposed overlap, buried overlap, and edge-only contact. It does not mistake a general bounding-box intersection for z-fighting.

All **29** kinds are enumerated directly from `OBJECT_KINDS` in `tests/coplanar-surfaces.test.ts`. Before the surface fixes, 9 kinds failed with these mesh pairs; each was rerun after its focused change:

| Kind | Confirmed exposed conflict | Fix |
| --- | --- | --- |
| photoFrame | Frame and stand bottom faces | Inset stand base by 0.002; frame remains grounded |
| mug | Solid ceramic cap and coffee top at y=0.14 | Hollow lathed cup with inner wall/rim; coffee top y=0.135 |
| notebook | Binding/ribbon and body front, back, bottom faces | Slightly extend trim depths and inset their bottoms |
| armchair | Seat and both arms' overlapping front/back faces | Seat depth 0.64 -> 0.62 |
| sideTable | Marble and brass undersides at y=0.544 | Lower brass trim center 0.55 -> 0.548 |
| turntable | Deck and album holder front/back faces | Deck width 0.38 -> 0.36, ending at holder edge |
| console | Knob cap and control-panel top | Raise knob base 0.08 -> 0.10 |
| vhs | Red indicator and casing front face | Move indicator z=0.08 -> 0.084 |
| recordSleeve | Spine overlapping cover/back top, bottom and outer edge | Butt spine against jacket left edge instead of overlapping it |

No exposed conflicts were detected in: book, record, tv, boombox, box, plant, trophy, rug, cat, teapot, lantern, headphones, cassette, cushion, cartridge, spoon, robot, telescope, car, motorcycle. After fixes all 29 pass. The earlier telescope/car/motorcycle/robot/vinyl assembly tests still pass; turntable scale remains 0.8. Identifiers, object-kind inventory, save schema, slots, and assignability are unchanged.

## Verification

- Observed failing tests before fixing teapot orientation, headphone crown/endpoints, and stair/loft seam, followed by passing runs.
- Observed the real-triangle audit fail for all 9 affected kinds, then pass individually after changes; final audit: 30/30 including detector self-test.
- `npm test`: **86 passed, 0 failed**.
- `npm run build`: passed TypeScript and Vite. Existing large-chunk warning remains (main bundle approximately 681kB).
- `git diff --check`: clean.
- System Chromium with working WebGL (`--use-angle=gl --enable-webgl --ignore-gpu-blocklist`): all 11 changed models and landing rendered front/side/isometric, with actual production builders/layout.
- Inspected the three contact sheets and actual desktop/mobile room screenshots. Teapot loop and headphone arch are connected and correctly oriented; mug coffee sits inside its rim; landing has an adjacent color boundary rather than a shared tread area.
- All 11 changed kinds exercised through assignment, placement, reload, real **Pick up** UI, and replacement on desktop and mobile: **22 pickup/replacement checks**, **6 saved-context checks**, no page runtime errors.

Artifacts: `/home/dvgpro/.hermes/artifacts/misc-palace-surface-review/`

- `sheet-1.jpg`, `sheet-2.jpg`, `sheet-3.jpg`: inspected multi-view contact sheets.
- `results.json`, `furniture/results.json`, `details/results.json`: browser checks and individual screenshot paths.
- `summary.json`: aggregated evidence (85 screenshots; all files exist).
- `verification.log`: final full test/build output.

Reproduce visuals with the existing Vite server:

```sh
MODEL_KINDS=teapot,headphones,mug,notebook,photoFrame,armchair,sideTable,turntable,console,vhs,recordSleeve,landing ARTIFACT_DIR=/home/dvgpro/.hermes/artifacts/misc-palace-surface-review node tests/visual-models.mjs
```

The visual harness renders every requested kind; its room interaction fixture uses the first four. Additional runs with `MODEL_KINDS=photoFrame,armchair,sideTable,turntable` and `MODEL_KINDS=console,vhs,recordSleeve` cover remaining changed models.

## Limits

No physical Quest/headset verification was performed. These static geometry checks and desktop/mobile renders cannot prove that every headset-dependent temporal artifact is gone. The detector targets exact coplanar inter-mesh surface conflicts, not arbitrary near-coplanar depth precision, self-overlap within one mesh, shadow acne, all possible occlusion directions, transparent sorting, or user-content texture artifacts. Content overlay offsets were inspected in source but the all-kind mesh audit uses content-free builders. Room geometry beyond the stair/loft pair was not exhaustively triangle-audited. Existing unrelated decorative details were left untouched.
