# MVP integration candidate: #81 + #82 + #83

This is a combined candidate for user testing, **not an independent fourth feature**.
No remote merge, issue closure, automatic Done update, or live preview changes.

## Exact inputs

- Main: `376aacc` (fetched before integration).
- #81 audio: `3a81dbb759b3b19b61d907f97b38f542601faf61`.
- #82 Preview: `ead902cb62661f4da0f5c15082ed3211f2a7ab10`.
- #83 tutorials: `b6413fc5d85714882977b9e8508837705ed4aade`.
- Reuses local hardened Preview/tutorial integration `dd9b448`; merges latest #83 ancestry (equivalent hardened test changes) and #81. Individual PR branches remain unchanged.

## Preserved integration decisions

Preview uses `canEdit` at Store and UI boundaries, including during disposable practice. Session epochs and edit generations invalidate late imports/uploads after practice or mode round trips. Practice writes no personal room, backup, preference or undo data. Skip/Exit remains reachable. Content drafts close on Preview. Selected inspector edit actions rebuild on mode change, but the separate media iframe can remain active: its pause reason must remain until playback stops or the frame is dismissed. Explicit mute survives all those transitions and room navigation.

## Verified locally

- `npm ci`: zero audited vulnerabilities (npm reported unapproved esbuild install-script advisories; installed toolchain executed successfully).
- `npm test`: **206 passed, zero failed**.
- `npm run typecheck`: pass.
- `npm run build`: pass; existing >500 kB Vite chunk advisory remains.
- `browser-mvp-integration.mjs`: full app desktop 1440x1000/mobile 390x844, real room MP3 + cross-origin Vimeo protocol fixture; active media remains paused across Preview/Edit; dismissal resumes room music; explicit mute survives practice/Skip/return/room switch; personal state unchanged and zero transient writes before intentional room navigation.
- `browser-practice-preview.mjs`: desktop/mobile practice pause/resume, blocked Preview replay/events, late import rejection across mode round trip, personal writes absent.
- `browser-interaction-mode.mjs`: desktop/mobile inspect/Open, mutation guards, photos, navigation, pickup restoration, draft cancellation, async invalidation and reload contract.
- `browser-tutorials.mjs`: 1440x1000, 390x844, 360x640, 844x390; all five lessons, imports, replay/Skip/reload, reachable exits, highlight geometry, personal-save preservation.
- `embed-audio.browser.mjs`: Vimeo, YouTube-nocookie and YouTube.com protocol fixtures; real audio, origin/source rejection, independent pause reasons, dismissal, reload and timer cleanup.
- `soundtrack-control.browser.mjs`: desktop keyboard/click and mobile touch; gesture-only start, manual mute, advancing real media time, saved choice and control bounds.
- Desktop chrome, mobile chrome and onboarding browser suites: pass.
- Screenshots captured under the isolated worktree's `evidence/` directory (local, not committed). Visually inspected desktop Preview, desktop placement guide, mobile bookmark guide and mobile integrated Preview. Exit/import controls and selected placement pad are visible. Blank provider panel in integration screenshots is the deliberate protocol fixture, not a claim of live Vimeo playback.

Rerun from `dev-sandbox` with an isolated Vite server:

```sh
npm run dev -- --host 127.0.0.1 --port 5193 --strictPort
# In another shell; set PLAYWRIGHT_MODULE to your Playwright installation:
MP_URL=http://127.0.0.1:5193 node tests/browser-mvp-integration.mjs
# Audio suites use APP_URL instead of MP_URL.
```

Existing older browser suites retain their machine-local Playwright convention. New integration test accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `MP_URL`, `MP_SCREENSHOTS`.

## Merge overlap / user acceptance

Choose one landing strategy after user testing: merge this combined candidate, **or** land the individual PRs then rebase/review only remaining integration changes. Do not treat this candidate and #81/#82/#83 as four additive feature PRs. This branch retains all three exact heads as ancestors, so a normal merge commit can preserve that relationship; squash merging does not. Do not close overlapping PRs or issues automatically. If any source PR changes, refresh this candidate and rerun its interaction checks.

No new production defect was found during this integration run; existing hardened conflict resolutions were reused. Initial new-test failures were test assumptions (iframe navigation timing, media persistence across modes, editor backdrop), corrected without changing production behavior. Review was self-review in a one-shot subagent; independent human/agent review remains appropriate before merging.

Physical iOS Safari audio unlock/resume, picker/keyboard/safe areas; real headset controllers, DOM-overlay grant, media overlap, comfort and tutorial readability remain unverified. Mobile tests are Chromium emulation. Provider fixtures are not live Vimeo/YouTube acceptance; prior #81 live YouTube evidence was not rerun here. Preview remains desktop/mobile only and requires Edit room before VR. User visual acceptance remains open.
