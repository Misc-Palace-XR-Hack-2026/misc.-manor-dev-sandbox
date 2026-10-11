# Cozy objects and upholstery buttons

## Confirmed defect

The sofa-like model is the existing `armchair`, not a separate sofa kind. Its backrest rotates -0.16 radians around X, but the nine decorative tuft buttons used a fixed parent-space Z of -0.21. The first failing regression measured a button center at backrest-local Z 0.078665, beyond the 0.06 front plane even after accounting for its 0.015 radius. Other rows diverged with the slope.

Buttons are now children of the backrest, centered on its local front plane. All nine intersect the upholstery and follow its transform. The existing kind and saved content are unchanged.

XR action placement was also inspected: `session.ts` uses selected world bounds (center X/Z, max Y), then `objectMenuAnchor` adds 0.55. That is a separate intentional floating action strip, not the confirmed upholstery defect. No speculative XR anchor changes were made. Desktop modal-only visibility remains covered by `xr-object-menu.test.ts`.

## Catalog

Added `clock` (mantel clock), `guitar` (acoustic guitar), `synthesizer`, `drum`, `lamp` (table lamp), and `coffeeMaker`. No exact requested kinds existed. Existing `lantern` is a distinct paper lantern; it and the mug/teapot/turntable remain untouched rather than repurposing their saved appearance. No second sofa kind was added.

The shared catalog drives desktop inventory and XR lists. Every new kind has a dedicated glyph and label and uses the existing Store assignment, pickup, placement, undo, and save paths. Schema version stays 1. New models are static content representations, not playable instruments or live appliance simulations. The lamp has an emissive shade, not an additional room light.

## Verification

- TDD: upholstery intersection regression failed before parenting fix; all six catalog/integration cases failed before implementation; guitar assembly regression failed before adding string supports and recessed soundhole.
- `npm test`: 100 passed, 0 failed. Includes all-kind coplanar checks, desktop XR visibility, existing geometry fixes, and per-new-kind save/content/XR move/place checks.
- `npm run build`: passed; Vite warns about the existing single bundle size exceeding 500 kB.
- `git diff --check`: passed.
- System Chromium WebGL: front/side/isometric renders, desktop/mobile room checks, UI pickup/replacement and saved reload, zero page errors.
- `tests/visual-cozy-interactions.mjs`: all six kinds assigned through the actual inventory picker on desktop and mobile, reloaded, picked up, replaced, and checked for unchanged content. Placement uses Store, not simulated headset rays.
- No physical Quest session was available. Headset readability, comfort and controller interaction still require device verification.

## Artifacts

Under `/home/dvgpro/.hermes/artifacts/`:

- `cozy-models-a/`: clock, guitar (initial), synthesizer (initial), drum; room screenshots and results.json.
- `cozy-models-b/`: lamp, coffeeMaker, armchair, final synthesizer; room screenshots and results.json.
- `cozy-guitar-final/`: final guitar in three views, desktop/mobile room checks and results.json. Supersedes earlier guitar screenshots.
- `cozy-interactions/`: desktop/mobile modal screenshots and per-kind UI check results.json.

Use `cozy-models-b/armchair-side.png` to verify tuft attachment against the backrest slope.
