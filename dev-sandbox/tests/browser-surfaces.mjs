import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.store);
 await page.waitForTimeout(2000); // Chromium may restore its initial WebGL context asynchronously.
 await page.getByText('Floor, walls & background',{exact:true}).click();
 const original=await page.evaluate(()=>window.store.state);
 const canvas=page.locator('#room canvas');
 for(const [target,presets] of Object.entries({floor:['wood','stone','tile'],wall:['plaster','brick','wood'],background:['neutral','sky','gradient']})) {
  const selector=page.getByLabel(`${target} preset`,{exact:true});
  assert.equal(await selector.count(),1,`${target} control exists`);
  for(const preset of presets){
   const before=await page.evaluate(()=>window.store.state);
   const pixels=await canvas.screenshot();
   await selector.selectOption(preset);await page.waitForTimeout(180);
   const after=await page.evaluate(()=>window.store.state);
   assert.equal(after.surfaces[target].preset,preset);
   for(const other of ['floor','wall','background'].filter(t=>t!==target)) assert.deepEqual(after.surfaces[other],before.surfaces?.[other]);
   assert.notDeepEqual(await canvas.screenshot(),pixels,`${target} ${preset} visibly changes canvas`);
  }
  await selector.selectOption('');
 }
 // Browser-generated PNG, deliberately non-square. No fixture dependency.
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1800;c.height=900;const x=c.getContext('2d');x.fillStyle='#2c6975';x.fillRect(0,0,1800,900);x.fillStyle='#f8d477';x.fillRect(600,0,600,900);return c.toDataURL('image/png').split(',')[1];});
 for(const target of ['floor','wall','background']) {
  await page.getByLabel(`Upload ${target} image`,{exact:true}).setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await page.waitForFunction(t=>window.store.state.surfaces?.[t]?.preset==='custom',target);
  assert.equal(await page.getByLabel(`${target} preset`,{exact:true}).inputValue(),'custom');
 }
 await page.waitForTimeout(300);
 const before=await page.evaluate(()=>window.store.state);
 assert.deepEqual(before.contentItems,original.contentItems);assert.deepEqual(before.placements,original.placements);
 await page.getByLabel('floor preset',{exact:true}).selectOption('wood');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.store.state),before);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export room',exact:true}).click();
 const exported=JSON.parse(await readFile(await (await downloadPromise).path(),'utf8'));assert.deepEqual(exported,before);
 const importRoom=async data=>page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'room.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.getByLabel('wall preset',{exact:true}).selectOption('plaster');await importRoom(exported);await page.waitForTimeout(200);
 await page.reload();await page.waitForFunction(()=>window.store);assert.deepEqual(await page.evaluate(()=>window.store.state),before);
 await page.getByText('Floor, walls & background',{exact:true}).click();
 for(const target of ['floor','wall','background']) {
  for(const [name,mimeType,buffer] of [['bad.svg','image/svg+xml',Buffer.from('<svg/>')],['bad.png','image/png',Buffer.from('not a PNG')]]) {
   await page.getByLabel(`Upload ${target} image`,{exact:true}).setInputFiles({name,mimeType,buffer});
   await page.locator(`#upload-${target} + .surface-error`).filter({hasText:'Image not changed'}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.store.state),before);
  }
 }
 await importRoom({...before,surfaces:{floor:{preset:'custom',imageData:'https://evil.invalid/a.png'}}});await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>window.store.state),before);
 await page.screenshot({path:'/home/dvgpro/.hermes/cache/scratch/surface-custom-review.png'});
 await page.getByLabel('floor preset',{exact:true}).selectOption('wood');await page.getByLabel('wall preset',{exact:true}).selectOption('brick');await page.getByLabel('background preset',{exact:true}).selectOption('sky');
 await page.locator('#menu').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(300);
 await page.screenshot({path:'/home/dvgpro/.hermes/cache/scratch/surface-presets-review.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: nine independent visible presets, three uploads, original reset, undo, export/import/reload, invalid uploads/import rejection, content preserved; no page errors');
} finally {await browser.close();}
