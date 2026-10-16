import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage(); await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5174');
 await page.waitForFunction(()=>window.store);
 await page.evaluate(async()=>{
  const {PreviewCardView}=await import('/src/views/preview-card.ts');
  const host=document.createElement('div');host.id='test-preview'; document.body.append(host);
  window.testCard=new PreviewCardView(host);
  window.testCard.show({kind:'embed',provider:'page',src:'https://dvgpro.com/',title:'DVG',height:220});
 });
 assert.equal(await page.locator('#test-preview iframe').getAttribute('sandbox'),'allow-scripts');
 assert.match(await page.locator('#test-preview').innerText(),/may block/);
 const link=page.locator('#test-preview a');assert.equal(await link.getAttribute('href'),'https://dvgpro.com/');assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);
 await page.evaluate(()=>window.testCard.show({kind:'embed',provider:'page',src:location.origin+'/same-origin',title:'Same origin',height:220}));
 assert.equal(await page.locator('#test-preview iframe').count(),0,'never embed the app origin');
 assert.equal(await page.locator('#test-preview a').count(),1);
 await page.evaluate(()=>window.testCard.show({kind:'embed',provider:'youtube',src:'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',title:'Video',height:169}));
 assert.match(await page.locator('#test-preview iframe').getAttribute('sandbox'),/allow-same-origin/);
 const failures = [];
 page.on('requestfailed', r => failures.push([r.url(), r.failure()?.errorText]));
 const origin = new URL(page.url()).origin;
 // Real browser enforcement with deterministic network responses, not DOM stubs.
 for (const [name, headers] of [
  ['xfo', { 'x-frame-options': 'DENY' }],
  ['csp', { 'content-security-policy': "frame-ancestors 'none'" }],
 ]) {
  const url=`https://dvgpro.com/__preview-test-${name}`;
  await page.route(url, route=>route.fulfill({status:200,headers,contentType:'text/html',body:'<h1>Must not render</h1>'}));
  await page.evaluate(src=>window.testCard.show({kind:'embed',provider:'page',src,title:'Blocked fixture',height:220}),url);
  await page.waitForTimeout(800);
  const frame=await page.locator('#test-preview iframe').contentFrame();
  assert.equal(await frame.locator('h1').filter({hasText:'Must not render'}).count(),0, name);
  assert.ok(failures.some(([failedUrl, error])=>failedUrl===url && error==='net::ERR_BLOCKED_BY_RESPONSE'), name);
  assert.ok(await page.locator('#test-preview a').isVisible());
  assert.match(await page.locator('#test-preview').innerText(),/may block/);
 }
 await page.route('https://dvgpro.com/__preview-test-failed',route=>route.abort('failed'));
 await page.evaluate(()=>window.testCard.show({kind:'embed',provider:'page',src:'https://dvgpro.com/__preview-test-failed',title:'Failed fixture',height:220}));
 await page.waitForTimeout(300);
 assert.ok(await page.locator('#test-preview a').isVisible());
 // A permitted page redirecting onto our origin cannot access parent storage/DOM.
 const redirectTarget = origin+'/tests/fixtures/page-preview.html';
 await page.route('https://dvgpro.com/__preview-test-redirect',route=>route.fulfill({status:302,headers:{location:redirectTarget}}));
 await page.evaluate(()=>window.testCard.show({kind:'embed',provider:'page',src:'https://dvgpro.com/__preview-test-redirect',title:'Redirect fixture',height:220}));
 const redirected=page.frameLocator('#test-preview iframe');
 await redirected.getByText('Redirect rendered', {exact:true}).waitFor();
 assert.equal(await redirected.locator('body').getAttribute('data-isolated'),'yes');
 assert.equal(await page.locator('body').getAttribute('data-escaped'),null);
 // Explicit Open stays a usable separate-tab handoff; no automatic navigation.
 const popupPromise=page.waitForEvent('popup');await page.locator('#test-preview a').click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();
 if (origin.startsWith('https:')) {
  const messages=[];page.on('console',m=>messages.push(m.text()));
  await page.route('https://dvgpro.com/__preview-test-insecure',route=>route.fulfill({status:302,headers:{location:'http://example.com/__preview-test-insecure'}}));
  await page.evaluate(()=>window.testCard.show({kind:'embed',provider:'page',src:'https://dvgpro.com/__preview-test-insecure',title:'Insecure redirect',height:220}));
  await page.waitForTimeout(1000);
  assert.ok(messages.some(m=>m.includes('Mixed Content')),'browser refuses insecure redirect');
  assert.ok(await page.locator('#test-preview a').isVisible());
 }
 await page.evaluate(async()=>{
  document.querySelector('#test-preview').remove();
  const seed=await (await fetch('/rooms/matt.json')).json();window.store.switchRoom('matt',seed);
 });
 for (const id of ['matt-cyber-funk','matt-neon-arcade','matt-tree-bar','matt-youtube','matt-solar-book']) {
  const expected=await page.evaluate(id=>{const s=window.store;s.select(s.repFor(id).id);return new URL(s.content(id).sourceRef).href;},id);
  const open=page.locator('.item-sheet a[target="_blank"]');
  assert.ok(await open.isVisible());assert.equal(await open.getAttribute('href'),expected);
  assert.equal(await page.locator('.preview-card iframe').count(),0);
 }
 console.log('PASS real browser sandbox, same-origin/redirect isolation, CSP/XFO refusal, network failure, provider permissions and original-link fallback;', origin.startsWith('https:') ? 'HTTPS mixed-content refusal verified' : 'mixed-content check requires HTTPS MP_URL');
}finally{await browser.close();}
