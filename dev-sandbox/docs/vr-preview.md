# Selected-object preview in VR

Selecting an object in immersive VR shows a canvas-textured card above its existing action row. The card uses the desktop `buildPreview` and `mediaArt` content resolvers: media art, title (two lines), note excerpt or source/domain (four lines), and a browser-handoff hint where relevant. Long text is wrapped and ellipsized. Local photos and supported direct image URLs appear as aspect-preserved thumbnails; YouTube links attempt a video thumbnail. Other embeds retain type-specific art instead of an iframe.

The card stays at the selected object's world position and faces the viewer (billboard orientation, not a headlocked position). It is decorative: controller rays only hit the action pills, never the preview surface. Edit, Move, Put away and safe-URL Open retain their existing behavior; Close clears selection. Move hides the card/action row during destination placement. Leaving VR and desktop selection keep this UI hidden. Desktop PreviewCardView and click-view are unchanged.

## Browser limitations

- WebXR cannot render DOM iframe players as scene textures. There is no in-headset embedded video/audio/page player in this card.
- Open uses the existing browser link handoff and requests XR exit. Browser popup/user-activation policies can block a new tab; headset behavior requires device testing.
- Cross-origin images must grant CORS access for WebGL; failed/blocked images keep media-type art. No proxy, scraping or media downloading is added.
- Files saved as path/name references have no stored bytes and cannot be previewed/opened as local files. Embedded local photos do render.
- This is preview parity, not a new content editor: Edit remains the existing VR object-kind chooser; full text/photo editing stays in the desktop UI.

## Evidence

`npm test` covers preview creation, word wrapping, dismissal, ray pass-through, world-position invariance and desktop isolation, plus existing interaction tests. `npm run build` includes TypeScript checking.

With Vite running at localhost, run `node tests/browser-xr-preview.mjs` (same local Playwright/Chromium setup as the background regression). It exercises actual RoomView/XrSession lifecycle methods with synthetic VR state, pickup hiding, local-photo pixel decoding and a real WebGL render. It saves `$TMPDIR/xr-preview.png`. This is **not** an emulated or physical WebXR session: controller ergonomics, readability above tall furniture, real stereo comfort and browser Open handoff remain Quest acceptance checks.
