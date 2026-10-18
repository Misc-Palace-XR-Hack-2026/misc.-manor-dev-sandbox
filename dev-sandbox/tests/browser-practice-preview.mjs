import {chromium} from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const context=await browser.newContext({viewport,isMobile:viewport.width<500});const page=await context.newPage();
  await page.goto(process.env.MP_URL??'http://127.0.0.1:5294');await page.waitForFunction(()=>window.tutorial);
  await page.getByRole('button',{name:'Go to room',exact:true}).click();
  const personal=await page.evaluate(()=>{
   window.store.addItem({title:'Keeper',sourceRef:'https://personal.example'});
   window.writes=[];const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){window.writes.push(k);return set.call(this,k,v);};
   return window.store.exportJson();
  });
  await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:'Import bookmarks',exact:true}).click();
  await page.getByRole('button',{name:'Export or sample ready',exact:true}).click();await page.getByRole('button',{name:'Show control',exact:true}).click();
  await page.evaluate(()=>{const text=File.prototype.text;File.prototype.text=function(){File.prototype.text=text;return new Promise(resolve=>window.finishImport=()=>resolve('<a href="https://late.example">Late</a>'));};});
  await page.locator('input[type=file][accept=".html,text/html"]').setInputFiles({name:'late.html',mimeType:'text/html',buffer:Buffer.from('late')});
  await page.waitForFunction(()=>window.finishImport);const lesson=await page.evaluate(()=>JSON.stringify(window.tutorial.state));
  await page.evaluate(()=>window.store.setMode('preview'));
  await page.waitForFunction(()=>document.querySelector('.tutorial-overlay').hidden);
  await page.evaluate(()=>{window.tutorial.replay('move');window.tutorial.notice('import-empty');document.dispatchEvent(new CustomEvent('palace-tutorial',{detail:'start'}));});
  assert.equal(await page.evaluate(()=>JSON.stringify(window.tutorial.state)),lesson);
  assert.equal(await page.evaluate(()=>window.store.practicing),true);
  await page.evaluate(()=>window.store.setMode('edit'));await page.waitForFunction(()=>!document.querySelector('.tutorial-overlay').hidden);
  await page.evaluate(()=>window.finishImport());await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.store.state.contentItems.length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.tutorial.state)),lesson);
  await page.getByRole('button',{name:'Skip / Exit',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.store.exportJson()),personal);
  assert.deepEqual(await page.evaluate(()=>window.writes.filter(k=>k!=='mp-sandbox:onboarding')),[]);
  console.log(`PASS ${viewport.width}: active practice pause/resume, read-only replay/event rejection, stale import round-trip, zero personal writes`);
  await context.close();
 }
} finally {await browser.close();}
