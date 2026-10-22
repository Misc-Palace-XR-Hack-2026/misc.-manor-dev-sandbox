import {chromium} from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const out=new URL('../../evidence/',import.meta.url).pathname; mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 for(const [name,viewport,isMobile] of [['desktop',{width:1440,height:1000},false],['mobile',{width:390,height:844},true],['small-mobile',{width:360,height:640},true],['landscape',{width:844,height:390},true]]) {
 if(process.env.MP_DEVICE && process.env.MP_DEVICE!==name) continue;
 const context=await browser.newContext({viewport,isMobile,hasTouch:isMobile}); const page=await context.newPage(); page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MP_URL??'http://127.0.0.1:5193'); await page.waitForFunction(()=>window.tutorial&&window.store);
 await page.getByRole('button',{name:'Go to room',exact:true}).click();
 await page.evaluate(()=>{window.store.addItem({title:'Personal keeper',sourceRef:'https://personal.example'});window.store.setLighting('dawn');window.store.setSurface('wall',{preset:'brick'});localStorage.setItem('mp-sandbox:rooms:matt',window.store.exportJson());localStorage.setItem('mp-sandbox:rooms:matt:backup',window.store.exportJson());localStorage.setItem('mp-sandbox:rooms:unreadable','BROKEN');localStorage.setItem('mp-sandbox:active-room','guest');});
 const saved=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='mp-sandbox:onboarding')));
 const personal=await page.evaluate(()=>window.store.exportJson());
 const trackWrites=()=>{window.personalWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k!=='mp-sandbox:onboarding')window.personalWrites.push(k);return set.call(this,k,v);};};
 await page.evaluate(trackWrites);await page.addInitScript(trackWrites);
 const step=async id=>(console.log(name,id),page.waitForFunction(id=>window.tutorial.state.lesson && document.querySelector('.tutorial-card h2')?.textContent===id,id));
 const show=async()=>page.getByRole('button',{name:'Show control',exact:true}).click();
 const preserved=async()=>{assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='mp-sandbox:onboarding'))),saved);assert.deepEqual(await page.evaluate(()=>window.personalWrites),[],'no transient personal writes');};
 await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:'Import bookmarks',exact:true}).click();
 await page.evaluate(()=>{for(const event of ['created','placed','restored','styled'])window.tutorial.notice(event);});assert.equal(await page.evaluate(()=>window.tutorial.state.step),0);
 await page.getByRole('button',{name:'Export or sample ready',exact:true}).click();await step('Try an empty or malformed file');
 const fixtures=await page.locator('.tutorial-card a').evaluateAll(a=>Object.fromEntries(a.map(n=>[n.download,decodeURIComponent(n.href.split(',')[1])])));
 const upload=async file=>{await show();await page.locator('input[type=file][accept=".html,text/html"]').setInputFiles({name:file,mimeType:'text/html',buffer:Buffer.from(fixtures[file])});};
 await upload('tutorial-empty-malformed.html'); await step('Import the overflow sample');
 await upload('tutorial-bookmarks.html'); await step('Import the same sample again');
 const counts=await page.evaluate(()=>({n:window.store.state.contentItems.length,p:window.store.state.placements.length,tags:window.store.state.contentItems[0].tags}));
 assert.ok(counts.n>counts.p && counts.p>0);assert.deepEqual(counts.tags,['Practice links']);
 await show(); await page.waitForTimeout(150);
 const target=await page.locator('[data-tutorial="bookmark-file"]').boundingBox();const ring=await page.locator('.tutorial-highlight').boundingBox(); const card=await page.locator('.tutorial-card').boundingBox();
 assert.ok(target&&ring&&Math.abs(ring.x-(target.x-6))<2&&Math.abs(ring.y-(target.y-6))<2,'highlight follows actual importer');
 assert.ok(card.y+card.height<=target.y || card.y>=target.y+target.height || card.x+card.width<=target.x || card.x>=target.x+target.width,'card does not cover target');
 await page.locator('.tutorial-card').evaluate(el=>el.scrollTop=0);
 // Exit must be immediately tappable, not merely scrollable into view by Playwright.
 const exit=page.getByRole('button',{name:'Skip / Exit',exact:true});
 assert.ok(await exit.evaluate(el=>{const b=el.getBoundingClientRect();const c=el.closest('.tutorial-card').getBoundingClientRect();if(b.top<c.top || b.bottom>c.bottom)return false;const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.height>=44 && b.top>=0 && b.bottom<=innerHeight && (hit===el || el.contains(hit));}),'Skip / Exit is fully visible and reachable with Import open');
 await page.screenshot({path:`${out}/${name}-bookmarks.png`});
 await upload('tutorial-bookmarks.html');await step('Find overflow in Inbox');await show();await step('Free a pad');
 await page.locator('.row:not(.inbox) [data-action=stash]').first().click();await step('Recover an overflow item');
 await show();await page.locator('.row.inbox [data-action=bring-out]').last().click();await step('Undo practice import');
 await show();for(let i=0;i<3;i++)await page.locator('[data-tutorial=undo]').click();
 await page.waitForFunction(()=>!window.tutorial.state.lesson);await preserved();assert.equal(await page.evaluate(()=>window.store.exportJson()),personal);
 await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:'Import bookmarks',exact:true}).click();await page.getByRole('button',{name:'Skip / Exit',exact:true}).click();await preserved();
 await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:'Import bookmarks',exact:true}).click();await page.reload();await page.waitForFunction(()=>window.store);await preserved();assert.equal(await page.evaluate(()=>window.store.exportJson()),personal);
 // Missing lesson acceptance, through real UI controls on both viewports.
 const lesson=async label=>{await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();};
 await lesson('Create content');await show();await step('Try invalid input');
 await page.locator('[data-tutorial=add-submit]').click();await step('Cancel this draft');
 assert.equal(await page.evaluate(()=>window.store.state.contentItems.length),0);
 await page.locator('[data-tutorial=create-cancel]').click();await step('Reopen Add object');await show();await step('Give it a title');
 await page.locator('#new-object-title').fill('');await step('Give it a title');
 await page.locator('#new-object-title').fill('Practice link');await step('Add a link or note');
 await page.locator('#new-object-ref').fill('javascript:alert(1)');await step('Add a link or note');
 await page.locator('#new-object-ref').fill('https://example.com');await step('Choose its representation');
 await page.locator('#new-object-kind').selectOption('book');await step('Create it');
 await page.locator('[data-tutorial=add-submit]').click();await step('Find it in the room');
 await page.locator('[data-tutorial=cancel-move]').click();await step('Find it in the room');
 await show();await page.locator('.row').filter({has:page.getByText('Practice link',{exact:true})}).first().locator('[data-action=pick-up]').click();
 await page.waitForFunction(()=>{const p=document.querySelector('[data-tutorial=place-pad]');const b=p.getBoundingClientRect();return !p.hidden && document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.tagName==='CANVAS';}).catch(async e=>{console.log(await page.evaluate(()=>({pad:document.querySelector('[data-tutorial=place-pad]').outerHTML,ring:document.querySelector('.tutorial-highlight').outerHTML,card:document.querySelector('.tutorial-card').getBoundingClientRect().toJSON(),holding:window.store.holding})));await page.screenshot({path:`${out}/${name}-failure.png`});throw e;});
 await page.screenshot({path:`${out}/${name}-create-pad.png`});
 let pad=await page.locator('[data-tutorial=place-pad]').boundingBox();await page.mouse.click(pad.x+pad.width/2,pad.y+pad.height/2);
 await page.waitForFunction(()=>!window.tutorial.state.lesson);await preserved();
 await lesson('Move, pack and unpack');await show();
 await page.locator('.row').filter({has:page.getByText('Occupied pad',{exact:true})}).first().locator('.title').click();assert.equal(await page.evaluate(()=>window.tutorial.state.step),0);await show();
 await page.locator('.row').filter({has:page.getByText('Practice object',{exact:true})}).first().click();await step('Pick it up');
 await page.locator('.item-sheet [data-action=pick-up]').click();await step('Cancel the move');
 await page.locator('[data-tutorial=cancel-move]').click();await step('Pick up again');
 await show();await page.locator('.row').filter({has:page.getByText('Practice object',{exact:true})}).first().click();
 await page.locator('.item-sheet [data-action=pick-up]').click();await step('Place it');
 await page.waitForFunction(()=>{const p=document.querySelector('[data-tutorial=place-pad]');const b=p.getBoundingClientRect();return !p.hidden && document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.tagName==='CANVAS';}).catch(async e=>{console.log(await page.evaluate(()=>({pad:document.querySelector('[data-tutorial=place-pad]').outerHTML,ring:document.querySelector('.tutorial-highlight').outerHTML,card:document.querySelector('.tutorial-card').getBoundingClientRect().toJSON(),holding:window.store.holding})));await page.screenshot({path:`${out}/${name}-failure.png`});throw e;});
 pad=await page.locator('[data-tutorial=place-pad]').boundingBox();await page.mouse.click(pad.x+pad.width/2,pad.y+pad.height/2); await step('Put it away');
 await show();await page.locator('.row').filter({has:page.getByText('Practice object',{exact:true})}).first().locator('[data-action=stash]').click();await step('Bring it back');await show();
 await page.locator('.row.inbox [data-action=bring-out]').click();await page.waitForFunction(()=>!window.tutorial.state.lesson);await preserved();
 await lesson('Visit local rooms');await show();await step('Visit another room');
 const original=await page.evaluate(()=>window.tutorial.state.roomId);
 await page.locator(`[data-room-id]:not([data-room-id="${original}"])`).first().click();await step('Return home');await show();
 await page.locator(`[data-room-id="${original}"]`).click();await page.waitForFunction(()=>!window.tutorial.state.lesson);await preserved();
 await lesson('Themes, lighting and surfaces');await show();await step('Apply a theme');
 const chooseDifferent=async selector=>{const value=await page.locator(selector).evaluate(s=>[...s.options].find(o=>o.value&&o.value!==s.value&&!o.disabled).value);await page.locator(selector).selectOption(value);};
 await chooseDifferent('#room-theme');await step('Try a look');await chooseDifferent('#lighting-preset');
 for(const target of ['wall','floor','background']){await step(`Change the ${target}`);await show();await chooseDifferent(`#surface-${target}`);}
 await step('Revert the practice look');await show();await page.screenshot({path:`${out}/${name}-style.png`});
 for(let i=0;i<5;i++)await page.locator('[data-tutorial=undo]').click();

 await page.waitForFunction(()=>!window.tutorial.state.lesson);await preserved();
 // A delayed picker read cannot escape practice, even through replay.
 await lesson('Import bookmarks');await page.getByRole('button',{name:'Export or sample ready',exact:true}).click();await show();
 await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){File.prototype.text=original;return new Promise(resolve=>window.finishImport=()=>resolve('<a href="https://late.example">Late</a>'));};});
 await page.locator('input[type=file][accept=".html,text/html"]').setInputFiles({name:'late.html',mimeType:'text/html',buffer:Buffer.from('late')});await page.waitForFunction(()=>window.finishImport);
 await page.getByRole('button',{name:'Skip / Exit',exact:true}).click();await lesson('Import bookmarks');await page.evaluate(()=>window.finishImport());await page.waitForTimeout(100);await preserved();
 assert.equal(await page.evaluate(()=>window.store.state.contentItems.length),0);await page.getByRole('button',{name:'Skip / Exit',exact:true}).click();
 // Closing a picker panel also cancels its pending file read within the same practice session.
 await lesson('Import bookmarks');await page.getByRole('button',{name:'Export or sample ready',exact:true}).click();await show();
 await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){File.prototype.text=original;return new Promise(resolve=>window.finishImport=()=>resolve('<a href="https://cancelled.example">Cancelled</a>'));};});
 await page.locator('input[type=file][accept=".html,text/html"]').setInputFiles({name:'cancelled.html',mimeType:'text/html',buffer:Buffer.from('cancelled')});await page.waitForFunction(()=>window.finishImport);
 await page.getByRole('dialog',{name:'Import',exact:true}).getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(()=>window.finishImport());await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.store.state.contentItems.length),0);
 await page.getByRole('button',{name:'Skip / Exit',exact:true}).click();await preserved();
 assert.equal(await page.evaluate(()=>window.store.exportJson()),personal);
 console.log(`PASS ${name} create validation/cancel/kind/scene placement; move/cancel/stash/restore; room return; theme/lighting/all surfaces/revert; stale async import`);
 assert.deepEqual(await page.evaluate(()=>window.personalWrites),[],'practice never writes personal storage, even transiently');
 assert.deepEqual(errors,[]); console.log(`PASS ${name} bookmarks: actual picker, malformed, overflow/tags/counts/dedupe, stash/restore/undo, highlights, skip/replay/reload, all saves preserved`);
 await context.close();
 }
} finally {await browser.close();}
