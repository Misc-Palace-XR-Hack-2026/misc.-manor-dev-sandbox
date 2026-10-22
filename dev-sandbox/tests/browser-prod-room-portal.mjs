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
 await page.evaluate(()=>{const store=window.__productionRoomView.store;const id=store.addItem({title:'Browser packed guitar',sourceRef:'https://example.com/packed-guitar',kind:'guitar'});window.packProof={id,content:store.state.representations.find(r=>r.id===id).contentItemId};store.select(id);});
 await page.locator('.item-sheet:visible').getByRole('button',{name:'Pack item',exact:true}).click();
 const itemPoint=await page.evaluate(()=>{const view=window.__productionRoomView;const p=view.scene.getObjectByName('save-point').position.clone().add({x:0,y:1,z:0}).project(view.activeCamera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(itemPoint.x,itemPoint.y);await page.locator('.demo-sp:visible summary').filter({hasText:'Unpack'}).click();
 await page.screenshot({path:OUT+'/desktop-unpack.png'});
 await page.locator('.demo-sp:visible').getByRole('button',{name:'Unpack Browser packed guitar',exact:true}).click();
 assert.equal(await page.locator('.demo-sp:visible .demo-packed-list').getByText(/No packed items/).count(),1);
 facts.desktopUnpack=await page.evaluate(async()=>{const store=window.__productionRoomView.store;const {Store}=await import('/src/core/store.ts');store.flushSave();return {model:store.repFor(window.packProof.content)?.objectKind,copies:store.state.representations.filter(r=>r.contentItemId===window.packProof.content).length,persisted:Store.loadSaved('demo-visit').representations.some(r=>r.contentItemId===window.packProof.content&&r.objectKind==='guitar')};});assert.deepEqual(facts.desktopUnpack,{model:'guitar',copies:1,persisted:true});
 await page.locator('.demo-sp:visible .demo-panel-close').click();
 const portalTap=await page.evaluate(()=>{const view=window.__productionRoomView;const model=view.scene.getObjectByName('rooms-portal');const p=model.position.clone().add({x:0,y:1,z:0}).project(view.activeCamera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(portalTap.x,portalTap.y);let dlg=page.locator('dialog[open]');assert.equal(await dlg.getByRole('button',{name:'Visit a random room',exact:true}).count(),1);assert.ok((await dlg.getByRole('link',{name:'Dev sandbox',exact:true}).getAttribute('href')).endsWith('/dev/'));const downloading=page.waitForEvent('download');await dlg.getByRole('button',{name:'Save room · JSON',exact:true}).click();
 const download=await downloading;await download.saveAs(OUT+'/exported-room.json');facts.download=download.suggestedFilename();
 const hudBefore={camera:await page.locator('.demo-camera').boundingBox(),help:await page.locator('.demo-hud').getByRole('button',{name:'Help',exact:true}).boundingBox()};
 await dlg.getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
 await page.waitForFunction(()=>window.__productionRoomView.neighborhood);
 const expected=await page.evaluate(async()=>{const {roomCatalog}=await import('/src/core/room-portal.ts');const {REPO_ROOMS}=await import('/src/core/repo-rooms.ts');const catalog=roomCatalog(REPO_ROOMS);return {count:catalog.length,labels:catalog.map(r=>r.label)};});
 const count=await page.evaluate(()=>window.__productionRoomView.neighborhood.pavilions.length);assert.equal(count,expected.count);
 assert.equal(new Set(expected.labels).size,expected.count,'no two neighborhood rooms share a label');
 facts.desktopPavilions=count;facts.roomLabels=expected.labels;
 facts.culDeSacs=await page.evaluate(()=>{const w=window.__productionRoomView.neighborhood;const groups={};for(const p of w.pavilions)(groups[p.theme]??=[]).push(p.id);const lights=[];w.group.traverse(o=>{if(o.isPointLight)lights.push({distance:o.distance,shadow:o.castShadow,color:o.color.getHexString(),visible:o.visible});});const home=w.pavilions.find(p=>p.id==='home');if(w.street.position.distanceTo(home.doorway)>.001)throw Error('not outside My room');if(lights.length!==w.courts.length||lights.filter(l=>l.visible).length>4||lights.some(l=>!l.distance||l.shadow))throw Error('local light budget');return {groups,lights,homeSpawn:true};});
 facts.homeCameraHud=await page.evaluate(()=>{const home=document.querySelector('.demo-hud .neighborhood-back'),camera=document.querySelector('.demo-camera');if(!home||home.hidden||home.getBoundingClientRect().right>camera.getBoundingClientRect().left)throw Error('Home must precede Help/Camera');const h=home.getBoundingClientRect(),c=camera.getBoundingClientRect();if(Math.abs(h.y+h.height/2-c.y-c.height/2)>10||innerHeight-h.bottom>80)throw Error('Home not beside bottom Camera');if(!home.contains(document.elementFromPoint(h.x+h.width/2,h.y+h.height/2)))throw Error('Home occluded');return {adjacent:true,bottom:true};});
 // Icon-only, Help-styled, and the bar itself resizes instead of reserving an empty slot.
 facts.homeButton=await page.evaluate(()=>{const home=document.querySelector('.demo-hud .neighborhood-back'),help=[...document.querySelectorAll('.demo-hud .demo-hud-btn')].find(b=>b.textContent.trim()==='Help');const style=getComputedStyle(home),helpStyle=getComputedStyle(help);const hud=document.querySelector('.demo-hud');const wide=hud.getBoundingClientRect().width;const rightEdge=hud.getBoundingClientRect().right;home.hidden=true;const narrow=hud.getBoundingClientRect().width;const rightAfter=hud.getBoundingClientRect().right;home.hidden=false;return {text:home.textContent.trim(),label:home.getAttribute('aria-label'),title:home.title,icon:home.querySelector('svg')!==null,radius:style.borderRadius===helpStyle.borderRadius,background:style.backgroundColor===helpStyle.backgroundColor,height:Math.round(home.getBoundingClientRect().height)===Math.round(help.getBoundingClientRect().height),shrinks:wide-narrow>20,rightEdgeFixed:Math.abs(rightEdge-rightAfter)<1};});
 assert.equal(facts.homeButton.text,'','the home control is an icon, not words');
 assert.equal(facts.homeButton.label,'Return to my room');
 assert.equal(facts.homeButton.title,'Return to my room');
 for(const key of ['icon','radius','background','height','shrinks','rightEdgeFixed'])assert.equal(facts.homeButton[key],true,'home button '+key);
 assert.deepEqual(await page.locator('.demo-camera').boundingBox(),hudBefore.camera);assert.deepEqual(await page.locator('.demo-hud').getByRole('button',{name:'Help',exact:true}).boundingBox(),hudBefore.help);
 facts.homeCameraHud.stableHelpAndCamera=true;
 await page.screenshot({path:OUT+'/desktop-overworld.png'});
 const homeBefore=await page.evaluate(()=>window.__productionRoomView.store.exportJson());
 const clickPavilion=async id=>{
   const point=await page.evaluate(id=>{const v=window.__productionRoomView,w=v.neighborhood;v.scene.updateMatrixWorld(true);const p=w.pavilions.find(p=>p.id===id).center.clone().project(v.activeCamera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},id);
   await page.mouse.click(point.x,point.y);
 };
 await page.locator('.demo-camera-select').selectOption('tactile');await page.waitForTimeout(150);
 const streetBefore=await page.evaluate(()=>window.__productionRoomView.neighborhood.street.position.toArray());
 await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
 assert.ok(await page.evaluate(before=>window.__productionRoomView.neighborhood.street.position.distanceTo({x:before[0],y:before[1],z:before[2]})>.3,streetBefore));
 await page.screenshot({path:OUT+'/street-overworld.png'});
 await page.locator('.demo-camera-select').selectOption('dollhouse');await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.__productionRoomView.neighborhood.pavilions.length),expected.count);
 await clickPavilion('directory:matt');await page.waitForFunction(()=>window.__productionRoomView.store.visiting==='directory:matt');
 assert.equal(await page.locator('.demo-hud .neighborhood-back').isVisible(),true);
 await page.locator('.neighborhood-back').click();
 assert.equal(await page.evaluate(()=>window.__productionRoomView.store.exportJson()),homeBefore);
 facts.walkAndModeSwitch=true;facts.actualPavilionClickAndExactHome=true;
 const ids=await page.evaluate(async()=>{const {roomCatalog}=await import('/src/core/room-portal.ts');const {REPO_ROOMS}=await import('/src/core/repo-rooms.ts');return roomCatalog(REPO_ROOMS).map(r=>r.id);});
 facts.clickedDestinations=[];
 for(const id of ids){
  await openRooms();await page.locator('dialog[open]').getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
  await clickPavilion(id);await page.waitForFunction(()=>!window.__productionRoomView.neighborhood);
  assert.equal(await page.evaluate(()=>window.__productionRoomView.store.visiting),id==='home'?null:id);
  if(id!=='home'){
    await openRooms();await page.locator('dialog[open]').getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
    assert.ok(await page.evaluate(id=>{const w=window.__productionRoomView.neighborhood;return w.street.position.distanceTo(w.pavilions.find(p=>p.id===id).doorway)<.001&&w.walkable(w.street.position);},id));
    await page.locator('.neighborhood-back').click();
  }
  assert.equal(await page.evaluate(()=>window.__productionRoomView.store.exportJson()),homeBefore);facts.clickedDestinations.push(id);
 }
 assert.equal(new Set(facts.clickedDestinations).size,expected.count);
 await openRooms();await page.locator('dialog[open]').getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
 await page.locator('.demo-camera-select').selectOption('tactile');
 await page.evaluate(()=>{const w=window.__productionRoomView.neighborhood,p=w.pavilions.find(p=>p.id==='directory:matt');w.setStreetPose(p.doorway,p.group.rotation.y);});
 await page.waitForTimeout(100);await page.screenshot({path:OUT+'/street-pavilion.png'});await clickPavilion('directory:matt');await page.waitForFunction(()=>window.__productionRoomView.store.visiting==='directory:matt');
 await page.locator('.neighborhood-back').click();assert.equal(await page.evaluate(()=>window.__productionRoomView.store.exportJson()),homeBefore);facts.tactilePavilionClick=true;
 await page.locator('.demo-camera-select').selectOption('dollhouse');await page.waitForTimeout(3500);
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
 assert.equal(await page.evaluate(()=>window.__productionRoomView.neighborhood.pavilions.length),count);await page.screenshot({path:OUT+'/mobile-overworld.png'});
 // Pan/zoom let even an offscreen pavilion be selected at phone aspect.
 await page.evaluate(()=>{const w=window.__productionRoomView.neighborhood;const p=w.pavilions.at(-1);const delta=p.center.clone().sub(w.controls.target);w.controls.target.add(delta);w.overview.position.add(delta);w.controls.update();});
 await clickPavilion(await page.evaluate(()=>window.__productionRoomView.neighborhood.pavilions.at(-1).id));
 await page.waitForFunction(()=>window.__productionRoomView.store.visiting);
 await page.locator('.neighborhood-back').click();facts.mobileLastPavilionReachable=true;
 await page.setViewportSize({width:320,height:844});await page.waitForTimeout(100);
 const mobileHudBefore={camera:await page.locator('.demo-camera').boundingBox(),help:await page.locator('.demo-hud').getByRole('button',{name:'Help',exact:true}).boundingBox()};
 await openRooms();await page.locator('dialog[open]').getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();
 assert.deepEqual(await page.locator('.demo-camera').boundingBox(),mobileHudBefore.camera);assert.deepEqual(await page.locator('.demo-hud').getByRole('button',{name:'Help',exact:true}).boundingBox(),mobileHudBefore.help);
 assert.ok(await page.evaluate(()=>{const h=document.querySelector('.demo-hud').getBoundingClientRect();return h.left>=0&&h.right<=innerWidth;}));await page.screenshot({path:OUT+'/mobile-hud-320.png'});
 await page.locator('.neighborhood-back').click();await page.setViewportSize({width:390,height:844});facts.homeCameraHud.mobile320StableAndUnclipped=true;
 await openRooms();await page.locator('dialog[open]').getByRole('button',{name:'Neighborhood / Overworld',exact:true}).click();await page.locator('.demo-camera-select').selectOption('tactile');
 const touchTarget=await page.evaluate(()=>{const w=window.__productionRoomView.neighborhood;const before=w.street.position.toArray();const p=w.street.position.clone().add(w.street.getWorldDirection(w.street.position.clone()).setY(0).normalize().multiplyScalar(3)).setY(.07).project(w.street);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,before};});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchTarget.x,y:touchTarget.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(650);
 assert.ok(await page.evaluate(before=>window.__productionRoomView.neighborhood.street.position.distanceTo({x:before[0],y:before[1],z:before[2]})>.5,touchTarget.before));
 await page.screenshot({path:OUT+'/mobile-street.png'});await page.locator('.neighborhood-back').click();await page.locator('.demo-camera-select').selectOption('dollhouse');facts.touchPathWalking=true;
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
  const store=new Store(newRoom('Browser My room'),'portal-proof');store.setLighting('twilight');store.setSurface('wall',{preset:'brick'});const pattern=document.createElement('canvas');pattern.width=pattern.height=32;const pc=pattern.getContext('2d');pc.fillStyle='#6a2999';pc.fillRect(0,0,32,32);pc.fillStyle='#a5df79';pc.fillRect(0,0,16,32);store.setSurface('floor',{preset:'custom',imageData:pattern.toDataURL('image/png')});const before=store.exportJson();
  const view=new RoomView(host,store,REPO_ROOMS);view.renderer.setAnimationLoop(null);const xr=view.xr,panel=xr.panel;xr.onStart();xr.camera.position.y=1.65;
  const controller=xr.controllers[0];controller.matrixAutoUpdate=true;controller.position.set(0,1.5,0);
  function aim(point){view.scene.updateMatrixWorld(true);controller.lookAt(point);controller.rotateY(Math.PI);view.scene.updateMatrixWorld(true);}
  function click(){controller.dispatchEvent({type:'selectstart'});controller.dispatchEvent({type:'selectend'});}
  panel.hide();aim(xr.amenities.rooms.group.position.clone().add(new THREE.Vector3(0,1,0)));check(xr.pick(controller)?.kind==='room-portal','ray hits rooms portal');click();check(panel.page==='room-portal','portal opens rooms page');
  function press(id){for(let i=0;i<30;i++){const b=panel.shown.find(b=>b.id===id);if(b){aim(panel.mesh.localToWorld(new THREE.Vector3((b.x/1024-.5)*.84,(.5-b.y/1408)*1.16,0)));click();return;}const next=panel.shown.find(b=>b.id==='ui:next');if(!next)throw Error('Unreachable '+id);panel.activate({x:next.x/1024,y:1-next.y/1408});}throw Error('paging loop');}
  press('page:overworld');check(view.neighborhood===xr.neighborhood,'XR shares actual neighborhood scene');const seen=view.neighborhood.pavilions.map(p=>p.id);const {roomCatalog:xrRoomCatalog}=await import('/src/core/room-portal.ts');const {REPO_ROOMS:xrRepoRooms}=await import('/src/core/repo-rooms.ts');const catalogIds=xrRoomCatalog(xrRepoRooms).map(r=>r.id);check(seen.length===catalogIds.length&&catalogIds.every(id=>seen.includes(id)),'every catalog room is a physical pavilion, with no duplicates');
  const world=view.neighborhood;const homeP=world.pavilions.find(p=>p.id==='directory:matt');
  xr.player.position.copy(homeP.doorway).setY(0);controller.position.set(0,1.5,0);aim(homeP.center);
  check(world.pick(xr.rayFrom(controller))?.id==='directory:matt','controller hits real pavilion');click();
  check(store.visiting==='directory:matt'&&!view.neighborhood,'controller enters actual room');
  panel.show('room-portal');press('home:return');check(store.exportJson()===before,'home unchanged');
  panel.show('room-portal');press('rooms:random');check(!!store.visiting,'random visit');press('home:return');
  panel.show('customize');press('page:lighting');press('light:dawn');check(store.state.lighting==='dawn','lighting works');store.undo();check(store.exportJson()===before,'look undo');
  const packedId=store.addItem({title:'XR packed guitar',sourceRef:'https://example.com/xr-packed',kind:'guitar'});const packedContent=store.state.representations.find(r=>r.id===packedId).contentItemId;
  store.select(packedId);panel.show('home');press('stash:'+packedId);check(!store.repFor(packedContent),'Pack item removes representation only');
  const packedSnapshot=store.exportJson();const full=JSON.parse(packedSnapshot);const source=full.contentItems[0];
  for(const [i,slot] of store.layout.slots.entries()){full.contentItems.push({...source,id:'fill-content-'+i});full.representations.push({id:'fill-rep-'+i,contentItemId:'fill-content-'+i,objectKind:'book'});full.placements.push({representationId:'fill-rep-'+i,slotId:slot.id});}
  store.replaceState(full);panel.show('portal');press('page:inbox');press('out:'+packedContent);check(panel.status.includes('Room is full'),'XR full feedback');check(!store.repFor(packedContent),'full room keeps packed content');
  store.replaceState(JSON.parse(packedSnapshot));panel.show('portal');press('page:inbox');press('out:'+packedContent);check(store.repFor(packedContent)?.objectKind==='guitar','XR Unpack keeps model');check(panel.status.includes('Unpacked'),'XR restore feedback');store.deleteContent(packedContent);check(store.exportJson()===before,'unpack proof cleanup preserves personal');
  xr.onEnd();check(!xr.amenities.rooms,'disposed rooms model');xr.onStart();check(store.exportJson()===before,'entry preserved room');
  window.proof={view,xr,panel,store,press};
  return {islands:seen.length,gl:view.renderer.getContext().getParameter(view.renderer.getContext().VERSION),personalPreserved:true,unpackModelAndFullFeedback:true};
 });
 await page.evaluate(()=>{const {view,xr,panel}=window.proof;view.openNeighborhood();xr.camera.position.set(0,1.65,0);xr.camera.rotation.set(0,0,0);panel.hide();view.scene.updateMatrixWorld(true);view.renderer.render(view.scene,xr.camera);});
 await page.screenshot({path:OUT+'/xr-overworld.png'});
 await page.waitForFunction(()=>{const w=window.proof.view.neighborhood;return w.pavilions.filter(p=>p.id==='home').every(p=>{let floor=null;p.group.traverse(m=>{if(m.userData.surface==='floor')floor=m;});return Boolean(floor?.material?.map?.image?.complete);});});
 facts.actualSurfaces=await page.evaluate(async()=>{
  const {view,store}=window.proof;const w=view.neighborhood;const {roomCatalog}=await import('/src/core/room-portal.ts');const {REPO_ROOMS}=await import('/src/core/repo-rooms.ts');const {getLayout}=await import('/src/core/layout.ts');const {surfaceTexture}=await import('/src/views/surface-textures.ts');let checked=0;
  for(const pavilion of w.pavilions){
   const data=pavilion.id==='home'?store.personalRoom:roomCatalog(REPO_ROOMS).find(r=>r.id===pavilion.id).data;
   const shellMeshes=[];pavilion.group.traverse(m=>{if(m.userData.surface)shellMeshes.push(m);});
   if(!shellMeshes.some(m=>m.userData.surface==='wall')||!shellMeshes.some(m=>m.userData.surface==='floor'))throw Error('missing shell surfaces '+pavilion.id);
   for(const mesh of shellMeshes){
    const target=mesh.userData.surface,selection=data.surfaces?.[target];if(JSON.stringify(mesh.userData.surfaceSelection)!==JSON.stringify(selection))throw Error('surface selection mismatch '+pavilion.id);
    if(selection){if(mesh.material.color.getHex()!==0xffffff||!mesh.material.map)throw Error('tinted/missing finish');
     if(selection.preset==='custom'){if(mesh.material.map.image.src!==selection.imageData)throw Error('custom image mismatch');}
     else{const expected=surfaceTexture(target,selection,()=>{throw Error('surface error')});if(mesh.material.map.image.toDataURL()!==expected.image.toDataURL())throw Error('procedural finish mismatch '+pavilion.id);expected.dispose();}
    }else if(mesh.material.color.getHex()!==new (mesh.material.color.constructor)(getLayout(data.layoutId).palette[target]).getHex())throw Error('default palette mismatch');
    checked++;
   }
  }
  return {pavilions:w.pavilions.length,shellMeshes:checked,personalBrickAndCustomFloor:true,allSeedFinishesMatch:true};
 });
 await page.evaluate(async()=>{const THREE=await import('/node_modules/three/build/three.module.js');const {view}=window.proof;const p=view.neighborhood.pavilions.find(p=>p.id==='home');const camera=new THREE.PerspectiveCamera(60,1.5,.05,500);camera.position.copy(p.group.localToWorld(new THREE.Vector3(9,7,12)));camera.lookAt(p.center);view.renderer.render(view.scene,camera);});
 await page.screenshot({path:OUT+'/surface-pavilion.png'});
 facts.signsAndCenterpieces=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');const {view}=window.proof;const world=view.neighborhood;const result={};
  for(const theme of ['daylight','warm','garden','electric']){
   const sign=world.group.getObjectByName('court-sign-'+theme);const front=sign.getObjectByName('neighborhood-sign-front'),back=sign.getObjectByName('neighborhood-sign-back');
   if(front.material.side!==THREE.FrontSide||back.material.side!==THREE.FrontSide||Math.abs(back.rotation.y-Math.PI)>.001||front.material.map!==back.material.map)throw Error('mirrored/backface sign '+theme);
   for(const [name,mesh,direction] of [['front',front,1],['back',back,-1]]){
    const target=mesh.getWorldPosition(new THREE.Vector3());const ray=new THREE.Raycaster(target.clone().add(new THREE.Vector3(0,0,direction*2)),new THREE.Vector3(0,0,-direction));
    if(ray.intersectObject(sign,true)[0]?.object!==mesh)throw Error('sign '+name+' occluded '+theme);
   }
   const model=world.group.getObjectByName('court-centerpiece-'+theme);const box=new THREE.Box3().setFromObject(model);
   if(model.userData.roomId||box.min.y<.85||box.min.y>1.15||world.walkable(model.position))throw Error('centerpiece not grounded/safe '+theme);
   result[theme]={text:front.userData.text,bothFaces:true,centerpiece:model.name,bottom:box.min.y};
  }
  return result;
 });
 for(const side of ['front','back']){
  await page.evaluate(async side=>{const THREE=await import('/node_modules/three/build/three.module.js');const {view}=window.proof;const sign=view.neighborhood.group.getObjectByName('court-sign-warm').getObjectByName('neighborhood-sign-'+side);const target=sign.getWorldPosition(new THREE.Vector3());const camera=new THREE.PerspectiveCamera(60,1.5,.05,250);camera.position.copy(target).add(new THREE.Vector3(1.8,.2,side==='front'?3:-2.7));camera.lookAt(target);view.renderer.render(view.scene,camera);},side);
  await page.screenshot({path:OUT+'/street-sign-'+side+'.png'});
 }
 for(const theme of ['daylight','warm','garden','electric']){
  await page.evaluate(async theme=>{const THREE=await import('/node_modules/three/build/three.module.js');const {view}=window.proof;const model=view.neighborhood.group.getObjectByName('court-centerpiece-'+theme);const camera=new THREE.PerspectiveCamera(60,1.5,.05,250);camera.position.copy(model.position).add(new THREE.Vector3(4,3,6));camera.lookAt(model.position.clone().add(new THREE.Vector3(0,.9,0)));view.renderer.render(view.scene,camera);},theme);
  await page.screenshot({path:OUT+'/centerpiece-'+theme+'.png'});
 }
 facts.xrTeleportAndMode=await page.evaluate(()=>{const {view,xr,store}=window.proof;const world=view.neighborhood;const before=store.exportJson();const position=xr.player.position.clone();xr.teleport(world.pavilions[0].center);if(!position.equals(xr.player.position))throw Error('unsafe building teleport');xr.teleport(new (world.street.position.constructor)(0,0,12));if(xr.player.position.z!==12)throw Error('street teleport');view.setNeighborhoodMode('dollhouse');if(view.neighborhood!==world)throw Error('world recreated');xr.onEnd();if(view.neighborhood!==world)throw Error('world lost on XR exit');xr.onStart();if(xr.neighborhood!==world)throw Error('world lost on XR reentry');if(getComputedStyle(document.querySelector('.demo-hud')).display!=='none')throw Error('desktop HUD visible in XR');window.proof.panel.show('neighborhood');window.proof.press('neighborhood:return');if(view.neighborhood)throw Error('XR Home did not close world');return {sameWorld:true,safeTeleport:true,xrHomeCameraAction:true,personalPreserved:store.exportJson()===before};});
 await page.evaluate(()=>{const {view,xr,panel,store}=window.proof;const id=store.addItem({title:'Packed guitar',sourceRef:'https://example.com/evidence-packed',kind:'guitar'});const content=store.state.representations.find(r=>r.id===id).contentItemId;store.stash(id);window.unpackEvidence=content;panel.show('portal');window.proof.press('page:inbox');view.scene.updateMatrixWorld(true);view.renderer.render(view.scene,xr.camera);});
 await page.screenshot({path:OUT+'/xr-unpack.png'});
 await page.evaluate(()=>{const {store,press}=window.proof;press('out:'+window.unpackEvidence);store.deleteContent(window.unpackEvidence);});
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
