# Public webpage preview policy (#65)

Replaces the generic page-host **allowlist** with a documented **blocklist**. An eligible public HTTPS
page may *attempt* a sandboxed iframe even if we have never tested it. Eligibility is permission to try,
never a promise that the page renders. The browser remains the authority on whether framing happens.

Scope: desktop/mobile browser previews only. VR overlay/headset parity remains **#27** and is not claimed
here. Existing saved links, researched notes and room JSON are untouched; no schema or storage migration.

## Decision order

`buildPreview()` → `embedFor()` evaluates, in this order:

1. **Safe URL parse.** `safeUrl()` rejects unsafe schemes (`javascript:`, `data:`, `file:`, `ftp:`, …).
2. **Eligibility gate — `publicPreviewUrl()`.** Syntactic only (see below). Ineligible → card + Open.
3. **Official provider embeds win.** YouTube watch/short/embed/live → `youtube-nocookie.com/embed`;
   Vimeo numeric video; Spotify track/album/playlist/episode/show/artist; SoundCloud track/set or
   `on.soundcloud.com` short link (visual player); Deezer track/album/playlist/artist;
   Wikipedia `/wiki/` article. A channel, profile or landing page is **not** a player and falls through.
4. **Blocklist.** Known-unsuitable host → card + Open, no wasted iframe attempt.
5. **Otherwise** → `provider: 'page'` sandboxed attempt at the unmodified destination URL.

Nothing in this pipeline proxies, prefetches, rewrites headers or strips framing protections.

## Eligibility rules (`publicPreviewUrl`)

Rejected, in all cases, for an automatic preview attempt:

| Rule | Why |
|---|---|
| scheme is not `https:` | no insecure or mixed-content loads from an HTTPS app |
| `username` or `password` present | embedded credentials must never be replayed by a frame |
| any explicit `port` | non-standard ports are a common internal-service shape |
| host has no dot, or is a reserved suffix | `localhost`, `local`, `internal`, `intranet`, `lan`, `home`, `home.arpa`, `localdomain`, `test`, `invalid`, `onion` (exact host or dot-boundary subdomain) |
| **any** IP literal | all dotted-quad IPv4 and all bracketed IPv6 are rejected — not just private ranges |
| label is not LDH-shaped | blocks underscore/percent/unicode-escape authority tricks |
| same origin as the app | host + scheme + port equal to `location.origin` |

`new URL()` canonicalizes alternate address spellings **before** these checks, so `127.1`,
`2130706433`, `0x7f000001` and `0177.0.0.1` all arrive as `127.0.0.1`, and `[::ffff:127.0.0.1]`,
`[::1]`, `[::]`, `[fc00::1]`, `[fe80::1]` arrive bracketed. Rejecting every IP literal means
loopback, RFC1918, CGNAT (`100.64/10`), link-local (`169.254/16`, `fe80::/10`), unique-local
(`fc00::/7`), `0.0.0.0` and `[::]` are all covered without maintaining a range table — and also means
public IP literals such as `8.8.8.8` are refused. That is intentional: a URL with no hostname has no
reputation to reason about.

`createEmbedFrame()` re-runs `publicPreviewUrl()` before assigning `src`, so a preview constructed by
any caller (desktop card, VR overlay, test) cannot smuggle in an ineligible destination.

## Exact-host vs subdomain matching

One rule shape is used for both the reserved-suffix list and the blocklist:

```
hostMatches(host, rule) === host === rule || host.endsWith('.' + rule)
```

- Matching is on the **canonical host**: lowercased, one trailing dot stripped (`GITHUB.COM.` → `github.com`).
- A rule matches the **exact host and every dot-boundary subdomain**: `github.com` blocks `github.com`,
  `www.github.com` and `a.github.com`.
- A rule never matches by substring or suffix without the dot: `notgithub.com`,
  `github.com.example.com` and `other-user.github.io` are **not** blocked. (`github.io` is deliberately
  absent — GitHub Pages sites generally do frame, and `github.com` refusing framing says nothing
  about `*.github.io`.)
- Blocklist rules are compared against the full hostname, not a `www.`-stripped one, so a rule cannot
  be dodged with a leading label.
- There are **no exceptions/unblock entries.** If a subtree needs different treatment, add the
  narrower host as its own rule rather than introducing allow-overrides; a one-rule-shape list is the
  thing that keeps this auditable.

## Blocklist

Ownership: the preview blocklist is maintained in `src/core/preview.ts` (`PAGE_BLOCKLIST`) by the
dev-sandbox maintainers. **Maintenance rules:**

1. An entry needs a recorded reason in the table below — a real observed refusal or a stated product
   reason. "Looks risky" is not a reason.
2. Entries are added/removed by PR touching code **and** this table together;
   `tests/preview-policy-doc.test.ts` fails if the two drift in either direction.
3. Prefer the narrowest host that covers the observed behavior.
4. A block is **not** a prohibition on visiting: Open in browser still works for every blocked host.
5. Re-check entries opportunistically. Sites change headers; a stale block only costs a preview, so
   removal is low-risk and needs only fresh evidence.

| Host | Reason |
|---|---|
| `github.com` | X-Frame-Options refusal |
| `gitlab.com` | X-Frame-Options refusal |
| `codeberg.org` | framing refusal |
| `bitbucket.org` | framing refusal |
| `developer.mozilla.org` | framing refusal |
| `news.ycombinator.com` | framing refusal |
| `reddit.com` | framing refusal |
| `twitter.com` | framing refusal |
| `x.com` | framing refusal |
| `facebook.com` | framing refusal; also a tracking surface |
| `instagram.com` | framing refusal |
| `linkedin.com` | framing refusal |
| `discord.com` | framing refusal |
| `youtube.com` | provider route only; channel/landing pages refuse framing and are not players |
| `youtube-nocookie.com` | reached only via the official embed route built above |
| `youtu.be` | provider route only; a bare short link is handled as a video id |
| `vimeo.com` | provider route only; non-video paths are not players |
| `spotify.com` | provider route only; profile/landing pages are not players |
| `soundcloud.com` | provider route only; profile pages are not players |
| `on.soundcloud.com` | SoundCloud short link; official widget, not a generic page frame |
| `deezer.com` | provider route only; landing pages are not players |
| `widget.deezer.com` | reached only via the official embed route built above |
| `link.deezer.com` | Deezer short link; we do not follow redirects |
| `wikipedia.org` | provider route only; non-article paths are not previews |
| `twitch.tv` | framing refusal on channel pages |
| `distrokid.com` | verified X-Frame-Options SAMEORIGIN refusal (see web-previews.md) |
| `hyperfollow.com` | verified X-Frame-Options SAMEORIGIN refusal |
| `amazon.com` | verified SAMEORIGIN refusal; short links redirect |
| `amzn.to` | Amazon short link; redirects into `amazon.com`'s SAMEORIGIN refusal |
| `a.co` | Amazon short link; same refusal as above |

Provider rules are evaluated **before** the blocklist, so blocking `youtube.com` removes generic page
framing of channel pages without removing the official player for a watch URL.

## Framing security (not weakened)

- Page frames carry `sandbox="allow-scripts"` only: no `allow-same-origin`, forms, popups, downloads,
  top-level navigation or pointer lock. The framed document gets an opaque origin, so even a redirect
  back onto the app origin cannot reach the parent DOM or our storage.
- Provider players keep their existing sandbox, playback allow list and
  `referrerpolicy="strict-origin-when-cross-origin"`.
- CSP `frame-ancestors`, `X-Frame-Options` and mixed content rules are enforced by the browser. We
  neither read nor alter response headers. There is **no proxy**, no header rewriting and no
  framing-security bypass of any kind.
- Opaque-origin sandboxing intentionally costs the framed page storage, authenticated flows and some
  CORS resources. A page that renders is not a page that fully works — Open in browser is the answer.
- HTTP destinations are never auto-loaded. `previewOpenUrl()` is a deliberately **wider** gate for the
  explicit user handoff (click, `target=_blank`, `rel="noopener noreferrer"`): HTTP, blocked hosts,
  non-standard ports, private hosts and even our own origin are all permitted, because the click hands
  the address to the user's own browser and the alternative is hiding a link the user saved themselves.
  It refuses only unsafe schemes (via `safeUrl`) and **embedded credentials**, which must never be
  replayed into a new tab. Frame eligibility stays strict; that asymmetry is the point.

## Honest UX states

| State | What the user sees |
|---|---|
| attempting | `Loading…` (`role="status"`) |
| iframe `load` fired | `Blank? Use Open.` (or `Mute music, or Open.` when room audio cannot duck automatically) — a cross-origin **load event is not proof of** render success, so we never upgrade this to "loaded" |
| iframe `error` fired | `Could not load.` |
| ineligible / blocked | card with title, domain, favicon and the reason — **plus the Open action**; the card root drops `aria-hidden` and becomes pointer-interactive so the link is actually clickable and reachable by assistive tech |
| unsafe scheme | card with the raw text and **no link at all** (nothing safe to navigate to) |
| always | **Open in browser** action, outside the iframe, reachable in every state that has a safe address |

No state removes the Open action, and no state leaves an empty panel: the title, guidance line and
Open link are siblings of the frame, not children of it.

## Support and limitations matrix

Honest about what a browser-side URL policy can and cannot do.

| Concern | Enforced? | By what |
|---|---|---|
| unsafe schemes | yes | `safeUrl()` + eligibility gate |
| embedded credentials | yes | eligibility gate |
| non-standard ports | yes | eligibility gate |
| loopback / private / link-local / CGNAT / ULA, IPv4 and IPv6 forms | yes, syntactically | reject all IP literals after URL canonicalization |
| reserved suffixes (`.local`, `.internal`, `.home.arpa`, `.onion`, …) | yes | exact/subdomain rule |
| same-origin framing of the app | yes | eligibility gate + `createEmbedFrame` recheck |
| insecure (HTTP) auto-load | yes | HTTPS-only eligibility |
| mixed content after an HTTPS→HTTP redirect | yes, **by the browser** | HTTPS parent refuses the insecure subresource; we only observe the honest fallback |
| CSP `frame-ancestors` / `X-Frame-Options` | yes, **by the browser** | we never read or strip them |
| parent DOM / storage access by a framed page | yes | opaque-origin `sandbox="allow-scripts"` |
| **DNS rebinding** | **no** | a hostname that resolves to a private address at fetch time is indistinguishable from a public one at URL-parse time. Mitigation is the opaque sandbox (the frame can send requests but cannot read our DOM or return results to us), not the URL check. |
| **redirect chains** | **no** | only the first URL is inspected. A blocked or private destination can be reached via a redirect from an eligible host. The sandbox, not the URL policy, is what contains that. |
| **SSRF-style protections** | **no** | this is a browser feature using the user's own network and credentials-free opaque frame. It is not a server-side fetcher and must never be described as one. |
| proof that a page rendered | **no** | cross-origin frames expose no readable state; load/error events are advisory |
| full site functionality in a frame | **no** | opaque origin breaks storage, auth and some CORS |
| provider media actually playing | **no** | not asserted by document-level tests |
| **VR / headset parity** | **no** | separate work in **#27**; browser coverage alone does not satisfy it |
| physical iOS Safari behavior | **no** | mobile evidence here is Chromium phone emulation |

## Browser evidence

`tests/browser-public-preview.mjs` (Playwright + `/usr/bin/chromium`) at desktop 1280×900 and mobile
390×844, against an isolated HTTPS dev server for this worktree. It asserts real browser enforcement
rather than DOM stubs:

- a frameable public fixture **outside the old allowlist** renders inside the frame, and the frame's
  document reports an opaque origin (`data-isolated`), with `sandbox="allow-scripts"`;
- the guidance text says `Blank?` after `load` — never "loaded";
- `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` fixtures produce
  `net::ERR_BLOCKED_BY_RESPONSE` and no framed content;
- an aborted request and a dispatched `error` keep the panel populated and the Open action visible;
- a redirect back onto the app origin still renders opaquely and cannot touch the parent DOM;
- an HTTPS→HTTP redirect is refused by the browser as mixed content;
- HTTP, YouTube channel, SoundCloud profile, private-IP and same-origin URLs all produce cards with
  zero iframes;
- Open in browser is visible, inside the viewport, `target="_blank"`, `rel="noopener noreferrer"`,
  and the opened popup has a null `opener`, in every state above;
- a real `https://example.com/` load is attempted and its outcome recorded as live evidence or
  explicitly marked unavailable — the fixture result is never reported as live-site proof.

Artifacts (JSON manifest + per-state screenshots) land in `artifacts/issue65/`.

### Recorded run (2026-10-20)

Server: isolated Vite dev server for **this worktree only**, `127.0.0.1:5207` HTTPS (self-signed) and
`127.0.0.1:5208` HTTP, both `strictPort`. Serving checkout verified before trusting results by curling
`/src/core/preview.ts` and confirming `publicPreviewUrl` present and `FRAMABLE_SITES` absent — ports
5173/5174/5185/5186/5190/5191 belong to other worktrees and were avoided.

| Check | Result |
|---|---|
| `npm test` | 224 tests, 224 pass, 0 fail |
| `npm run typecheck` | clean |
| `npm run build` | pass (pre-existing >500 kB chunk advisory) |
| `tests/browser-public-preview.mjs` @ HTTPS 5207 | PASS, desktop 1280×900 **and** mobile 390×844 |
| `tests/browser-web-preview.mjs` @ HTTPS 5207 | PASS, HTTPS mixed-content refusal verified |
| `tests/browser-web-preview.mjs` @ HTTP 5208 | PASS |
| `tests/browser-xr-preview.mjs` | PASS (synthetic; no headset) |
| `tests/browser-desktop-chrome.mjs`, `browser-mobile-chrome.mjs`, `browser-onboarding.mjs` | PASS |

Live-network result at both viewports: `https://example.com/` **rendered its documentation paragraph
inside the cross-origin frame** — a frameable public page outside the old allowlist, classified from
the frame's DOM rather than from an `load` event.

`tests/browser-smoke.mjs` and `tests/browser-matt-room.mjs` fail on this branch **and identically on
pre-#65 `HEAD`** (`browser-smoke` times out waiting for `Title (optional)`); they are pre-existing
failures unrelated to this policy and were not touched.

Mobile evidence is Chromium phone emulation, not a physical iOS/Safari device. No headset was used.

Earlier scoped header/redirect evidence for the 14 supplied destinations remains in
[web-previews.md](web-previews.md) and [web-preview-checks.json](web-preview-checks.json).
