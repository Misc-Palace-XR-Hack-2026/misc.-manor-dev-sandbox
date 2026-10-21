// Opt-in live service smoke, separate from deterministic fixtures. Network/account/device restrictions may fail it.
// APP_URL=http://127.0.0.1:5178 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/youtube-live.browser.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--autoplay-policy=user-gesture-required'] });
const base = process.env.APP_URL || 'http://127.0.0.1:5178';
try {
 const page = await browser.newPage();
 // Only the local harness is intercepted. All YouTube documents, scripts and video are live.
 await page.route(`${base}/live-audio-harness`, route => route.fulfill({contentType:'text/html',body:'<!doctype html><div id="card"></div>'}));
 await page.goto(`${base}/live-audio-harness`);
 await page.evaluate(async () => {
  const [{Store,newRoom},{SoundtrackPlayer},{createEmbedFrame},{createSoundtrackControl}] = await Promise.all([
   import('/src/core/store.ts'),import('/src/views/soundtrack.ts'),import('/src/views/preview-card.ts'),import('/src/views/soundtrack-control.ts'),
  ]);
  window.store = new Store(newRoom());
  window.audio = new Audio();
  window.player = new SoundtrackPlayer(store,{audio,fade:async(_a,b,_ms,set)=>set(b)});
  window.saved = store.exportJson();
  window.events = [];
  addEventListener('message', e => {
   if(e.origin !== 'https://www.youtube-nocookie.com') return;
   try {const p=JSON.parse(e.data); if(['initialDelivery','onReady','onStateChange'].includes(p.event)) events.push({event:p.event,state:p.event==='onStateChange'?p.info:undefined});} catch {}
  });
  document.body.append(createSoundtrackControl(player));
  document.body.append(createEmbedFrame({kind:'embed',provider:'youtube',src:'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',title:'Live YouTube',height:390}));
 });
 await page.getByRole('button',{name:'Unmute room music',exact:true}).click();
 await page.waitForFunction(()=>!audio.paused && audio.currentTime>0);
 await page.waitForFunction(()=>events.some(e=>e.event==='initialDelivery'),null,{timeout:30000});
 assert.equal(await page.evaluate(()=>audio.paused),false,'live readiness is not playback');
 const frame=page.frames().find(f=>f.url().startsWith('https://www.youtube-nocookie.com/embed/'));
 await frame.getByRole('button',{name:/play/i}).first().click();
 await page.waitForFunction(()=>events.some(e=>e.state===1),null,{timeout:30000});
 await frame.waitForFunction(()=>document.querySelector('video')?.currentTime>0);
 // Clicking an iframe can blur the parent. Clear that reason to prove the playback reason independently.
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.evaluate(()=>player.idle());
 assert.equal(await page.evaluate(()=>audio.paused),true,'live YouTube playing must keep room paused after focus');
 const videoTime=await frame.locator('video').evaluate(v=>v.currentTime);
 await frame.getByRole('button',{name:/^Pause/}).click();
 await page.waitForFunction(()=>events.some(e=>e.state===2));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>!audio.paused);
 assert.equal(await page.evaluate(()=>store.exportJson()===saved),true);
 console.log('PASS: live YouTube handshake, advancing video, playing pauses room after focus, pause resumes room; unchanged saves',JSON.stringify({videoTime,events:await page.evaluate(()=>events)}));
} finally {await browser.close();}
