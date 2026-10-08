import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
 const context = await browser.newContext({ viewport: {width:1440,height:1000} });
 const page = await context.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.store, {timeout:5000});
 await page.getByRole('button', { name: 'Edit room', exact: true }).click();
 assert.equal(await page.locator('#appearance-theme').count(),0);
 const kinds=await page.evaluate(async()=> (await import('/src/core/types.ts')).OBJECT_KINDS);
 assert.deepEqual(await page.locator('#new-object-kind option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean)),kinds);
 await page.getByLabel('Lighting preset').selectOption('dawn');
 assert.equal(await page.evaluate(()=>window.store.state.lighting),'dawn');
 await page.reload(); await page.waitForFunction(()=>window.store);
 await page.getByRole('button', { name: 'Edit room', exact: true }).click();
 assert.equal(await page.getByLabel('Lighting preset').inputValue(),'dawn');
 // Import an empty fixture through the real file input (not Store mutation).
 const empty=await page.evaluate(()=>({...window.store.state,contentItems:[],representations:[],placements:[]}));
 const importRoom=async data => page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'room.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await importRoom(empty);
 await page.waitForFunction(()=>window.store.state.contentItems.length===0);
 const project=async(slot,y=0.03)=>page.evaluate(async({slot,y})=>{
   const THREE=await import('/node_modules/.vite/deps/three.js');
   const r=document.querySelector('#room canvas').getBoundingClientRect(),aspect=r.width/r.height;
   const camera=new THREE.OrthographicCamera(-11*aspect/2,11*aspect/2,5.5,-5.5,.1,120);
   camera.position.set(17,15.6,17);camera.lookAt(3,1.6,3);camera.updateMatrixWorld();
   const pos=window.store.layout.slots.find(s=>s.id===slot).pos;
   const p=new THREE.Vector3(pos[0],pos[1]+y,pos[2]).project(camera);
   return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
 },{slot,y});
 const clickSlot=async slot=>{const p=await project(slot);await page.mouse.click(p.x,p.y);await page.waitForTimeout(350);};
 const imported=['armchair','sideTable','turntable','rug','plant'];
 for(const kind of imported){
   await page.getByPlaceholder('Title (optional)').fill(`Test ${kind}`);
   await page.getByPlaceholder('Paste a link, or a file name').fill(`https://example.com/${kind}`);
   await page.getByLabel('Object representation').selectOption(kind);
   await page.getByRole('button',{name:'Add to room',exact:true}).click();
   const row=page.locator('.list .row').filter({has:page.locator('.title',{hasText:`Test ${kind}`})});
   const selector=row.locator('select');
   assert.deepEqual(await selector.locator('option').evaluateAll(os=>os.map(o=>o.value)),kinds);
   // Every kind remains assignable to this existing URL content.
   for(const k of kinds) await selector.selectOption(k);
   await selector.selectOption(kind);
   const rep=await page.evaluate(title=>window.store.repFor(window.store.state.contentItems.find(c=>c.title===title).id),`Test ${kind}`);
   await row.getByRole('button',{name:'Pick up',exact:true}).click();
   assert.equal(await page.evaluate(id=>window.store.slotOf(id),rep.id),undefined);
   await clickSlot('floor-5');
   assert.equal(await page.evaluate(id=>window.store.slotOf(id),rep.id),'floor-5');
   // Hit-test the actual meshes with mouse moves, then select on the canvas.
   let hit=null;
   for(const height of (kind==='rug'?[.02]:[.5,.8,.3,1])) {
     const p=await project('floor-5',height);
     for(const dx of [0,-12,12]) {
       await page.mouse.move(p.x+dx,p.y);
       if(await page.locator('.tooltip').isVisible() && (await page.locator('.tooltip').textContent()).startsWith(`Test ${kind} `)){hit={x:p.x+dx,y:p.y};break;}
     }
     if(hit)break;
   }
   assert.ok(hit,`${kind} has reachable mouse hit geometry`);
   await page.mouse.click(hit.x,hit.y);
   assert.equal(await page.evaluate(()=>window.store.selectedId),rep.id);
   const other=await page.evaluate(()=>window.store.repAt('floor-3'));
   await clickSlot('floor-3');
   assert.equal(await page.evaluate(id=>window.store.slotOf(id),rep.id),'floor-3');
   if(other) assert.equal(await page.evaluate(id=>window.store.slotOf(id),other),'floor-5');
   await page.getByRole('button',{name:'Undo',exact:true}).click();
   assert.equal(await page.evaluate(id=>window.store.slotOf(id),rep.id),'floor-5');
   await row.getByRole('button',{name:'Stash',exact:true}).click();
   assert.equal(await row.getByRole('button',{name:'Bring out',exact:true}).count(),1);
   assert.equal(await row.locator('a').getAttribute('href'),`https://example.com/${kind}`);
   await page.getByRole('button',{name:'Undo',exact:true}).click();
   assert.equal(await selector.inputValue(),kind);
   // Leave each imported model in a separate visible spot.
   await row.getByRole('button',{name:'Pick up',exact:true}).click();
   await clickSlot(['floor-4','loft-3','floor-2','floor-3','floor-5'][imported.indexOf(kind)]);
 }
 await page.getByLabel('Upload local photo').setInputFiles('/home/dvgpro/Projects/misc.-palace-dev-sandbox/pitch-off-materials/references/isometric-vibey-room-idea-zoom.jpeg');
 await page.waitForFunction(()=>window.store.state.contentItems.some(c=>c.imageData));
 const photoRow=page.locator('.row').filter({hasText:'local photo · included in export'});
 await photoRow.getByRole('button',{name:'Pick up',exact:true}).click();await clickSlot('loft-1');
 await page.getByPlaceholder('Title (optional)').fill('A visible book title');
 await page.getByPlaceholder('Paste a link, or a file name').fill('https://example.org/book');
 await page.getByLabel('Object representation').selectOption('book');await page.getByRole('button',{name:'Add to room',exact:true}).click();
 await page.locator('.row').filter({hasText:'A visible book title'}).getByRole('button',{name:'Pick up',exact:true}).click();await clickSlot('loft-2');
 // Real download, re-import, reload: photos, IDs, kinds, slots and lighting survive.
 const before=await page.evaluate(()=>window.store.state);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export room',exact:true}).click();
 const download=await downloadPromise;
 const {readFile}=await import('node:fs/promises');
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(exported,before);
 await importRoom(exported);await page.waitForTimeout(100);await page.reload();await page.waitForFunction(()=>window.store);
 await page.getByRole('button', { name: 'Edit room', exact: true }).click();
 assert.deepEqual(await page.evaluate(()=>window.store.state),before);
 for(const [theme,lighting] of [['loft','loft'],['study','dawn']]) {
   const legacy={...before,appearance:{theme,lighting}};delete legacy.lighting;
   await importRoom(legacy);
   await page.waitForFunction(l => window.store.state.lighting === (l === 'loft' ? undefined : l), lighting);
   await page.reload();await page.waitForFunction(()=>window.store);
   await page.getByRole('button', { name: 'Edit room', exact: true }).click();
   const migrated=await page.evaluate(()=>window.store.state);
   const expected={...before};if(lighting==='loft')delete expected.lighting;else expected.lighting=lighting;
   assert.deepEqual(migrated,expected);
 }
 const media=await page.evaluate(async()=>{
   const {buildObject}=await import('/src/views/objects.ts');
   const {disposeGroup}=await import('/src/views/resources.ts');
   const photo=window.store.state.contentItems.find(c=>c.imageData);
   const frame=buildObject('photoFrame',photo),book=buildObject('book',{title:'A visible book title'});
   const result={photo:!!frame.getObjectByName('photo-image')?.material.map,book:!!book.getObjectByName('book-title')?.material.map};
   disposeGroup(frame);disposeGroup(book);return result;
 });assert.deepEqual(media,{photo:true,book:true});
 await page.getByLabel('Lighting preset').selectOption('');
 await page.waitForTimeout(500);
 await page.screenshot({path:'/home/dvgpro/.hermes/cache/scratch/movable-furniture-review.png'});
 // Broken saves fail visibly without overwriting either raw copy.
 await page.evaluate(()=>{localStorage.setItem('mp-sandbox:room','{broken');localStorage.setItem('mp-sandbox:room:backup','broken backup');});
 await page.reload();
 await page.getByRole('alert').waitFor({timeout:5000});
 assert.match(await page.getByRole('alert').textContent(),/Local data has not been changed/);
 assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('mp-sandbox:room'),localStorage.getItem('mp-sandbox:room:backup')]),['{broken','broken backup']);
 const rawDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Download saved room'}).click();
 assert.equal(await readFile(await (await rawDownload).path(),'utf8'),'{broken');
 assert.deepEqual(errors,[]);
 console.log('PASS: all 14 kinds in both DOM selectors; 5 imported kinds added/assigned, mesh-hit selected, picked up, placed, swapped, stashed and undone; URL links retained; photo/book textures; download/import/reload; loft+study migrations; no page errors');
} finally { await browser.close(); }
