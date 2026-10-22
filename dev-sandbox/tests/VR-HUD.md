# VR HUD verification

The shared canvas skin in `src/xr/hud.ts` applies to the command panel, tutorial,
keyboard, object actions, hover label and content preview. It uses rounded double
rims inspired by the user's **Modern & Clean GUI** reference (Fab listing
https://www.fab.com/listings/4177bace-3780-4c57-9417-19828c1d613f), with opaque
teal reading surfaces rather than translucent text backgrounds for headset contrast.
Mint indicates focus/primary actions; warm amber marks selected fields/kinds/caps.
No fonts, art assets or sounds are downloaded by this skin.

## Run

```sh
npm test
npm run typecheck
npm run build
# Start Vite separately, then use an installed Playwright module:
MP_URL=http://127.0.0.1:5537/dev/ \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
XR_EVIDENCE_DIR="$TMPDIR/manor-hud-evidence" \
node tests/browser-xr-hud.mjs
```

Also run `tests/browser-xr-rooms-keyboard.mjs` with the same environment, and
`tests/browser-xr-preview.mjs` for preview image pixels and desktop/XR isolation.
Chromium defaults to `/usr/bin/chromium`, with an isolated Playwright profile.

## Evidence and limits

The HUD harness captures the real production CanvasTextures in the real Three.js
room through WebGL: world-space home/hover, keyboard/selection, object actions,
and hover card, plus full-resolution canvas images for long text and pagination.
It checks 550 control rectangles over 25 pages for bounds, overlap and hit mapping,
ray-tests the unified Edit action, verifies hover reset and unmultiplied white
material tint, and checks text contrast (minimum 7.17:1 across button states).

These are synthetic XR lifecycle tests, **not physical headset evidence**.
Controller ergonomics, stereoscopic readability and actual DOM-overlay support
still need a device check. The existing room scene, save logic, unified Edit
routing and green-loft/short-floor portal effects are unchanged.
