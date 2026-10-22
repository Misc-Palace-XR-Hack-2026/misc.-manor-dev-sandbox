import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out = process.env.MP_ARTIFACTS ?? '/home/dvgpro/.hermes/cache/scratch/matt-refresh-artifacts';
mkdirSync(out, { recursive: true });
const expected = JSON.parse(readFileSync('rooms/matt.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
const results = [];
try {
  for (const [name, viewport] of [['desktop', {width:1440,height:1000}], ['mobile', {width:390,height:844}]]) {
    const context = await browser.newContext({ viewport, isMobile:name==='mobile', hasTouch:name==='mobile' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5298/dev/');
    await page.waitForFunction(() => window.store);
    const skip = page.getByRole('button', {name:'Go to room', exact:true});
    if (await skip.isVisible()) await skip.click();
    await page.getByTitle('Switch room').click();
    await page.getByRole('button', {name:/Matt's room/i}).click();
    await page.waitForFunction(() => window.store.state.id === 'matt');
    assert.deepEqual(await page.evaluate(() => window.store.state), {...expected, owner:"Matt's room"});
    await page.waitForTimeout(1500);
    await page.screenshot({path:`${out}/${name}-room.png`});
    for (const id of ['lamp','youtube-3','apollo','solar-book','os','cyber-funk']) {
      await page.evaluate(id => window.store.select(`matt-object-${id}`), id);
      const item = page.getByRole('dialog', {name:/item/i});
      await item.waitFor({state:'visible'});
      const rep = expected.representations.find(r=>r.id===`matt-object-${id}`);
      const content = expected.contentItems.find(c=>c.id===rep.contentItemId);
      await item.getByRole('button', {name:'Edit', exact:true}).click();
      assert.equal(await page.getByLabel('Notes', {exact:true}).inputValue(), content.notes);
      assert.equal(await page.getByLabel('URL', {exact:true}).inputValue(), content.sourceRef);
      await page.screenshot({path:`${out}/${name}-${id}-note.png`});
      await page.getByRole('button', {name:'Cancel', exact:true}).click();
      if (id === 'lamp') {
        assert.equal(await page.locator('.preview-iframe').getAttribute('src'), 'https://www.youtube-nocookie.com/embed/Ld35lMnFQ10');
      }
      await page.screenshot({path:`${out}/${name}-${id}.png`});
      results.push({ viewport:name, id, kind:rep.objectKind, sourceRef:content.sourceRef, notes:content.notes });
    }
    assert.deepEqual(errors.filter(e => !e.includes("The document is sandboxed and lacks the 'allow-same-origin' flag")), []);
    if (errors.length) console.log(`${name}: third-party sandbox errors:`, errors);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    await context.close();
  }
  writeFileSync(`${out}/checks.json`, JSON.stringify(results,null,2));
  console.log(`PASS: ${results.length} real-room inspector mappings; desktop/mobile screenshots at ${out}; no first-party page errors (third-party sandbox exceptions logged separately).`);
} finally { await browser.close(); }
