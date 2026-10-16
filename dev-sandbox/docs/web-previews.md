# Browser webpage previews — scoped expansion for #65

## Outcome and policy

Matt's nine own-site URLs previously returned `kind: card` solely because their hosts were missing from `FRAMABLE_SITES`. The regression test failed with `Https://dvgpro.com: 'card' !== 'embed'` before the fix. Notes and room layout were not this gate.

This change deliberately adds **six exact hosts** (plus their `www` spelling) instead of embedding every unknown public URL. This is a conservative, tested increment toward #65, **not completion of universal public-page coverage**. Unknown hosts, unlisted subdomains, other GitHub Pages accounts, private/local addresses, YouTube channels, DistroKid and Amazon remain cards with the original external-open action. No room/save/schema migration; researched notes and supplied URL strings remain untouched.

- Official YouTube video, Vimeo, Spotify, SoundCloud and Wikipedia resolution remains in place. Channels/profiles are not turned into playable videos.
- Ordinary page previews require HTTPS, no credentials and no nonstandard port. Exact URL spelling after standard URL parsing (www, path, query, fragment) is retained; HTTP is not silently rewritten. Existing official-provider HTTP-to-HTTPS mapping remains.
- Page frames use only `sandbox="allow-scripts"`: no same-origin privilege, forms, popups, downloads or top navigation. This keeps even redirects back to our app isolated. Direct same-origin frames are omitted. Provider players retain their existing sandbox, playback allow-list and referrer policy.
- Browsers still enforce CSP/frame-ancestors, X-Frame-Options and mixed-content rules. No proxy, frame-header removal, privileged content fetching or unrestricted remote execution.
- Preview title, permanent loading/blank guidance and a 44px **Open in browser** action remain outside the iframe. Cross-origin `load` is **never** treated as proof of success. An embed's action opens its preview URL; the inspect card's original link remains available too.
- Opaque-origin sandboxing intentionally limits storage, authenticated flows and some CORS resources. A rendered document is not a guarantee that every game, synth, form, font or application API works. Open the original for full browser features. Clock/Apollo/Pluto fonts/modules and DVGProOS API requests showed sandbox-origin CORS errors during checks.

## Support matrix (2026-10-16)

All 14 original strings and response/redirect evidence are recorded in [web-preview-checks.json](web-preview-checks.json). Headers were fetched with GET and redirect following, not inferred from public accessibility. Frame documents were inspected using browser automation outside the app; the app itself cannot read cross-origin DOM.

| Supplied destination | Actual browser outcome | App policy after fix |
|---|---|---|
| DVGPro | Document rendered | Page preview |
| Davis Clock Services | Document rendered; some fonts/modules CORS-limited | Page preview |
| Apollo's Learning Corner | Document rendered; some fonts/modules CORS-limited | Page preview |
| Apollo `/Games/` | Document rendered | Page preview |
| GitHub Pages Bass Station II | Document rendered | Page preview |
| GitHub Pages TinkerWorkbench | Document rendered; full gameplay not certified | Page preview |
| GitHub Pages SparkTinkerGame | Document rendered; full gameplay not certified | Page preview |
| Pluto LLC | Document rendered; font CORS-limited | Page preview |
| DVGProOS | Document rendered; API/CORS-limited | Page preview |
| DistroKid Cyber-Funk | X-Frame-Options SAMEORIGIN refusal | Card + original open |
| DistroKid Neon Arcade | X-Frame-Options SAMEORIGIN refusal | Card + original open |
| DistroKid fm1m | X-Frame-Options SAMEORIGIN refusal | Card + original open |
| YouTube channel | Redirect to www; X-Frame-Options SAMEORIGIN refusal | Card, not a video |
| Amazon short link | Redirect to Amazon; browser SAMEORIGIN refusal; curl destination returned 500 | Card + original open |

## Verification

- `npm test`: 147 passing tests, including owned URLs, hostile/lookalike/unknown URLs, insecure page URLs, exact destination preservation and provider regression coverage.
- `npm run build`: TypeScript + Vite pass (existing bundle-size advisory).
- `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs MP_URL=http://127.0.0.1:5174 node tests/browser-web-preview.mjs`: actual browser tests for sandbox permissions, same-origin omission, redirect-to-app isolation, CSP/XFO fixture enforcement, network failure and usable noopener external handoff. Fixtures use real browser response enforcement; no fake DOM classes. Run against the HTTPS live preview as well to cover its origin.
- Fresh Chromium contexts at desktop 1440×1000 and touch/mobile 390×844: select every Matt object in the actual Three.js room. Nine frame documents render at both sizes; five retain cards. Assertions check real frame text/URL, nonzero on-screen iframe bounds, Open action visibility and no horizontal page overflow. Screenshots inspected for phone DVGPro and desktop TinkerWorkbench.
- These are **phone viewport emulation**, not physical iPhone/Safari testing, not headset/VR validation. PR #56/#27 remain separate. Full site interactivity and provider media playback are not certified by document tests.

No automatic PR merge. The live preview may run this branch for phone review before merging; reload the page, select Matt's room, then a website object. Existing personal saves are not cleared.
