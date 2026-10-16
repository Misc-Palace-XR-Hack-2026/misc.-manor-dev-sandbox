# Matt’s cyberpunk demo room — issue #59

## Acceptance and scope

All **14** supplied URLs are represented once, as movable ordinary link objects, in Matt’s dedicated `rooms/matt.json` seed. The original request said 13; the actual inventory is 14. `docs/matt-research.json` is the per-URL manifest: original spelling, resolved destination, retrieval status, researched notes, object kind and authored slot. Source strings remain exact, including `Https://dvgpro.com`, YouTube’s query string and the Amazon short link. The existing safe-URL resolver normalizes outbound hrefs at runtime; the seed and manifest do not rewrite them. Existing editor URL normalization still applies if a user saves an edited item.

Reuse `look-cyber` / Neon observatory: graphite-circuit floor, neon-ribbed walls, ion-aurora background, cyber lighting, follow-lighting soundtrack. No shared preset, room geometry, other room seed or global appearance changed. Existing music is used; no third-party tracks were downloaded.

- Loft: Cyber-Funk turntable, Neon Arcade cassette on the block, Tree Bar guitar and Refinery synthesizer.
- East display: DVGPro frame, DVGProOS toolkit box and family mantel clock.
- East learning corner: Apollo notebook, solar-system book and retro arcade console, with YouTube TV nearby.
- Front maker area: Ignite robot and quiz cartridge; Pluto car at the open front-right floor slot.

The `fm1m` music page identifies **Live @ the Tree Bar**. All sites yielded readable text except YouTube (title only); its note explicitly avoids inferred channel content. DVGProOS notes distinguish portal concepts/early access from available products. Raw extraction failed because this environment’s web backend is search-only; browser DOM reads succeeded. Batch attempt records retain that limitation. No login, purchase or publication was performed.

## Enriched notes

Optional `ContentItem.notes` (up to 4000 characters) is validated, exported, undoable and shown using textContent in the existing item card/list. Edit item exposes a Notes textarea. Old rooms need no migration and no new notes are added to unrelated seeds. Links remain `sourceKind: url`, `type: link`; notes do not replace destinations.

## Load without overwriting personal saves

Safest preview: run this isolated checkout on a **different origin/port**, or open it in a fresh private browser session. The verification server is `http://127.0.0.1:5178`, separate from the existing 5173 app. In the bottom room-name button (initially Guest room), select **Matt’s room**. When no Matt save exists on that origin, the dedicated repo seed is used automatically. Do not clear localStorage.

If that origin already has a Matt save, switching rooms intentionally keeps it, even after this seed changes. Use a new private session/origin to view this demo without modifying the old save. To intentionally replace an existing Matt room, first export it from Edit room → Export JSON, then select Matt and use Load repo room → matt; that last operation replaces the active room and is not a non-destructive preview. Other room saves remain separate. No real user browser saves were changed during implementation; browser tests use a fresh Playwright context.

## Verification

- TDD: dedicated seed regression failed with `Matt needs a dedicated repo seed`; optional-notes regression failed validation before implementation; browser test failed because notes were absent from the inspect card before UI wiring.
- `npm test`: **137 tests passed, 0 failed**. Includes exact 14-link inventory, seed priority, preset equivalence, valid unique placements, every object’s pickup/place/two-command undo, roundtrip persistence, existing-Matt-save priority and unrelated-save preservation.
- `npm run build`: TypeScript and Vite succeeded. Existing large-bundle advisory remains (>500 kB).
- `node tests/browser-matt-room.mjs`: passed on system Chromium with `--use-angle=gl --enable-webgl --ignore-gpu-blocklist`. Tests real WebGL, notes display/edit/undo, UI pickup, Store placement and reload persistence, desktop 1440×1000 and phone 390×844, no page errors.
- Screenshots inspected: `/home/dvgpro/.hermes/cache/scratch/matt-room-evidence/matt-cyberpunk-desktop.png`, `matt-clock-notes.png`, `matt-cyberpunk-phone.png`.
- Desktop shows cyan circuitry, magenta ribbed walls, aurora, spaced objects and readable inspect notes. Phone retains the app’s existing cropped room camera (pan/zoom to reach edges); no global camera redesign was included. Browser WebXR reports VR not supported; no headset claim.

Browser test overrides: `MATT_ORIGIN`, `MATT_EVIDENCE`. Its Playwright import follows the repository’s existing machine-local browser-test convention.
