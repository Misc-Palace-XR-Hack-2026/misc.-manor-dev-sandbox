# Guitar / VR rear-surface verification

Base: `2aa4b46`, branch `fix/guitar-vr-backfaces` in isolated worktree `palace-guitar-vr-backfix`.

## Defects and fixes

- `guitar`: the soundhole was a hole in the full-depth body extrusion, so the rear showed a recessed dark disc instead of continuous wood. Split the same silhouette into a solid 0.012-deep rear panel and the remaining perforated body. Front position, hole, strings and silhouette unchanged.
- `vrDevice`: all existing lens-like parts were on exterior +Z. Added a perforated dark facial interface, raised oval foam eyecups and convex low-roughness lenses on wearer-facing -Z. Lens seats meet the shell; the original front and strap remain unchanged. The preserved strap partially obscures optics in straight rear views, as expected for a headband.
- No kind, content, persistence, root scale, animation or lighting changes.

## Checks

- Two geometric regression tests: both fail against original `2aa4b46` production source (esbuild onLoad substitution, no worktree rollback), both pass fixed. Guitar uses 25 rear rays checking flush opaque wood and outward normals plus two front checks. VR uses 18 optical rays checking wearer position/material/normals, paired rim/recess/support checks, and front preservation. Eye rays originate inside the strap to avoid testing the headband instead of the optics; normals use inverse-transpose matrices for nonuniformly scaled lenses.
- Full `npm test`: **247 passed, 0 failed, 0 skipped**.
- `npm run typecheck` and `npm run build`: passed. Vite retains a >500 kB chunk-size advisory.
- System `/usr/bin/chromium`, `--use-angle=gl --enable-webgl --ignore-gpu-blocklist`: actual production builders rendered front/back/side/rear-isometric, eight images. Desktop (1440x1000) and mobile (390x844) actual room: four kind/device scenarios, real picker and pickup button, Store placement, reload, slot/kind/content preserved. Zero page or console errors. Fresh contexts; no personal saves touched.
- Harness served only on loopback strictPort 28463, with fetched source marker confirming this worktree. Initial port 5197 was occupied; source check rejected it before rendering and its server was not touched.
- Images visually inspected: closed wooden guitar rear, retained front opening, recessed paired wearer optics, room rendering on both sizes.

## Persistent evidence

`/home/dvgpro/.hermes/artifacts/guitar-vr-backfix/`

- `{guitar,vrDevice}-{front,back,side,isometric}.png`
- `{desktop,mobile}-{guitar,vrDevice}-room.png`
- `models-contact.png`, `rooms-contact.png`
- `red-guitar.log`, `red-vr.log`, `red-both-final.log`, `test.log`, `build.log`, `browser-results.json`
- `verify.mjs` (re-runnable isolated browser harness)

Limitations: no physical XR headset test; room placement uses the real Store API after real UI pickup, not a simulated pointer drop. Front VR glass was already mostly occluded by its exterior face and intentionally remains unchanged. Origin URL locally names `misc.-palace-dev-sandbox`, not the requested `misc.-manor-dev-sandbox`; fetched configured origin and verified expected base without modifying remotes. No GitHub writes, push, merge, or live-preview changes.
