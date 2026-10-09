// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/content-capture.browser.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const out='/home/dvgpro/.hermes/cache/scratch/palace-content-capture';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Native OS UI cannot run headlessly; exercise the browser share contract with a controlled adapter.
 if(mobile) await page.addInitScript(()=>{
  Object.defineProperty(navigator,'canShare',{value:({files})=>files?.[0]?.type==='image/png'});
  Object.defineProperty(navigator,'share',{value:async ({files})=>{window.sharedPhoto={size:files[0].size,type:files[0].type,active:navigator.userActivation.isActive};throw new DOMException('Cancelled','AbortError');}});
 });
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.store);await page.waitForTimeout(1000);
 await page.getByRole('button',{name:'Take photo',exact:true}).click({timeout:3000});
 const photo=page.getByRole('dialog',{name:'Room photo',exact:true});await photo.waitFor();
 const download=page.waitForEvent('download');await photo.getByRole('button',{name:'Download PNG'}).click();
 const file=await download;await file.saveAs(`${out}/${mobile?'phone':'desktop'}-room.png`);
 const pixels=await photo.locator('img').evaluate(async img=>{await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;const colors=new Set();for(let i=0;i<d.length;i+=400) colors.add(`${d[i]},${d[i+1]},${d[i+2]}`);return {colors:colors.size,width:c.width,height:c.height};});assert.ok(pixels.colors>30,JSON.stringify(pixels));
 const downloads=[];page.on('download',d=>downloads.push(d));
 if(mobile){await photo.getByRole('button',{name:'Share photo'}).click();await page.waitForFunction(()=>document.querySelector('.photo-dialog [role=status]').textContent.includes('cancelled'));assert.equal(downloads.length,0);assert.ok(await page.evaluate(()=>window.sharedPhoto.active&&window.sharedPhoto.size>1000));}
 else assert.equal(await photo.getByRole('button',{name:'Share photo'}).count(),0);
 await photo.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(()=>{const s=window.store;const id=s.addItem({title:'Test link',sourceRef:'https://example.com',kind:'cat'});s.select(id);});
 await page.locator('.item-sheet').getByRole('button',{name:'Edit',exact:true}).click();
 const edit=page.getByRole('dialog',{name:'Edit item',exact:true});await edit.getByLabel('Title',{exact:true}).fill('Changed link');await edit.getByLabel('URL',{exact:true}).fill('example.org/new');
 await page.screenshot({path:`${out}/${mobile?'phone':'desktop'}-edit.png`});
 await edit.getByRole('button',{name:'Save changes'}).click();
 assert.equal(await page.evaluate(()=>window.store.state.contentItems.at(-1).sourceRef),'https://example.org/new');
 await page.locator('.item-sheet').getByRole('button',{name:'Edit',exact:true}).click();await edit.getByLabel('Title',{exact:true}).fill('Discard');await edit.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.store.state.contentItems.at(-1).title),'Changed link');
 await page.evaluate(()=>window.store.undo());assert.equal(await page.evaluate(()=>window.store.state.contentItems.at(-1).title),'Test link');
 await page.reload();await page.waitForFunction(()=>window.store);assert.equal(await page.evaluate(()=>window.store.state.contentItems.at(-1).title),'Test link');
 for(const [type,initial,label,replacement] of [['note','','Note text','Line one\nLine two'],['file','./old.pdf','File reference','./new.pdf']]){
  await page.evaluate(({type,initial})=>{const s=window.store;const id=s.addItem({title:'Editable '+type,type,sourceRef:initial});s.select(id);},{type,initial});
  await page.locator('.item-sheet').getByRole('button',{name:'Edit',exact:true}).click();await edit.getByLabel(label,{exact:true}).fill(replacement);await edit.getByRole('button',{name:'Save changes'}).click();
  await page.reload();await page.waitForFunction(()=>window.store);assert.equal(await page.evaluate(()=>window.store.state.contentItems.at(-1).sourceRef),replacement);
 }
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';
 await page.evaluate(png=>{const s=window.store;s.select(s.addPhoto('Replace me',png));},png);
 const oldPhoto=await page.evaluate(()=>window.store.exportJson());
 await page.locator('.item-sheet').getByRole('button',{name:'Edit',exact:true}).click();
 await edit.getByLabel('Replace local photo').setInputFiles(`${out}/${mobile?'phone':'desktop'}-room.png`);
 await edit.getByRole('button',{name:'Save changes'}).click();
 assert.ok(await page.evaluate(png=>window.store.state.contentItems.at(-1).imageData!==png,png));
 await page.evaluate(()=>window.store.undo());assert.equal(await page.evaluate(()=>window.store.exportJson()),oldPhoto);
 await page.locator('.item-sheet').getByRole('button',{name:'Close',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const captureBounds=await page.getByRole('button',{name:'Take photo',exact:true}).boundingBox();assert.ok(captureBounds.height>=44);
 await page.screenshot({path:`${out}/${mobile?'phone':'desktop'}-idle.png`});
 assert.deepEqual(errors,[]);
 console.log(mobile?'PHONE PASS':'DESKTOP PASS',pixels);await context.close();
 }
} finally {await browser.close();}
