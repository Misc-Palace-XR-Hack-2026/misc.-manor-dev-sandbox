# Contextual desktop search (PR125)

The bottom magnifying glass stays left of Home / Help / Camera in the production room view. It searches the deduplicated room catalog in the neighborhood and the currently open room's items at home or while visiting. Help and Camera retain their coordinates. This is a native browser dialog, **not an immersive/headset search feature**; existing native XR panels and controls are unchanged. No sound effects were added.

## Item matching and selection

All query tokens must match the combined title, source reference (including note bodies), notes, tags, assigned representation kind and `OBJECT_LABELS`, plus available fetched page text. Matching ignores accents/case. Packed items use `lastObjectKind`, show `Packed` and an unpack instruction, and cannot select a nonexistent object or silently unpack. Ordinary results close the dialog and use `Store.select(representationId)`, preserving the normal selection sheet/actions. Results include a model label and matched snippet.

Search does not modify the room schema or serialize fetched text. Store epoch/visit/snapshot changes close and cancel the dialog; close/Escape abort pending work and restore trigger focus. Modal key handling does not run global edit/walk commands. Walk frame handling clears previously held keys and drag momentum, cancels simple click-to-walk glides, and pauses camera transitions while a dialog is open.

## Honest link-content coverage

Metadata is immediately searchable. The explicit **Index link text** button opts into public requests. No notes, titles, tags, saves or search queries are sent to an extraction service. There is no server proxy. Fetch uses browser CORS, `credentials: omit`, `redirect: error` and `referrerPolicy: no-referrer`.

A closed publisher allowlist is intentional: validating an arbitrary hostname's spelling cannot establish whether DNS resolves to a private network. Only HTTPS on default ports without credentials is accepted. IP literals, localhost/private hosts, non-HTTP schemes and arbitrary publishers are rejected without fetching. English MDN `/en-US/docs/...` URLs map to MDN's official `mdn/content` repository on `raw.githubusercontent.com`, retrieving the actual article Markdown, not just URL/title metadata. Raw GitHub text/Markdown is fetched directly. MDN paths without an official source mapping, English Wikipedia and Project Gutenberg are attempted directly and may fail CORS. No cookies, redirects, embedded HTML resources or scripts are followed.

Real Chromium requests from `https://omarchy-1.tail589b59.ts.net` verified:

- `https://developer.mozilla.org/en-US/docs/Web/JavaScript` → official Raw GitHub source, **8,810 characters indexed**. A body-only `scripting` query finds its item and displays the matched body snippet.
- The corresponding direct Raw GitHub URL also returned **8,810 characters**.
- `https://en.wikipedia.org/wiki/JavaScript` and Gutenberg's `pg11.txt` failed browser CORS and are reported **unavailable**, not indexed.
- `https://example.com/article` and `https://127.0.0.1/secret` were rejected before any request.

**This is not general web crawling.** Most existing outbound links will have metadata-only coverage. JavaScript-rendered pages, PDF/binary files, authentication, redirects and pages outside the allowlist are not indexed. Markdown snippets can retain source formatting. HTML text extraction uses an inert template, excludes script/style/navigation and never mounts publisher markup. Link counts and individual results distinguish not indexed, indexed, stale and unavailable.

Bounds: two concurrent workers, deduplicated source URLs per dialog, 8-second request timeout, 512 KB response limit, 100,000 indexed characters/page, 32-entry in-memory cache; successful entries expire after 15 minutes. Failures retry after one minute. Failed refresh retains explicitly **stale** text rather than claiming fresh coverage. Cache and search index are separate from saves and disappear on reload.

## Verification recipe

From `dev-sandbox` (use the existing port/tunnel, do not reconfigure them):

```sh
npm test
npm run typecheck
npm run build
PLAYWRIGHT_MODULE=/home/dvgpro/.hermes/cache/scratch/shortcut-browser/node_modules/playwright/index.mjs MP_URL=https://omarchy-1.tail589b59.ts.net node tests/browser-item-search.mjs
PLAYWRIGHT_MODULE=/home/dvgpro/.hermes/cache/scratch/shortcut-browser/node_modules/playwright/index.mjs MP_URL=http://127.0.0.1:5521 node tests/browser-neighborhood-shortcut.mjs
PLAYWRIGHT_MODULE=/home/dvgpro/.hermes/cache/scratch/shortcut-browser/node_modules/playwright/index.mjs MP_URL=http://127.0.0.1:5521 node tests/browser-prod-room-portal.mjs
```

The item browser harness verifies personal/visited matching and Store selection, packed results without unpacking, an **unmocked** publisher fetch/body-only match, modal typing plus previously held walking, populated-input Escape/focus, room-change cancellation, exact room JSON and localStorage preservation, and an explicitly synthetic inert-HTML extraction fixture. The production portal harness includes mobile bounds, return-home preservation and synthetic XR lifecycle/controller tests; those are not physical-headset evidence.

Run evidence is kept in scratch, not committed: `item-search-evidence/` (packed, real-body and visited selection screenshots, `publishers.json`), `item-search-unit.log`, and `item-search-portal-evidence/` / `item-search-portal.log`.
