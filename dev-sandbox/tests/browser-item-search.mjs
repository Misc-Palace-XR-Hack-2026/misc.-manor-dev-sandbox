import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=process.env.MP_EVIDENCE??'/home/dvgpro/.hermes/cache/scratch/item-search-evidence';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/views/room*',async route=>{const response=await route.fetch();const body=(await response.text()).replace('this.renderer.setAnimationLoop(', 'globalThis.__searchView = this; this.renderer.setAnimationLoop(');await route.fulfill({response,body});});
 await page.goto(process.env.MP_URL??'http://127.0.0.1:5521');await page.locator('.demo-skip-seq').click();await page.locator('.demo-exit').click();
 await page.waitForFunction(()=>window.__searchView);
 await page.locator('.demo-camera-select').selectOption('tactile');await page.waitForTimeout(3500);
 const fixture=await page.evaluate(()=>{const s=window.__searchView.store;const id=s.addItem({title:'Orion field journal',sourceRef:'https://developer.mozilla.org/en-US/docs/Web/JavaScript',kind:'photoFrame'});const c=s.state.representations.find(r=>r.id===id).contentItemId;s.updateContent(c,{title:'Orion field journal',sourceRef:s.content(c).sourceRef,notes:'Secret Saturn observations night watch'});const packed=s.addItem({title:'Packed memories',sourceRef:'Typed search note',kind:'rubiksCube'});s.stash(packed);s.select(null);s.flushSave();return{id,home:s.exportJson(),storage:JSON.stringify(localStorage)};});
 const search=page.getByRole('button',{name:'Search this room',exact:true});
 await search.click();const dialog=page.getByRole('dialog',{name:'Search this room'});const input=dialog.getByRole('searchbox');
 for(const query of ['Orion','Saturn','night watch','photoFrame','photo frame']){await input.fill(query);await dialog.locator('li').filter({hasText:'Orion field journal'}).waitFor();}
 await input.fill('puzzle cube');assert.match(await dialog.locator('ul').textContent(),/Packed · Puzzle cube/);assert.equal(await dialog.locator('ul button').isDisabled(),true);
 await page.screenshot({path:out+'/packed-result.png'});
 await input.fill('javascript');assert.equal(await dialog.locator('li').count(),1); // URL itself contains javascript; body-only keyword below.
 await input.fill('scripting');assert.equal(await dialog.locator('li').count(),0);
 await dialog.getByRole('button',{name:'Index link text',exact:true}).click();await dialog.locator('.search-link-summary').filter({hasText:/1 indexed/}).waitFor({timeout:20000});
 await dialog.locator('li').filter({hasText:'Orion field journal'}).waitFor();assert.match(await dialog.locator('ul').textContent(),/scripting/i);
 await page.screenshot({path:out+'/real-link-body.png'});
 await input.fill('Saturn');await dialog.locator('ul button').click();assert.equal(await page.evaluate(()=>window.__searchView.store.selectedId),fixture.id);assert.equal(await dialog.count(),0);
 await page.keyboard.down('w');await page.waitForTimeout(100);await search.click();await page.waitForTimeout(50);
 const pose=await page.evaluate(()=>window.__searchView.activeCamera.position.toArray());
 await input.pressSequentially('wasd');await page.waitForTimeout(450);
 assert.deepEqual(await page.evaluate(()=>window.__searchView.activeCamera.position.toArray()),pose,'modal stops previously held movement as well as typed movement keys');
 await input.press('Escape');await page.keyboard.up('w');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Search this room');
 assert.equal(await page.evaluate(()=>window.__searchView.store.selectedId),fixture.id,'Escape closes only the search, preserving selection');
 assert.equal(await page.evaluate(()=>window.__searchView.store.exportJson()),fixture.home);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),fixture.storage);
 // Reversible visit + real Store selection, no personal save changes.
 await page.evaluate(async()=>{const {roomCatalog,visitCatalogRoom}=await import('/src/core/room-portal.ts');const {REPO_ROOMS}=await import('/src/core/repo-rooms.ts');visitCatalogRoom(window.__searchView.store,roomCatalog(REPO_ROOMS).find(r=>r.id==='directory:matt'));});
 await search.click();await input.fill('');const visited=await page.evaluate(()=>window.__searchView.store.state.representations[0].id);await dialog.locator(`button[data-representation-id="${visited}"]`).click();assert.equal(await page.evaluate(()=>window.__searchView.store.selectedId),visited);
 await page.screenshot({path:out+'/visited-selection.png'});
 await search.click();await page.evaluate(()=>window.__searchView.store.returnHome());await page.waitForFunction(()=>!document.querySelector('.neighborhood-search[open]'));
 assert.equal(await page.evaluate(()=>window.__searchView.store.exportJson()),fixture.home);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),fixture.storage);
 // HTML extraction fixture: scripts and nested resource URLs stay inert, not a network success claim.
 const resourceRequests=[];page.on('request',request=>{if(request.url().includes('127.0.0.1:9'))resourceRequests.push(request.url());});
 const extracted=await page.evaluate(async()=>{const {LinkTextCache}=await import('/src/core/search-link-text.ts');const cache=new LinkTextCache(async()=>new Response('<nav>not article</nav><article>Readable nebula prose<img src="http://127.0.0.1:9/private"><iframe src="http://127.0.0.1:9/frame"></iframe><script>window.__remoteRan=true</script></article>',{headers:{'content-type':'text/html'}}));return await cache.load('https://raw.githubusercontent.com/test/html',new AbortController().signal);});
 assert.equal(extracted.text,'Readable nebula prose');await page.waitForTimeout(100);assert.deepEqual(resourceRequests,[]);assert.equal(await page.evaluate(()=>window.__remoteRan),undefined);
 assert.deepEqual(errors,[]);console.log('PASS personal + visited item/title/note/tag/model search; packed disabled; real CORS link body and snippet; Store selection; Escape focus; room-change cancellation; exact JSON/localStorage preservation');
}finally{await browser.close();}
