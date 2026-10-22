// Browser proof for fix/seed-refresh-and-intro. Reproduces the user's actual situation.
// Run: node tests/browser-seed-refresh.mjs  (needs a dev server; set BASE)
import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://[::1]:5366';
const OUT = process.env.OUT ?? '/home/dvgpro/.hermes/cache/scratch/seed-refresh-evidence';
mkdirSync(OUT, { recursive: true });

const MATT_KEY = 'mp-sandbox:rooms:matt';
const MATT_BACKUP = 'mp-sandbox:rooms:matt:backup';
const DEMO_KEY = 'mp-demo:rooms:demo-visit';
const INTRO_FLAG = 'mp-demo:intro-seen';

// ---- the OLD matt save the user's browser is still holding ------------------
const committed = JSON.parse(readFileSync(join(process.cwd(), 'rooms/matt.json'), 'utf8'));
const legacyMatt = structuredClone(committed);
legacyMatt.owner = "Matt's room";
const keep = legacyMatt.contentItems.filter((c) => c.notes !== 'I love lamp').slice(0, 3);
const keepIds = new Set(keep.map((c) => c.id));
legacyMatt.contentItems = keep;
legacyMatt.representations = legacyMatt.representations.filter((r) => keepIds.has(r.contentItemId));
const repIds = new Set(legacyMatt.representations.map((r) => r.id));
legacyMatt.placements = legacyMatt.placements.filter((p) => repIds.has(p.representationId));
delete legacyMatt.seedRevision; // a legacy save records no revision - exactly the user's case
const LEGACY_MATT = JSON.stringify(legacyMatt);

// ---- a demo room whose tutorial is already finished -------------------------
const INTRO = [
  { id: 'intro-rocket', kind: 'rocket', title: 'Unpacking', url: 'https://www.unpackinggame.com/' },
  { id: 'intro-drum', kind: 'drum', title: 'About Misc. Manor', url: 'https://misc-manor-demo.vercel.app/about' },
  { id: 'intro-cassette', kind: 'cassette', title: 'lofi hip hop radio', url: 'https://www.youtube.com/watch?v=rFZHOHl-L8A' },
];
const FINISHED_DEMO = JSON.stringify({
  schemaVersion: 1, id: 'room_finished', owner: 'Visitor', layoutId: 'cozy-loft',
  contentItems: INTRO.map((o) => ({ id: o.id, type: 'link', title: o.title, sourceKind: 'url', sourceRef: o.url, tags: ['intro'], createdAt: '2026-01-01T00:00:00.000Z', locked: true })),
  representations: INTRO.map((o) => ({ id: `rep-${o.id}`, contentItemId: o.id, objectKind: o.kind })),
  placements: INTRO.map((o, i) => ({ representationId: `rep-${o.id}`, slotId: `shelf-${i + 1}` })),
});

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});

async function fresh(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   pageerror:', e.message));
  await page.goto(`${BASE}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((entries) => {
    localStorage.clear();
    for (const [k, v] of entries) localStorage.setItem(k, v);
  }, Object.entries(seed));
  return { ctx, page };
}

// ===== 1. the user's situation: stale matt save + stale intro flag, dev sandbox =====
{
  const { ctx, page } = await fresh({
    [MATT_KEY]: LEGACY_MATT,
    'mp-sandbox:active-room': 'matt',
    [INTRO_FLAG]: '1',
  });
  const before = await page.evaluate((raw) => {
    const r = JSON.parse(raw);
    return { items: r.contentItems.length, lamp: r.contentItems.some((c) => c.notes === 'I love lamp') };
  }, LEGACY_MATT);
  check('stale save really lacks the lamp note before the fix runs', before.lamp === false, before);

  await page.goto(`${BASE}/dev/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.store, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const s = window.store.state;
    return {
      owner: s.owner,
      roomId: window.store.roomId,
      items: s.contentItems.length,
      lamp: s.contentItems.some((c) => c.notes === 'I love lamp'),
      kinds: [...new Set(s.representations.map((r) => r.objectKind))],
      seedRevision: s.seedRevision ?? null,
      savedRevision: JSON.parse(localStorage.getItem('mp-sandbox:rooms:matt')).seedRevision ?? null,
      backup: localStorage.getItem('mp-sandbox:rooms:matt:backup'),
      playlists: s.contentItems.filter((c) => /playlist|mix|radio/i.test(c.title)).map((c) => c.title),
    };
  });
  check("Matt's room now shows the 'I love lamp' note", after.lamp === true, { items: after.items, lamp: after.lamp });
  for (const kind of ['lavaLamp', 'flyingSaucer', 'telescope', 'fireplace', 'turntable', 'lamp']) {
    check(`refreshed room renders a ${kind}`, after.kinds.includes(kind), '');
  }
  check('the refreshed room records the seed revision', !!after.seedRevision && after.savedRevision === after.seedRevision, after.seedRevision);
  check('the old save is recoverable from the backup key',
    after.backup !== null && JSON.parse(after.backup).contentItems.length === before.items, `${after.backup ? JSON.parse(after.backup).contentItems.length : 'none'} items kept`);
  await page.screenshot({ path: join(OUT, '01-matt-refreshed-from-stale-save.png') });

  // reload: a matching revision must not be refreshed or re-backed-up again
  const backupBefore = after.backup;
  await page.goto(`${BASE}/dev/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.store, null, { timeout: 15000 });
  const second = await page.evaluate(() => ({
    backup: localStorage.getItem('mp-sandbox:rooms:matt:backup'),
    lamp: window.store.state.contentItems.some((c) => c.notes === 'I love lamp'),
  }));
  check('a second load leaves the up-to-date save alone (backup still the old room)', second.backup === backupBefore && second.lamp, '');
  await page.screenshot({ path: join(OUT, '02-matt-second-load-stable.png') });
  await ctx.close();
}

// ===== 2. 'My room' (guest) is never reseeded =====
{
  const mine = structuredClone(committed);
  mine.owner = 'My room';
  delete mine.seedRevision;
  mine.contentItems = mine.contentItems.slice(0, 2);
  const ids = new Set(mine.contentItems.map((c) => c.id));
  mine.representations = mine.representations.filter((r) => ids.has(r.contentItemId));
  const rids = new Set(mine.representations.map((r) => r.id));
  mine.placements = mine.placements.filter((p) => rids.has(p.representationId));
  const raw = JSON.stringify(mine);
  const { ctx, page } = await fresh({ 'mp-sandbox:rooms:guest': raw, 'mp-sandbox:active-room': 'guest', [INTRO_FLAG]: '1' });
  await page.goto(`${BASE}/dev/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.store, null, { timeout: 15000 });
  const guest = await page.evaluate(() => ({
    owner: window.store.state.owner,
    items: window.store.state.contentItems.length,
    backup: localStorage.getItem('mp-sandbox:rooms:guest:backup'),
    saved: localStorage.getItem('mp-sandbox:rooms:guest'),
  }));
  check("'My room' keeps its own 2-item save and is never reseeded", guest.items === 2 && guest.owner === 'My room' && guest.backup === null && guest.saved === raw, guest.items);
  await page.screenshot({ path: join(OUT, '03-my-room-untouched.png') });
  await ctx.close();
}

// ===== 3. intro: stale flag, no saved demo room =====
async function demoRun(label, seed, path) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((entries) => { localStorage.clear(); for (const [k, v] of entries) localStorage.setItem(k, v); }, Object.entries(seed));
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  const state = await page.evaluate(() => ({
    url: location.href,
    locked: document.body.classList.contains('demo-locked'),
    skip: document.querySelector('.demo-skip')?.textContent ?? null,
    black: document.querySelector('.demo-black')?.style.opacity ?? null,
    savedShelf: (() => {
      try {
        const r = JSON.parse(localStorage.getItem('mp-demo:rooms:demo-visit') ?? 'null');
        return r ? r.placements.map((p) => p.slotId) : null;
      } catch { return 'unreadable'; }
    })(),
  }));
  await page.screenshot({ path: join(OUT, `${label}.png`) });
  await ctx.close();
  return state;
}

{
  const s = await demoRun('04-intro-plays-no-saved-room-stale-flag', { [INTRO_FLAG]: '1' }, '/');
  check('no saved demo room + stale seen flag still plays the intro', s.locked && s.skip === 'Skip intro', s);
}
{
  const s = await demoRun('05-intro-plays-with-tutorial-finished', { [INTRO_FLAG]: '1', [DEMO_KEY]: FINISHED_DEMO }, '/?intro');
  const inTray = (s.savedShelf ?? []).every((slot) => slot.startsWith('floor-'));
  check('?intro plays the intro even with the tutorial finished', s.locked && s.skip === 'Skip intro', { locked: s.locked, skip: s.skip });
  check('?intro puts the starter objects back in their box', inTray, s.savedShelf);
}
{
  const s = await demoRun('06-intro-path-replays', { [INTRO_FLAG]: '1', [DEMO_KEY]: FINISHED_DEMO }, '/intro/');
  check('/intro/ forwards to /?intro and replays the walk-in', s.url.includes('?intro') && s.locked && s.skip === 'Skip intro', { url: s.url, skip: s.skip });
}
{
  const s = await demoRun('07-returning-visitor-not-nagged', { [INTRO_FLAG]: '1', [DEMO_KEY]: FINISHED_DEMO }, '/');
  const onShelf = (s.savedShelf ?? []).every((slot) => slot.startsWith('shelf-'));
  check('a returning visitor with a finished room is not shown the intro again', !s.locked && s.skip === null, { locked: s.locked, skip: s.skip });
  check('that visitor keeps their finished room (objects stay on the shelf)', onShelf, s.savedShelf);
}

await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILURES:', failed.map((f) => f.name)); process.exit(1); }
