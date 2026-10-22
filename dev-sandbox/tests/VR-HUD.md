# VR glass HUD verification

`src/xr/hud.ts` supplies the command panel, tutorial, QWERTY keyboard,
object actions, hover label and content preview. The user's **Modern & Clean GUI**
reference is a glass/material direction, not a teal palette:
https://www.fab.com/listings/4177bace-3780-4c57-9417-19828c1d613f

- Neutral smoke panel: real canvas alpha 0.38 (62% background transmission in open areas).
- Fine white stroked rims, no nested full-area filled borders that accumulate opacity.
- Button beds composite to alpha 176/255 on the panel; floating action pills use
  their own 0.70 smoke bed. Every surface remains translucent.
- Opaque white labels, quiet ice-white primary/focus accents and pale warm selection.
  Local text shadows help bare-glass headings/preview copy against bright detail.
- Three materials use transparency, full material opacity, no depth writes and no
  tone mapping, so text does not fade with the panel or change with scene exposure.
- No backdrop blur, refraction or frosted-glass claim: world geometry remains sharp.
  No new sounds, fonts or downloaded artwork.

## Local visual review (no headset required)

```sh
npm run dev -- --host 0.0.0.0 --port 5538 --strictPort
```

Open `http://127.0.0.1:5538/tests/vr-glass-review.html`. This dev-only page mounts
production RoomView and XR components with an isolated guest store. Switch between
Guest / Omari / Vinyl Lounge, Panel / Keyboard / Object-preview. Click production
panel/key hit rectangles. It is not included in the production Vite build.
The regular application remains at `/dev/`; no tunnel changes are necessary.

## Verification

```sh
npm test
npm run typecheck
npm run build
export MP_URL=http://127.0.0.1:5538/dev/
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export XR_EVIDENCE_DIR="$TMPDIR/manor-glass-evidence"
node tests/browser-xr-hud.mjs
node tests/browser-xr-rooms-keyboard.mjs
node tests/browser-xr-preview.mjs
node tests/browser-glass-review.mjs
```

Chromium defaults to `/usr/bin/chromium`, using an isolated profile and actual WebGL.
The HUD harness checks 550 controls over 25 pages for bounds/overlap/hit mapping,
ray-tests the unified Edit action, hover reset and unmultiplied material tint.
It samples **actual canvas alpha**, and renders the production material over black
and white into a WebGL target to verify that the world changes the pixels behind
it. Solid light/dark WebGL screenshots use a separate renderer to avoid the room
renderer viewport/lifecycle state affecting fixture output.

The old opaque-hex contrast assumption is removed. The replacement composites the
sampled button-bed alpha over black/midgray/white and measures opaque white label
contrast: 19.34 / 12.20 / 6.61:1. This is a **button-bed calculation**, not a claim
that every translucent header has 4.5:1 contrast over arbitrary room detail.
Bare-glass labels use local shadows and are inspected visually. Review screenshots
cover bright room windows, the dark populated Vinyl Lounge, the keyboard and preview.

All XR lifecycle tests are synthetic, **not physical headset evidence**. Controller
ergonomics, stereo readability and actual DOM-overlay support still need a device
check. Save/data handling, unified Edit routing, teleport and upstream demo changes
are unchanged. Do not merge until visual review approves the glass treatment.
