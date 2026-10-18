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

- Expanded onboarding/practice transitions must be integrated and retested with unmerged PR #83, rather than adding a competing runner on main.

## Follow-up on `fix/xr-input-session-followup` (stacked on PR #85)

Base/dependency: PR #85 `fix/xr-creation-lifecycle` at `01dfbe808918427d9b67a31b4774b1cdcc0f650d`. Do not merge this follow-up into main independently of #85. PR #84 (#81–#83) is separate and unchanged.

Software gaps closed here:

- World-space keyboard inserts the pressed glyph as-is. Caps toggles letter case; URL punctuation includes `:&=?%#_+@` plus the previous `.,-/'!`. Mixed-case titles and query-rich URLs round-trip through `safeUrl` without lowercasing. Hostnames still follow URL serialization (`Example.com` → `example.com`); path, query, and hash case are kept.
- Stair walking no longer `continue`s past the same controller's snap-turn and menu button. Stick-forward teleport stays off while on the ramp so Y-axis walking does not also teleport.
- Rejected `renderer.xr.setSession` after a granted overlay hides the overlay, clears grant/menu overlay flags, ends the unused session, and leaves `presenting` false so a later Enter VR can retry.

Evidence: unit keyboard round-trip plus real Chromium synthetic XR/gamepad/setSession fixtures. Not headset acceptance.

## Verification / rerun

From `dev-sandbox`:

```
npm ci
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 5298 --strictPort
MP_URL=http://127.0.0.1:5298 node tests/browser-xr-creation.mjs
MP_URL=http://127.0.0.1:5298 node tests/browser-xr-preview.mjs
MP_URL=http://127.0.0.1:5298 node tests/browser-onboarding.mjs
MP_URL=http://127.0.0.1:5298 node tests/browser-xr-input-lifecycle.mjs
```

Browser scripts require Playwright (`PLAYWRIGHT_MODULE` may point at an existing install) and Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`). Explicitly set MP_URL: inherited session environments can point at a different running worktree.

## User / headset check

1. On this branch over HTTPS, enter VR → Add object → navigate to Create without a title. Header must explain the error, no object added.
2. Enter a title and malformed link: URL error; switch to Note and create. Completion explanation and Close must appear immediately, not after repeated Previous taps.
3. Point at a pad and place; repeat Create rapidly and confirm only one item. Start another creation and Cancel before submit.
4. Create and disconnect controller / exit before placing: item remains at its automatic fallback pad. Full room: new content is in Inbox, with an explanation.
5. Type a mixed-case title and a URL with `?&=%#_:` through the world-space keyboard, including Caps. The stored link must keep path/query/hash characters; do not expect host case to survive URL parsing.
6. While walking stairs, snap-turn and the menu button on the same controller must still work.
7. If Enter VR grants overlay then `setSession` fails, overlay chrome must clear and a later Enter VR must be retryable.
8. Still required separately: physical keyboard/ray usability, controller mapping, headset input/comfort on both stair directions, actual overlay grants and provider play/pause/volume, immersive tutorial transitions. Synthetic callbacks and mobile Chromium emulation are not this proof.

Live checkout and personal saves were not touched. PRs #81/#82/#83/#84 remain separate, unmerged, and unchanged.
