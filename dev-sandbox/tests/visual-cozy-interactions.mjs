// Isolated actual UI assignment, reload, pickup and modal-only regression checks.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import('/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs');
const out='/home/dvgpro/.hermes/artifacts/cozy-interactions';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
const checks=[],errors=[];
try {
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://localhost:5173');await page.waitForFunction(()=>!!window.store);
  const id=await page.evaluate(()=>window.store.addItem({title:'Cozy UI fixture',sourceRef:'Content must remain intact',type:'note',kind:'book'}));
  for(const kind of ['clock','guitar','synthesizer','drum','lamp','coffeeMaker']) {
   await page.evaluate(id=>window.store.select(id),id);
   await page.locator('.kind-current:visible').first().click();
   await page.locator(`.kind-choice[data-kind="${kind}"]:visible`).click();
   assert.equal(await page.evaluate(id=>window.store.state.representations.find(r=>r.id===id).objectKind,id),kind);
   await page.reload();await page.waitForFunction(()=>!!window.store);
   assert.equal(await page.evaluate(id=>window.store.state.representations.find(r=>r.id===id).objectKind,id),kind);
   await page.evaluate(id=>window.store.select(id),id);
   assert.equal(await page.getByRole('dialog',{name:'Item',exact:true}).isVisible(),true);
   await page.getByRole('button',{name:'Pick up',exact:true}).click();
   assert.equal(await page.evaluate(id=>window.store.slotOf(id)??null,id),null);
   await page.evaluate(id=>window.store.place(id,'floor-3'),id);
   assert.equal(await page.evaluate(id=>window.store.slotOf(id),id),'floor-3');
   const content=await page.evaluate(id=>{const s=window.store;return s.content(s.state.representations.find(r=>r.id===id).contentItemId)},id);
   assert.equal(content.sourceRef,'Content must remain intact');
   checks.push({device,kind,uiAssigned:true,reloaded:true,modal:true,pickedUp:true,replaced:true,contentPreserved:true});
  }
  await page.evaluate(id=>window.store.select(id),id);
  await page.screenshot({path:`${out}/${device}-modal.png`});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({checks,errors,out},null,2));
}finally{await browser.close();}
