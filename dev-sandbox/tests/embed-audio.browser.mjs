// Deterministic cross-origin provider fixture; real Chromium, iframe messaging and room audio.
// APP_URL=http://127.0.0.1:5178 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/embed-audio.browser.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--autoplay-policy=user-gesture-required'] });
const base = process.env.APP_URL || 'http://127.0.0.1:5178';
const fixture = `<!doctype html><script>
window.subscriptions = [];
window.emit = event => parent.postMessage({event}, '*');
addEventListener('message', ({data}) => {
 if (data.method === 'ping') parent.postMessage({method:'ping'}, '*');
 if (data.method === 'addEventListener') subscriptions.push(data.value);
});
</script><button onclick="emit('play')">Play fixture</button>`;
try {
 const context = await browser.newContext();
 const page = await context.newPage();
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.route('https://player.vimeo.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
 await page.route('https://example.org/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
 await page.route(`${base}/audio-harness`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="card"></div><a target="_blank" href="https://example.org/">Outbound</a>' }));
 await page.goto(`${base}/audio-harness`);
 await page.evaluate(async () => {
  const [{ Store, newRoom }, { SoundtrackPlayer }, { PreviewCardView, createEmbedFrame }, { createSoundtrackControl }] = await Promise.all([
   import('/src/core/store.ts'), import('/src/views/soundtrack.ts'), import('/src/views/preview-card.ts'), import('/src/views/soundtrack-control.ts'),
  ]);
  window.store = new Store(newRoom());
  window.audio = new Audio();
  window.player = new SoundtrackPlayer(store, { audio, fade: async (_a,b,_ms,set) => set(b) });
  window.card = new PreviewCardView(document.querySelector('#card'));
  window.createEmbedFrame = createEmbedFrame;
  window.preview = { kind:'embed', provider:'vimeo', src:'https://player.vimeo.com/video/123456', title:'Fixture', height:169 };
  document.body.append(createSoundtrackControl(player));
  window.saved = store.exportJson();
  window.initialLighting = store.state.lighting;
 });
 const playing = () => page.waitForFunction(() => !audio.paused && audio.currentTime > 0);
 const paused = () => page.waitForFunction(() => audio.paused);
 await page.getByRole('button', {name:'Unmute room music', exact:true}).click();
 await playing();
 await page.evaluate(() => card.show(preview));
 const frame = page.frames().find(f => f.url().startsWith('https://player.vimeo.com')) || await new Promise(resolve => page.once('framenavigated', resolve));
 await frame.waitForFunction(() => subscriptions.includes('play') && subscriptions.includes('pause') && subscriptions.includes('ended'), null, { timeout: 3000 });
 assert.equal(await page.evaluate(() => audio.paused), false, 'presence/load is not playback');
 await frame.evaluate(() => emit('play'));
 await paused();
 await page.evaluate(() => { window.dispatchEvent(new Event('focus')); store.setLighting('dawn'); });
 await page.evaluate(() => player.idle());
 assert.equal(await page.evaluate(() => audio.paused), true, 'focus/sync must not override embed');
 await page.getByRole('button', {name:'Mute room music (temporarily paused)', exact:true}).click();
 await frame.evaluate(() => emit('pause'));
 await page.evaluate(() => player.idle());
 assert.equal(await page.evaluate(() => audio.paused), true, 'manual mute persists');
 await page.getByRole('button', {name:'Unmute room music', exact:true}).click();
 await playing();
 // Wrong source, wrong origin, opaque origin, malformed and generic messages cannot interrupt room audio.
 await page.evaluate(() => {
  const source = document.querySelector('iframe').contentWindow;
  for (const origin of ['https://evil.example', 'null']) window.dispatchEvent(new MessageEvent('message', {origin, source, data:{event:'play'}}));
  window.dispatchEvent(new MessageEvent('message', {origin:'https://player.vimeo.com', source:window, data:{event:'play'}}));
  window.postMessage({playing:true}, '*');
  window.dispatchEvent(new MessageEvent('message', {origin:'https://player.vimeo.com', source, data:'broken infoDelivery "playerState":1'}));
 });
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(() => audio.paused), false, 'untrusted messages ignored');
 await frame.evaluate(() => emit('play'));
 await paused();
 await page.evaluate(() => window.dispatchEvent(new Event('blur')));
 await frame.evaluate(() => emit('ended'));
 await page.evaluate(() => player.idle());
 assert.equal(await page.evaluate(() => audio.paused), true, 'end cannot clear blur');
 await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
 assert.equal(await page.evaluate(() => audio.paused), true, 'visible does not clear blur');
 await page.evaluate(() => window.dispatchEvent(new Event('focus')));
 await playing();
 await frame.evaluate(() => emit('play'));
 await paused();
 await page.evaluate(() => { window.oldSource = document.querySelector('iframe').contentWindow; card.show(null); });
 await playing();
 // Replacement must unregister the old source, and load cannot set playing.
 await page.evaluate(() => card.show({...preview, title:'Replacement'}));
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(() => audio.paused), false);
 await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {origin:'https://player.vimeo.com', source:oldSource, data:{event:'play'}})));
 assert.equal(await page.evaluate(() => audio.paused), false, 'dismissed source is stale');
 const replacement = page.frames().find(f => f.url().startsWith('https://player.vimeo.com'));
 await replacement.waitForFunction(() => subscriptions.includes('ended'));
 await replacement.evaluate(() => emit('play'));
 await paused();
 await replacement.goto('https://player.vimeo.com/video/123456');
 await replacement.waitForFunction(() => subscriptions.includes('ended'));
 await playing();
 // Multiple registered players aggregate; ending one must not clear the other.
 const navigated = page.waitForEvent('framenavigated', { predicate:f => f.url().includes('654321') });
 await page.evaluate(() => { window.extra = createEmbedFrame({...preview, src:'https://player.vimeo.com/video/654321'}); document.body.append(extra); });
 const other = await navigated;
 await other.waitForFunction(() => subscriptions.includes('ended'));
 await replacement.evaluate(() => emit('play'));
 await other.evaluate(() => emit('play'));
 await replacement.evaluate(() => emit('ended'));
 await paused();
 assert.equal(await page.evaluate(() => audio.paused), true, 'other player still active');
 await page.evaluate(() => extra.remove());
 await playing();
 // A navigated frame loses registration, even if it forges Vimeo-shaped payloads.
 await replacement.evaluate(() => emit('play'));
 await paused();
 await page.evaluate(() => document.querySelector('iframe').src = 'https://example.org/unregistered');
 await playing();
 await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:true}); document.dispatchEvent(new Event('visibilitychange')); });
 await paused();
 await page.evaluate(() => window.dispatchEvent(new Event('focus')));
 assert.equal(await page.evaluate(() => audio.paused), true, 'focus cannot clear hidden');
 await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:false}); document.dispatchEvent(new Event('visibilitychange')); });
 await playing();
 await page.getByRole('link', {name:'Outbound'}).click();
 await paused();
 await page.bringToFront();
 await page.evaluate(() => window.dispatchEvent(new Event('focus')));
 await playing();
 await page.evaluate(() => { store.setLighting(initialLighting); card.show(null); });
 await page.evaluate(() => player.idle());
 assert.equal(await page.evaluate(() => store.exportJson() === saved), true, 'audio never edits saved choices');
 assert.deepEqual(errors, []);
 console.log('PASS: real audio + Vimeo iframe subscriptions, play/pause/end/dismiss, source/origin rejection, independent blur/hidden/outbound/mute, saved choices');
 await context.close();
} finally { await browser.close(); }
