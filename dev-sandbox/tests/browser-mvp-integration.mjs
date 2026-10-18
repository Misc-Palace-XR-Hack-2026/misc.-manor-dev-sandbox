// Full-app integration: PR81 audio + PR82 Preview + PR83 disposable practice.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.MP_SCREENSHOTS || new URL('../../evidence/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: mobile ? { width:390, height:844 } : { width:1440, height:1000 }, isMobile:mobile, hasTouch:mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function() { window.roomAudio = this; return play.call(this); };
    });
    await page.route('https://player.vimeo.com/**', route => route.fulfill({contentType:'text/html', body:`<!doctype html><script>
      window.ready = false;
      window.emit = event => parent.postMessage({event}, '*');
      addEventListener('message', ({data}) => {
        if(data.method==='ping') parent.postMessage({method:'ping'}, '*');
        if(data.method==='addEventListener' && data.value==='play') window.ready=true;
      });
    </script>`}));
    await page.goto(process.env.MP_URL || 'http://127.0.0.1:5193');
    await page.getByRole('button', {name:'Go to room',exact:true}).click();
    const id = await page.evaluate(() => window.store.addItem({title:'Integration player',sourceRef:'https://vimeo.com/123456',kind:'tv'}));
    const personal = await page.evaluate(() => window.store.exportJson());
    const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='mp-sandbox:onboarding')));
    await page.evaluate(() => {
      window.personalWrites=[]; const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k!=='mp-sandbox:onboarding')window.personalWrites.push(k);return set.call(this,k,v);};
    });
    const speaker=page.locator('.soundtrack-control');
    await speaker.click();
    await page.waitForFunction(()=>window.roomAudio && !roomAudio.paused && roomAudio.currentTime>0);
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    await page.evaluate(id=>window.store.select(id),id);
    const frame=()=>page.frames().find(f=>f.url().startsWith('https://player.vimeo.com/'));
    await page.waitForFunction(()=>!!document.querySelector('.preview-iframe'));
    await page.frameLocator('.preview-iframe').locator('body').waitFor({state:'attached'});
    await frame().waitForFunction(()=>window.ready);
    await frame().evaluate(()=>window.emit('play'));
    await page.waitForFunction(()=>roomAudio.paused && document.querySelector('.soundtrack-control').dataset.soundState==='paused');
    // Mode switches rebuild edit actions, not the media: active playback must still pause music.
    await page.evaluate(()=>window.store.setMode('edit'));
    assert.equal(await page.evaluate(()=>roomAudio.paused),true);
    assert.equal(await speaker.getAttribute('data-sound-state'),'paused');
    await page.getByRole('dialog',{name:'Item',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
    await page.waitForFunction(()=>!roomAudio.paused);
    await page.evaluate(id=>window.store.select(id),id);
    await page.frameLocator('.preview-iframe').locator('body').waitFor({state:'attached'});
    await frame().waitForFunction(()=>window.ready);
    await frame().evaluate(()=>window.emit('play'));
    await page.waitForFunction(()=>roomAudio.paused);
    await speaker.click(); // Explicit mute while temporarily suspended.
    await page.getByRole('dialog',{name:'Item',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    await page.evaluate(()=>window.tutorial.replay('bookmarks'));
    assert.equal(await page.evaluate(()=>window.store.practicing),false,'Preview rejects practice entry');
    await page.getByRole('button',{name:'Edit room',exact:true}).click();
    await page.getByRole('button',{name:'Close sheet',exact:true}).click();
    await page.getByRole('button',{name:'Help',exact:true}).click();
    await page.getByRole('button',{name:'Import bookmarks',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.store.practicing),true);
    assert.equal(await speaker.getAttribute('data-sound-state'),'muted');
    await page.getByRole('button',{name:'Skip / Exit',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.store.exportJson()),personal);
    assert.deepEqual(await page.evaluate(()=>window.personalWrites),[],'practice/mode/embed never transiently writes personal state');
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='mp-sandbox:onboarding'))),saved);
    await page.evaluate(()=>window.store.setMode('preview'));
    await page.getByTitle('Switch room').click();
    await page.getByRole('dialog',{name:'Rooms',exact:true}).getByRole('button',{name:"Matt's room",exact:true}).click();
    assert.equal(await speaker.getAttribute('data-sound-state'),'muted');
    await page.getByTitle('Switch room').click();
    await page.getByRole('dialog',{name:'Rooms',exact:true}).getByRole('button',{name:'Guest room',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.store.exportJson()),personal);
    assert.equal(await speaker.getAttribute('data-sound-state'),'muted');
    assert.equal(await page.evaluate(()=>roomAudio.paused),true);
    await page.evaluate(id=>window.store.select(id),id);
    await page.screenshot({path:`${out}/${name}-integration-preview.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: real audio/embed mode rebuild/dismissal, mute through Preview/practice/skip/room return, zero personal writes before navigation`);
    await context.close();
  }
} finally { await browser.close(); }
