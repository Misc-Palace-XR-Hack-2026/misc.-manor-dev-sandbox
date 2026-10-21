// Trusted input against the actual RoomView raycaster and MenuView, isolated storage.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs');
const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5207';
const out = process.env.ARTIFACT_DIR ?? resolve('artifacts/selection-gesture');
await mkdir(out, { recursive: true });
// Compare Vite's original sources with this checkout, not just a feature-name marker.
for (const file of ['src/main.ts','src/views/room.ts','src/core/store.ts','src/core/types.ts']) {
 const served = await (await fetch(`${base}/${file}`)).text();
 const map = JSON.parse(Buffer.from(served.split('base64,').at(-1).trim(), 'base64'));
 assert.equal(map.sourcesContent[0], await readFile(resolve(file), 'utf8'), `server must serve this worktree: ${file}`);
}
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] });
const results = [], errors = [];
try {
 for (const device of ['mouse', 'touch']) {
  for (const action of ['stash', 'pick-up', 'delete']) {
   const context = await browser.newContext({ viewport: device === 'mouse' ? {width:1440,height:1000} : {width:390,height:844}, hasTouch: device === 'touch', isMobile: device === 'touch' });
   const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
   // Expose the actual view for camera positioning only; no production input handlers are replaced.
   await page.route(/\/src\/main\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: (await response.text()).replace('const room = new RoomView(', 'const room = window.testRoom = new RoomView(')});
   });
   await page.goto(`${base}/dev/`); await page.waitForFunction(() => !!window.testRoom);
   // Keep unrelated floating utility controls out of the fixture's ray. The item sheet is unchanged.
   await page.addStyleTag({content:'body > button:not(.sheet-backdrop), .chrome { visibility:hidden !important; }'});
   const id = await page.evaluate(() => {
    window.tutorial?.exit?.();
    const s = window.store;
    const id = s.addItem({title:'Gesture fixture',sourceRef:'Keep this content',type:'note',kind:'box'});
    s.select(id); return id;
   });
   const button = page.locator(`.item-sheet [data-action="${action}"]`);
   await button.waitFor({state:'visible'});
   const box = await button.boundingBox(); const point = {x:box.x+box.width/2,y:box.y+box.height/2};
   await page.evaluate(async ({id,point}) => {
    const r = window.testRoom, s = window.store;
    s.select(null);
    // End any selection animation before projecting the resting object.
    await new Promise(resolve => setTimeout(resolve, 350));
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const entry = r.objects.get(id);
    const center = new THREE.Box3().setFromObject(entry.group).getCenter(new THREE.Vector3());
    const rect = r.renderer.domElement.getBoundingClientRect();
    const projected = center.clone().project(r.camera);
    const desired = new THREE.Vector3((point.x-rect.left)/rect.width*2-1,1-(point.y-rect.top)/rect.height*2,projected.z).unproject(r.camera);
    const delta = center.clone().sub(desired);
    r.camera.position.add(delta); r.controls.target.add(delta); r.controls.update();
    r.camera.updateMatrixWorld();
    window.inputEvents=[];
    for (const type of ['pointerdown','pointerup','pointercancel','mousedown','mouseup','click']) document.addEventListener(type,e => window.inputEvents.push({type,trusted:e.isTrusted,target:e.target.dataset?.action ?? e.target.tagName}),true);
   }, {id,point});
   await page.waitForTimeout(100);
   assert.equal(await page.evaluate(p => document.elementFromPoint(p.x,p.y)?.tagName,point),'CANVAS');
   assert.equal(await page.evaluate(p => window.testRoom.repIdAt(p),{clientX:point.x,clientY:point.y}), id, 'real ray must hit fixture at future button center');
   // A real orbit drag must not select. Restore only the camera fixture afterward.
   const camera = await page.evaluate(() => ({position:window.testRoom.camera.position.toArray(),target:window.testRoom.controls.target.toArray()}));
   if (device === 'mouse') {
    await page.mouse.move(point.x,point.y); await page.mouse.down();
    await page.mouse.move(point.x-35,point.y-15,{steps:4}); await page.mouse.up();
   } else {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-35,y:point.y-15}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(() => window.store.selectedId),null,'touch drag does not select');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.ok(await page.evaluate(() => window.inputEvents.some(e=>e.type==='pointercancel' && e.trusted)),'trusted cancellation delivered');
    await cdp.detach();
   }
   assert.equal(await page.evaluate(() => window.store.selectedId),null,'drag/cancel does not select');
   await page.waitForTimeout(350);
   await page.evaluate(camera => {
    const r=window.testRoom; r.camera.position.fromArray(camera.position);r.controls.target.fromArray(camera.target);r.controls.update();r.camera.updateMatrixWorld();window.inputEvents=[];
   },camera);
   assert.equal(await page.evaluate(p => window.testRoom.repIdAt(p),{clientX:point.x,clientY:point.y}),id);
   if (device === 'mouse') await page.mouse.click(point.x,point.y); else await page.touchscreen.tap(point.x,point.y);
   const state = await page.evaluate(id => ({selected:window.store.selectedId,exists:window.store.state.representations.some(r=>r.id===id),holding:window.store.holding,events:window.inputEvents}),id);
   results.push({device,action,point,...state});
   await page.screenshot({path:`${out}/${device}-${action}.png`});
   if (process.env.PROBE_ONLY !== '1') {
    assert.equal(state.selected,id,`${device} ${action}: selection must survive initial gesture`);
    assert.equal(state.exists,true,`${device} ${action}: no accidental stash/delete`);
    assert.equal(state.holding,null,`${device} ${action}: no accidental move`);
    if (device === 'touch') await button.tap(); else await button.click();
    const after = await page.evaluate(id => ({exists:window.store.state.representations.some(r=>r.id===id),holding:window.store.holding}),id);
    assert.equal(action === 'pick-up' ? after.holding === id : !after.exists,true,'intentional next click works');
    if (action === 'pick-up') {
     await page.keyboard.press('Escape');
     assert.ok(await page.evaluate(id=>window.store.slotOf(id),id),'Escape restores pickup');
    }
    if (action === 'stash') {
     const contentId=await page.evaluate(()=>window.store.state.contentItems.find(c=>c.title==='Gesture fixture').id);
     await page.reload(); await page.waitForFunction(()=>!!window.store);
     assert.equal(await page.evaluate(id=>window.store.content(id).lastObjectKind,contentId),'box');
     await page.evaluate(id=>window.store.bringOut(id),contentId);
     assert.equal(await page.evaluate(id=>window.store.repFor(id).objectKind,contentId),'box','real browser save/reload restore');
    }
    for (const key of ['Enter','Space']) {
     const keyboardId=await page.evaluate(()=>{const s=window.store; const id=s.addItem({title:'Keyboard fixture',sourceRef:'',kind:'robot'});s.select(id);return id;});
     await button.focus(); await page.keyboard.press(key);
     const keyboardAfter=await page.evaluate(id=>({exists:window.store.state.representations.some(r=>r.id===id),holding:window.store.holding}),keyboardId);
     assert.equal(action==='pick-up' ? keyboardAfter.holding===keyboardId : !keyboardAfter.exists,true,`${key} remains accessible`);
     if(action==='pick-up') await page.keyboard.press('Escape');
    }
    Object.assign(results.at(-1),{deliberateAction:true,keyboardEnter:true,keyboardSpace:true,dragSafe:true,cancelSafe:device==='touch'});
   }
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
} finally {
 await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors},null,2)); await browser.close();
}
