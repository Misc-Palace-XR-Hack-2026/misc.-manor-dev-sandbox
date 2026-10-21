# MVP VR lifecycle audit

Base: `376aacc` (main). Scope: #27, #75, #76, #77. This is software evidence, not headset acceptance. No card is closed by this change.

## Implemented here (#76)

- Link-mode blank/malformed input previously silently created a note. It now returns an error with no Store mutation; intentional notes still use Note mode. Shared `safeUrl` normalization accepts hostname inputs.
- Draft validation existed but was never painted on the world-space menu. Render it in the header on every creation page, without displacing controls or save errors.
- Submit is on a late paginated form page. Creation replaces the form with two completion buttons, but retained the late page index, hiding both the placement/Inbox explanation and Close. Clamp pagination after the button list changes.

Regression-first evidence: malformed input failed with an unexpected new representation ID; real Chromium paginated submit failed missing completion/Close; removing the error rendering reproduced missing world-space feedback. All pass with the fixes.

## Existing behavior checked, not reimplemented

- #76: new note enters canonical pickup; disconnect restores its placement; XR exit restores a new held item; pre-creation Cancel adds nothing; repeated create does not duplicate; full room leaves content in Inbox with visible completion guidance. These are exercised through a real RoomView and synthetic XR callbacks in Chromium.
- #75: current unit tests exercise continuous ascent/descent, both landings, out-of-route/height guards, deadzone and bounded frame delta. No stair geometry or saved placements changed here.
- #27: current source captures DOM-overlay grant before setSession; selection/placement/end clear preview content. Existing Chromium preview smoke covers world-space rendering, actual image pixels, desktop → XR → pickup → exit isolation. This does NOT prove a granted headset iframe or provider playback.
- #77: existing Chromium onboarding smoke passes desktop/mobile welcome, success-gated create, skip and replay. PR #83 owns expanded safe practice/shared lesson work; it is deliberately not duplicated here. World-space tutorial popup unchanged.

## Remaining software follow-ups (not hardware excuses)

- XR keyboard currently lowercases content and lacks `:`, `=`, `&`, `_`, `%`, `#`, `+`, `@`. Arbitrary case-sensitive media URLs cannot be entered faithfully. A proper keyboard/input slice needs case/symbol controls and URL round-trip tests.
- On stairs, `updateControllers` continues after left-stick walking, skipping that controller's menu and snap-turn handling. Unit ramp tests do not cover that dispatch path; add synthetic gamepad coverage before changing it.
- `XrSession.enter` has no explicit cleanup around rejected `renderer.xr.setSession` after a granted overlay. Add a rejected-session lifecycle fixture before changing grant/session ownership.
- Expanded onboarding/practice transitions must be integrated and retested with unmerged PR #83, rather than adding a competing runner on main.

## Verification / rerun

From `dev-sandbox`:

```
npm ci
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 5297 --strictPort
MP_URL=http://127.0.0.1:5297 node tests/browser-xr-creation.mjs
MP_URL=http://127.0.0.1:5297 node tests/browser-xr-preview.mjs
MP_URL=http://127.0.0.1:5297 node tests/browser-onboarding.mjs
```

Browser scripts require Playwright (`PLAYWRIGHT_MODULE` may point at an existing install) and Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`). Explicitly set MP_URL: inherited session environments can point at a different running worktree. Initial port 5193 was occupied; final verification used this isolated worktree at 5297. Baseline: 189 unit tests passed; final: 190 passed. Build passes with existing large-chunk advisory. No dependency/lockfile change.

## User / headset check

1. On this branch over HTTPS, enter VR → Add object → navigate to Create without a title. Header must explain the error, no object added.
2. Enter a title and malformed link: URL error; switch to Note and create. Completion explanation and Close must appear immediately, not after repeated Previous taps.
3. Point at a pad and place; repeat Create rapidly and confirm only one item. Start another creation and Cancel before submit.
4. Create and disconnect controller / exit before placing: item remains at its automatic fallback pad. Full room: new content is in Inbox, with an explanation.
5. Still required separately: physical keyboard/ray usability, controller mapping, headset input/comfort on both stair directions, actual overlay grants and provider play/pause/volume, immersive tutorial transitions. Synthetic callbacks and mobile Chromium emulation are not this proof.

Live checkout and personal saves were not touched. PRs #81/#82/#83 remain separate, unmerged, and unchanged.
