# Selected-object preview in VR

Selecting an object in immersive VR shows a preview of the same content as desktop. When the headset grants WebXR **DOM overlay**, allow-listed embeds (YouTube, Vimeo, Spotify, SoundCloud, Wikipedia, and confirmed framable sites) use the **same sandboxed iframe** as the browser card (`createEmbedFrame`), so play/pause happens in-headset. If overlay is unavailable, the world-space canvas card remains: media art, title, note excerpt or source/domain, thumbnails, and a browser-handoff hint. Local photos and supported direct image URLs appear as aspect-preserved thumbnails; YouTube links attempt a video thumbnail when the canvas fallback is used.

The canvas card stays at the selected object's world position and faces the viewer (billboard orientation, not a headlocked position). It is decorative: controller rays only hit the action pills, never the canvas preview surface. The overlay iframe is interactive. Edit, Move, Put away and safe-URL Open retain their existing behavior; Close clears selection. Move hides the card/action row during destination placement. Leaving VR and desktop selection keep this UI hidden. Desktop PreviewCardView and click-view are unchanged.

## Browser limitations

- True iframe-in-headset requires a granted `dom-overlay` session. Enter VR requests `dom-overlay` as an optional feature with a dedicated overlay root. Quest Browser support can vary; if overlay is refused, the canvas card is the fallback and Open still hands off to the browser.
- Overlay does not claim that an iframe can be composited as a WebGL texture.
- Open uses the existing browser link handoff and requests XR exit. Browser popup/user-activation policies can block a new tab; headset behavior requires device testing.
- Cross-origin images must grant CORS access for WebGL; failed/blocked images keep media-type art. No proxy, scraping or media downloading is added.
- Files saved as path/name references have no stored bytes and cannot be previewed/opened as local files. Embedded local photos do render.
- This is preview parity, not a new content editor: Edit remains the existing VR object-kind chooser; full text/photo editing stays in the desktop UI.

## Evidence

`npm test` covers preview creation, word wrapping, dismissal, ray pass-through, world-position invariance and desktop isolation, plus existing interaction tests. `npm run build` includes TypeScript checking.

With Vite running at localhost, run `node tests/browser-xr-preview.mjs` (same local Playwright/Chromium setup as the background regression). It exercises actual RoomView/XrSession lifecycle methods with synthetic VR state, pickup hiding, local-photo pixel decoding and a real WebGL render. It saves `$TMPDIR/xr-preview.png`. This is **not** an emulated or physical WebXR session: controller ergonomics, readability above tall furniture, real stereo comfort and browser Open handoff remain Quest acceptance checks.
