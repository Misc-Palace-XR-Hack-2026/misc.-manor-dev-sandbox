// Real production route + Chromium WebGL, synthetic XR controller lifecycle (NOT headset evidence).
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const OUT=process.env.MP_EVIDENCE??'/home/dvgpro/.hermes/cache/scratch/prod-room-portal-evidence';mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.MP_URL??'http://127.0.0.1:5534';
const facts={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/views/room*',async route=>{const response=await route.fetch();let body=await response.text();body=body.replace('this.renderer.setAnimationLoop(', 'globalThis.__productionRoomView = this; this.renderer.setAnimationLoop(');await route.fulfill({response,body});});
 await page.goto(base+'/');await page.locator('.demo-skip-seq').click();await page.locator('.demo-exit').click();await page.locator('.demo-hud').waitFor({state:'visible'});
 const openRooms=async()=>{await page.waitForTimeout(150);const point=await page.evaluate(()=>{const view=window.__productionRoomView;const model=view.scene.getObjectByName('rooms-portal');const p=model.position.clone().add({x:0,y:1,z:0}).project(view.activeCamera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});await page.mouse.click(point.x,point.y);await page.locator('dialog[open]').waitFor();};
 assert.equal(await page.locator('.production-rooms').count(),0);assert.equal(await page.locator('.demo-edit-room').isVisible(),false);assert.equal(await page.locator('.demo-dev').isVisible(),false);
 await page.locator('.demo-camera-select').selectOption('dollhouse');await page.waitForTimeout(3500);
 assert.equal(await page.locator('.demo-camera-select option[value=vr]').count(),0);
 await page.screenshot({path:OUT+'/desktop-portals.png'});
 const portalTap=await page.evaluate(()=>{const view=window.__productionRoomView;const model=view.scene.getObjectByName('rooms-portal');const p=model.position.clone().add({x:0,y:1,z:0}).project(view.activeCamera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(portalTap.x,portalTap.y);let dlg=page.locator('dialog[open]');assert.equal(await dlg.getByRole('button',{name:'Visit a random room',exact:true}).count(),1);assert.ok((await dlg.getByRole('link',{name:'Dev sandbox',exact:true}).getAttribute('href')).endsWith('/dev/'));const downloading=page.waitForEvent('download');await dlg.getByRole('button',{name:'Save room · JSON',exact:true}).click();
 const download=await downloading;await download.saveAs(OUT+'/exported-room.json');facts.download=download.suggestedFilename();
 await dlg.getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
 const count=await dlg.locator('.room-island').count();assert.ok(count>10);facts.desktopIslands=count;
 await page.screenshot({path:OUT+'/desktop-overworld.png'});
 const homeBefore=await page.evaluate(()=>window.__productionRoomView.store.exportJson());
 await dlg.locator('[data-room-id="directory:matt"]').click();await openRooms();dlg=page.locator('dialog[open]');
 await dlg.getByRole('button',{name:'Return to My room',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__productionRoomView.store.exportJson()),homeBefore);
 await openRooms();dlg=page.locator('dialog[open]');
 const loaded=JSON.parse(homeBefore);loaded.owner='Imported browser room';
 await dlg.locator('input[type=file]').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(loaded))});await dlg.getByRole('status').filter({hasText:'Loaded room JSON'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__productionRoomView.store.state.owner),'Imported browser room');
 await dlg.getByRole('button',{name:'Undo room change',exact:true}).click();assert.equal(await page.evaluate(()=>window.__productionRoomView.store.exportJson()),homeBefore);
 await dlg.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"invalid":true}')});await dlg.getByRole('status').filter({hasText:'Room not loaded'}).waitFor();
 await page.evaluate(()=>{window.originalFileText=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>{window.releaseRead=()=>resolve(JSON.stringify({...window.__productionRoomView.store.state,owner:'Late overwrite'}));});};});
 await dlg.locator('input[type=file]').setInputFiles({name:'late.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await page.waitForFunction(()=>window.releaseRead);await dlg.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(()=>{window.releaseRead();File.prototype.text=window.originalFileText;});
 assert.notEqual(await page.evaluate(()=>window.__productionRoomView.store.state.owner),'Late overwrite');facts.staleImportCancelled=true;
 await page.locator('.demo-camera-select').selectOption('tactile');await page.waitForTimeout(3500);
 const walkTap=await page.evaluate(()=>{const view=window.__productionRoomView;view.renderer.setAnimationLoop(null);const model=view.scene.getObjectByName('rooms-portal');const target=model.position.clone();target.y=1.2;const cam=view.activeCamera;cam.position.set(target.x,1.65,target.z-1.7);cam.lookAt(target);view.scene.updateMatrixWorld(true);view.renderer.render(view.scene,cam);const p=target.project(cam);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(walkTap.x,walkTap.y);await page.locator('dialog[open]').waitFor();facts.tactilePortal=true;
 await page.evaluate(()=>{const v=window.__productionRoomView;v.renderer.setAnimationLoop(t=>v.tick(t/1000));});
 dlg=page.locator('dialog[open]');
 await dlg.getByRole('button',{name:'Customize · lighting, walls & floors',exact:true}).click();
 await page.locator('#lighting-preset').selectOption('twilight');await page.locator('.sheet-close:visible').first().click();
 await page.locator('.demo-camera-select').selectOption('dollhouse');await page.waitForTimeout(3500);
 await page.setViewportSize({width:390,height:844});await openRooms();dlg=page.locator('dialog[open]');await dlg.getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
 assert.equal(await dlg.locator('.room-island').count(),count);await page.screenshot({path:OUT+'/mobile-overworld.png'});
 await dlg.locator('.room-island').last().scrollIntoViewIfNeeded();await dlg.locator('.room-island').last().click();
 await openRooms();await page.locator('dialog[open]').getByRole('button',{name:'Return to My room',exact:true}).click();facts.mobileLastIslandReachable=true;
 // Support probe is synthetic, actual entry selection rejects: selection and saved camera must recover.
 await page.addInitScript(()=>{Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:()=>new Promise(r=>setTimeout(()=>r(true),600)),requestSession(){window.entryGestureActive=navigator.userActivation.isActive;window.requests=(window.requests??0)+1;return Promise.reject(new Error('Synthetic user cancellation'));}}});});
 const beforeReload=await page.evaluate(()=>window.__productionRoomView.store.exportJson());
 await page.reload();await page.locator('.demo-skip').click();await page.locator('.demo-camera-select').waitFor();assert.equal(await page.evaluate(()=>window.__productionRoomView.store.exportJson()),beforeReload);facts.introReplayPreserved=true;assert.equal(await page.locator('.demo-camera-select option[value=vr]').count(),0);await page.locator('.demo-camera-select option[value=vr]').waitFor({state:'attached'});await page.locator('.demo-camera-select').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.requests===1&&!document.querySelector('.demo-camera-select').disabled);assert.equal(await page.locator('.demo-camera-select').inputValue(),'dollhouse');
 facts.rejectionRecovery=await page.evaluate(()=>({requests:window.requests,gestureActive:window.entryGestureActive,camera:localStorage.getItem('mp-demo:camera')}));
 assert.equal(facts.rejectionRecovery.camera,'dollhouse');assert.equal(facts.rejectionRecovery.gestureActive,true);
 // Separate live production RoomView fixture: controller raycasts the real portal and real glass canvas targets.
 await page.setViewportSize({width:1440,height:960});
 facts.xr=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');const {Store,newRoom}=await import('/src/core/store.ts');const {RoomView}=await import('/src/views/room.ts');const {REPO_ROOMS}=await import('/src/core/repo-rooms.ts');const {roomCatalog}=await import('/src/core/room-portal.ts');
  const check=(v,m)=>{if(!v)throw Error(m)};
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:999;width:1440px;height:960px';document.body.append(host);
  const store=new Store(newRoom('Browser My room'),'portal-proof');store.setLighting('twilight');const before=store.exportJson();
  const view=new RoomView(host,store,REPO_ROOMS);view.renderer.setAnimationLoop(null);const xr=view.xr,panel=xr.panel;xr.onStart();xr.camera.position.y=1.65;
  const controller=xr.controllers[0];controller.matrixAutoUpdate=true;controller.position.set(0,1.5,0);
  function aim(point){view.scene.updateMatrixWorld(true);controller.lookAt(point);controller.rotateY(Math.PI);view.scene.updateMatrixWorld(true);}
  function click(){controller.dispatchEvent({type:'selectstart'});controller.dispatchEvent({type:'selectend'});}
  panel.hide();aim(xr.amenities.rooms.group.position.clone().add(new THREE.Vector3(0,1,0)));check(xr.pick(controller)?.kind==='room-portal','ray hits rooms portal');click();check(panel.page==='room-portal','portal opens rooms page');
  function press(id){for(let i=0;i<30;i++){const b=panel.shown.find(b=>b.id===id);if(b){aim(panel.mesh.localToWorld(new THREE.Vector3((b.x/1024-.5)*.84,(.5-b.y/1408)*1.16,0)));click();return;}const next=panel.shown.find(b=>b.id==='ui:next');if(!next)throw Error('Unreachable '+id);panel.activate({x:next.x/1024,y:1-next.y/1408});}throw Error('paging loop');}
  press('page:overworld');const seen=[];
  for(let p=0;p<20;p++){for(const b of panel.shown){if(b.id.startsWith('island:'))seen.push(b.id.slice(7));check(b.x-b.w/2>=0&&b.x+b.w/2<=1024&&b.y-b.h/2>=0&&b.y+b.h/2<=1408,'hit bounds');}if(!panel.shown.some(b=>b.id==='ui:next'))break;press('ui:next');}
  check(new Set(seen).size===roomCatalog(REPO_ROOMS).length,'every island reachable');
  panel.show('overworld');press('island:directory:matt');check(store.visiting==='directory:matt','controller visits Matt');press('home:return');check(store.exportJson()===before,'home unchanged');
  panel.show('room-portal');press('rooms:random');check(!!store.visiting,'random visit');press('home:return');
  panel.show('customize');press('page:lighting');press('light:dawn');check(store.state.lighting==='dawn','lighting works');store.undo();check(store.exportJson()===before,'look undo');
  xr.onEnd();check(!xr.amenities.rooms,'disposed rooms model');xr.onStart();check(store.exportJson()===before,'entry preserved room');
  window.proof={view,xr,panel,store,press};
  return {islands:seen.length,gl:view.renderer.getContext().getParameter(view.renderer.getContext().VERSION),personalPreserved:true};
 });
 for(const kind of ['room-portal','overworld']){await page.evaluate(kind=>{const {view,xr,panel}=window.proof;xr.player.position.set(4.2,0,3.4);xr.player.rotation.set(0,0,0);xr.camera.position.set(0,1.65,0);xr.camera.rotation.set(0,0,0);panel.group.position.set(0,.2,0);panel.group.rotation.set(0,0,0);panel.show(kind);view.scene.updateMatrixWorld(true);view.renderer.render(view.scene,xr.camera);},kind);await page.screenshot({path:OUT+'/xr-'+kind+'.png'});}
 // Granted overlay keeps the file form in VR; absent overlay exits before presenting it.
 await page.evaluate(()=>{const {xr,panel,press}=window.proof;xr.overlayGranted=true;xr.overlay.hidden=false;panel.show('room-portal');press('rooms:load');if(!xr.roomFiles.isOpen||!xr.overlay.querySelector('dialog[open]'))throw Error('overlay room form missing');xr.roomFiles.close();xr.overlayGranted=false;xr.exit=async()=>xr.onEnd();panel.show('room-portal');press('rooms:save');});
 await page.locator('body > dialog[open]').waitFor();await page.screenshot({path:OUT+'/xr-file-fallback.png'});
 await page.keyboard.press('Escape');
 facts.fileFallback=await page.evaluate(()=>{const {xr,store}=window.proof;xr.onStart();if(xr.roomFiles.isOpen)throw Error('stale form on reentry');const before=store.exportJson();xr.onEnd();return {overlay:true,browserExit:true,reentryClosed:true,preserved:store.exportJson()===before};});
 await page.goto(base+'/');await page.locator('.demo-skip').click();await page.locator('.demo-camera-select').waitFor();await page.waitForTimeout(3500);await openRooms();
 await page.locator('dialog[open]').getByRole('link',{name:'Dev sandbox',exact:true}).click();await page.waitForURL('**/dev/');await page.waitForFunction(()=>window.store);
 assert.equal(await page.locator('.chrome button[data-tutorial="style"]').isVisible(),true);assert.equal(await page.locator('.chrome button[data-tutorial="rooms"]').isVisible(),true);facts.devNavigationAndOrdinaryControls=true;
 assert.deepEqual(errors,[]);facts.errors=errors;writeFileSync(OUT+'/result.json',JSON.stringify(facts,null,2));console.log('PASS',JSON.stringify(facts,null,2));
}finally{await browser.close();}
