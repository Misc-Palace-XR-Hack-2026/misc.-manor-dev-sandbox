# Room / embed audio coordination (#78)

## Contract and inventory

- Music starts **only** after the native speaker gesture. Session enabled/muted state is not a saved room setting. Lighting, surfaces, soundtrack selection and personal saves are unchanged.
- Existing desktop menu/preview outbound anchors and XR's appended-and-clicked anchor all pass through the document's capture-phase link handler. They pause immediately, even if a popup is blocked. Returning focus/visibility clears outbound suspension. A blocked popup with no focus transition may require returning focus before playback can resume.
- Hidden, blur, page lifecycle, outbound and embed suspension are independent. One reason ending cannot override another. `pagehide`/`pageshow` support is restored. Return never enables music that the user has not enabled or has muted.
- An actual supported playback event pauses synchronously (no fade overlap). Store updates, autoplay retries and speaker clicks cannot restart room audio while suspended. The speaker's temporary-pause state still lets the user mute their listening intent; re-enabling intent waits for suspension to end.
- Track-transition fades still clamp volume to [0, 1], and interruption invalidates older asynchronous fades.

## Precisely supported providers

**Vimeo video players** at `https://player.vimeo.com/video/<numeric-id>` automatically coordinate room audio. The adapter uses Vimeo's official Player API message protocol: `ping`/`ready`, `addEventListener` for `play`, `pause`, `ended`, then those playback events. References: [official player.js](https://github.com/vimeo/player.js), [message transport](https://github.com/vimeo/player.js/blob/master/src/lib/postmessage.js), [event subscription / origin and source checks](https://github.com/vimeo/player.js/blob/master/src/player.js). No external SDK script or new dependency is needed.

Every incoming message must match **both** the exact HTTPS provider origin and `contentWindow` of a connected, registered iframe whose source is unchanged. Only the shared preview factory registers frames. JSON is parsed, never substring-matched. Generic `playing`, YouTube-like strings, opaque `null` origins, unregistered and removed frames are ignored. Readiness and iframe `load` never mean playing. Removal/replacement/source change unregisters the player; reload clears its playing state and repeats the handshake. State aggregates active registered players, so one ending cannot resume music over another.

**YouTube, Spotify, SoundCloud, Wikipedia and ordinary page previews do not have automatic playback coordination in this MVP.** They now explicitly tell the user to mute room music before playing in-frame, or use **Open in browser** (which suspends room audio). Do not describe their generic messages as supported APIs. Adding their official player APIs is follow-up work, not implied support. Vimeo unavailable/blocked by the network remains subject to the preview's existing blank-player/open-browser fallback; no proxy or frame-policy bypass is used.

Ordinary page iframes retain the opaque `allow-scripts` sandbox. Existing provider sandbox, permissions, URL policy and exact preview URLs are unchanged. Desktop and granted XR DOM overlay both use `PreviewCardView` → `createEmbedFrame`; the canvas-only XR fallback has no embedded player.

## Reproducible verification

```sh
npm ci
npm test
npm run build
# Isolated dev server; choose an unused port, never restart another checkout.
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
# Install Playwright separately if it is not already available; no app dependency needed.
APP_URL=http://127.0.0.1:5178 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/embed-audio.browser.mjs
APP_URL=http://127.0.0.1:5178 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/soundtrack-control.browser.mjs
```

`embed-audio.browser.mjs` uses real Chromium, a real cross-origin sandboxed iframe served by a deterministic Vimeo-protocol fixture, and real room MP3 playback. It verifies handshake/subscriptions, presence versus playback, pause/end/dismiss, stale/untrusted messages, independent blur/visibility/outbound/mute and saved choices. Visibility/focus edge combinations are injected deterministically; outbound opens a real browser popup. This is protocol/lifecycle coverage, **not** a live Vimeo service or device audio certification.

The full-app speaker smoke checks desktop click/keyboard and Chromium mobile tap emulation, real advancing media time, no unsolicited startup play, manual mute, unchanged saves, off-state, touch target and overlay bounds. Its old expectation of one startup autoplay rejection was stale: main already starts silent until enabled, and the assertion now matches that contract.

Physical iOS/Safari gesture unlock/resume, live provider network/account restrictions, actual headset audio overlap, and headset DOM-overlay grants remain **unverified**. No first-load autoplay guarantee is made.
