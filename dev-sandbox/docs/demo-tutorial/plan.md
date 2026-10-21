# Misc. Manor demo: plan (living doc)

Source idea: `demo-idea-dump-1.txt`. Branch: `feature/demo-landing` (from `main`).
Update the checklist and decisions as work lands.

## Decisions

- **Branch**: `feature/demo-landing` off `main`. The `trailer/scenes` branch stays separate (bloat; its new object kinds also break main's saved-room validation when sharing the localhost:5173 origin).
- **Routes** (one Vite multi-page app, one codebase):
  - `/` the demo (the final product, not a hand-off to the sandbox)
  - `/intro` redirects to `/?intro` (replays the walk-in and tutorial)
  - `/dev/` untouched dev sandbox (`src/main.ts`)
  - `/about/` static skeleton, content TODO
- **The demo is a real room.** It is the same `RoomView` the sandbox uses (cozy loft, normal lighting and backgrounds), not a separate stage. There is no fake intro space.
- **Flow**: first visit (or `?intro`) -> black -> a wooden door (close to the room's east edge) swings open on bright light while everything around it stays dark -> a smooth, quick (about 5.4s) first-person walk through it ("oblivion", camera looks straight ahead, one spline path) and the room lights up -> once inside, look at the starter box, then the shelf, and stay there (locked tutorial) -> visitor picks up the starter objects and places them on the shelf, with no instructions or text -> lock lifts about 1.4s after the last one is placed (or on Skip) -> the same room, now open (isometric orbit view, edit tools such as theme).
- **Mechanism**: `RoomView.setDemo(hooks)` takes optional `DemoHooks` (`camera` override, restricted `slots`, object `yaw`, per-frame `frame` callback). Passing a camera disables OrbitControls. `release()` calls `setDemo({ frame })`, which restores the default camera and slots while the jukebox keeps animating. Edit tools (`src/demo/room-app.ts`, `mountEditTools`) load lazily after release, so the locked tutorial shows only the room.
- **Entrance and jukebox**: both on the open east side. The jukebox stands at ground level beside where the east wall ends (`JUKEBOX_POS` in `core/intro-timeline.ts`), outside the room with its face toward the room. Scaled to 0.6 and about 55% opaque so it does not distract. Look unchanged, no mouth yet, non-interactive. The camera does not glance at it.
- **Intro objects**: hardcoded rocket, drum, cassette (`src/demo/intro-objects.ts`), seeded as locked url content in tray slots `floor-7/8/9` in a decorative open wooden box (to be revisited): rocket = Unpacking (unpackinggame.com), drum = the about page, cassette = lofi YouTube (inline embed). `locked` content: link, text, rename and delete are fixed; the object kind can change and the object can be stashed. Dropped-object policy: link not editable, can be stashed (discuss later).
- **Previews**: one predictable place. The card is anchored by its bottom-right corner above a panel (`.demo-dock` in the tutorial, `.item-sheet` after release), so it grows upward, never overlaps the panel, and has a max height that stops below the top of the viewport. Cards for links are clickable and have an Open in browser link. What embeds follows main's public preview blocklist policy (`docs/public-preview-policy.md`, `core/preview.ts`): any public HTTPS page that isn't blocklisted tries a sandboxed iframe, so the rocket (unpackinggame.com) and drum (about page) may now preview live, and the cassette uses the official YouTube player. `show(preview, art, openUrl)` takes an optional override (the watch page behind an embed); otherwise cards use the policy's `openHref`. The dock also holds the kind picker.
- **Persistence (simplest version)**: the visitor's room autosaves through `Store` to `localStorage` key `mp-demo:rooms:demo-visit`. `roomKeys` routes room ids starting `demo-` to the `mp-demo:` prefix (sandbox stays `mp-sandbox:`). Intro-seen flag: `mp-demo:intro-seen`. An unreadable save is never overwritten, an error is shown instead. Per-visitor storage (accounts/server) is planned later.
- **Return visits**: straight into the open room with edit tools. Skip is always available.
- **Web first**; Quest/VR entry later (the VR enter button is hidden while locked).
- **Intro is not built on `core/onboarding.ts`**. Those lessons are form-driven DOM steps. The demo is a scripted timeline.

## Open questions (later)

- **Camera**: keep the isometric orbit view after the tutorial, or add a Minecraft-style roaming first-person camera for the demo? To discuss.
- Per-visitor storage beyond localStorage.
- Thumbnail pictures for the rocket and drum link cards (text card only for now).
- Where intro object text/links live (hardcoded now).
- Policy for editing dropped-object links.
- Rocket kind: main now ships it with the other toys (`views/toy-objects.ts`); the demo's own rocket model was dropped in the merge.
- The drum links to the about page. When the demo is hosted on that same origin, the preview policy refuses to iframe it (same-origin rule) and shows a "Preview unavailable" card. Decide: point it elsewhere, or special-case it.
- Jukebox mouth: deferred. The look is the priority.
- Intro tuning (camera path, timing, tutorial framing) needs the owner's eyes. No frozen-frame `?t=` param anymore; use Skip/`?intro` to replay.

## Checklist

- [x] Branch from main, baseline green
- [x] Remove omari and daniel rooms
- [x] Multi-page scaffolding (`index.html`, `dev/`, `about/`, `intro/`, `vite.config.mjs`)
- [x] Jukebox furniture (`src/demo/jukebox.ts`)
- [x] Rocket kind available on main
- [x] Intro timeline (`core/intro-timeline.ts`, pure, tested): walk-in camera, door light, black fade, first-visit flag
- [x] `RoomView` demo hooks (camera override, restricted slots, yaw, frame callback)
- [x] Demo room (`src/demo/demo-room.ts`): seed, tutorial slots, `tutorialDone`, `mp-demo:` storage prefix, tested
- [x] Demo app (`src/demo/demo-app.ts`): walk-in, locked tutorial, release, tray, door, jukebox, skip/continue overlay
- [x] Edit tools mounted lazily after release (`src/demo/room-app.ts`)
- [x] Removed the separate stage (`src/demo/stage.ts`)
- [x] `/intro` route
- [x] tsc clean, 208 tests pass, `vite build` green
- [x] Walk-in rework: straight look-ahead (fixes the door flip, which came from the look target equalling the camera position), light wall hides the room, box, no text, auto-release
- [x] Locked intro links with Open, kind-only edit, real door + darkness, ground-level jukebox, spline walk-in, bottom-anchored preview card + dock
- [x] Merge `origin/main` (toys, glow, app icon and rename, public preview blocklist, practice tutorials, VR button gating). Browser harnesses that need the sandbox must point at `/dev/`.
- [ ] Owner visual check: `/` first visit, `/intro` replay, return visit, `/dev/`, `/about/`
- [ ] Tune walk-in timing, tutorial camera, jukebox placement after owner review
- [ ] Decide camera approach (see open questions)

## Later

- Cassette special moment, then free view with import / random drop
- Functional jukebox (audio objects), glow to attract users, optional mouth
- Easter-egg intro objects (links)
- Curate the edit tools for the demo (currently the sandbox menu as is)
- Quest/VR entry
- Edit UI for intro object links
- Per-visitor persistence

## Trying it

- `/` first visit plays the walk-in and tutorial. `/intro` or `/?intro` replays it (resets the starter objects).
- Reset fully: delete the `mp-demo:*` keys in localStorage.
