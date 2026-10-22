// Real Chromium WebGL + synthetic XR controller dispatch, not headset evidence.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.MP_EVIDENCE ?? '/home/dvgpro/.hermes/cache/scratch/vr-portal-jukebox-evidence';
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5534/dev/');
 await page.waitForFunction(() => window.store);
 const result = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { Store, newRoom } = await import('/src/core/store.ts');
  const { RoomView } = await import('/src/views/room.ts');
  const { REPO_ROOMS } = await import('/src/core/repo-rooms.ts');
  const { roomSoundtrack, SoundtrackPlayer } = await import('/src/views/soundtrack.ts');
  const host = document.createElement('div'); host.style.cssText='position:fixed;inset:0;z-index:999;width:1280px;height:900px'; document.body.append(host);
  const store = new Store(newRoom(), 'vr-amenity-proof');
  const view = new RoomView(host, store, REPO_ROOMS); view.renderer.setAnimationLoop(null);
  const xr=view.xr, panel=xr.panel;
  const audio = { src:'', volume:1, loop:false, preload:'', paused:true, plays:0, pauses:0, addEventListener(){},removeAttribute(){}, async play(){this.plays++;this.paused=false;},pause(){this.pauses++;this.paused=true;} };
  const player=new SoundtrackPlayer(store,{audio,listen:false,fade:async(_a,b,_ms,set)=>set(b)});
  function check(v,m){if(!v)throw Error(m);}
  check(!xr.amenities.active,'models absent outside VR');
  const desktop=new THREE.Group();desktop.userData.xrDesktopOnly=true;view.scene.add(desktop);
  xr.onStart();check(!desktop.visible,'desktop-only demo scenery hidden');xr.camera.aspect=1280/900;xr.camera.updateProjectionMatrix();xr.camera.position.y=1.65;
  check(xr.amenities.active,'models active in VR');
  let introFrames=0;view.setDemo({frame:()=>introFrames++});view.tick(performance.now()/1000);check(introFrames===0,'demo intro paused in VR');view.setDemo(null);
  const controller=xr.controllers[0]; controller.matrixAutoUpdate=true; controller.position.set(0,1.5,0);
  function aim(point){xr.scene.updateMatrixWorld(true);controller.lookAt(point);controller.rotateY(Math.PI);xr.scene.updateMatrixWorld(true);}
  function selectModel(kind){store.select(null);xr.updateControllers(performance.now(), .016);panel.hide(); const model=xr.amenities[kind];aim(model.group.position.clone().add(new THREE.Vector3(0,1,0))); const hit=xr.pick(controller);check(hit?.kind===kind,'controller hits '+kind+' (got '+hit?.kind+') '+JSON.stringify({amenity:xr.amenities.hit(xr.rayFrom(controller))?.kind,block:xr.raycaster.intersectObjects(xr.room.children,true).slice(0,2).map(h=>({name:h.object.name,at:h.point.toArray(),d:h.distance}))}));controller.dispatchEvent({type:'selectstart'});controller.dispatchEvent({type:'selectend'});check(panel.page===(kind==='portal'?'portal':'jukebox'),'opens '+kind);}
  function press(id){for(let i=0;i<20;i++){const b=panel.shown.find(b=>b.id===id);if(b){const p=panel.mesh.localToWorld(new THREE.Vector3((b.x/1024-.5)*.84,(.5-b.y/1408)*1.16,0));aim(p);controller.dispatchEvent({type:'selectstart'});controller.dispatchEvent({type:'selectend'});return;}const next=panel.shown.find(b=>b.id==='ui:next');if(!next){if(panel.scroll>0){panel.scroll=0;panel.redraw();continue;}throw Error('missing '+id);}panel.activate({x:next.x/1024,y:1-next.y/1408});}throw Error('pagination');}
  selectModel('portal');press('portal:drop');
  const count=store.state.contentItems.length;check(count>=4,'random drop added production content');store.flushSave();check(Store.loadSaved('vr-amenity-proof').contentItems.length===count,'saved drop');
  press('page:create');panel.draft.title='VR note';panel.draft.text='Controller-created text';panel.draft.mode='note';press('create:submit');check(store.state.contentItems.some(c=>c.title==='VR note'),'created text');
  xr.player.rotation.y=0; selectModel('jukebox');check(audio.plays===0,'opening never autoplays');
  const {ROOM_TRACKS}=await import('/src/core/soundtrack.ts');
  for(const track of ROOM_TRACKS){press('music:'+track);check(store.state.soundtrack?.track===track,'select track '+track);}
  press('music:off');check(store.state.soundtrack?.mode==='off','no music');press('music:follow');check(!store.state.soundtrack,'follow lighting');
  press('player:play');await player.idle();check(audio.plays>0 && !audio.paused,'shared player play');
  press('player:pause');check(audio.paused,'pause');press('player:play');check(!audio.paused,'resume');press('player:mute');check(audio.paused,'mute');
  check(roomSoundtrack(store)===player,'single player');
  player.setEmbedPlaying(true);press('player:play');check(audio.paused,'embed coordination');player.setEmbedPlaying(false);
  // Hold uses a batched Store transaction and release stops further clearing.
  selectModel('portal');
  const clean=panel.shown.find(b=>b.id==='portal:clean');
  aim(panel.mesh.localToWorld(new THREE.Vector3((clean.x/1024-.5)*.84,(.5-clean.y/1408)*1.16,0)));
  const placements=store.state.placements.length;
  controller.dispatchEvent({type:'selectstart'});xr.cleanTick(performance.now()+400);controller.dispatchEvent({type:'selectend'});
  check(store.state.placements.length===placements-1,'hold clears one');
  xr.cleanTick(performance.now()+2000);check(store.state.placements.length===placements-1,'release stops cleaning');store.undo();check(store.state.placements.length===placements,'clean undo');
  controller.dispatchEvent({type:'selectstart'});panel.show('home');xr.cleanTick(performance.now()+400);check(store.state.placements.length===placements && !xr.cleaning,'page switch cancels clean');controller.dispatchEvent({type:'selectend'});
  // Advance the actual XR frame lifecycle (the headset pose itself is synthetic).
  const beforeRotation=xr.amenities.jukebox.group.children.find(o=>o.type==='Group')?.rotation.z;
  const rawUpdate=xr.amenities.update.bind(xr.amenities);let animated=0;xr.amenities.update=(t,dt)=>{animated++;rawUpdate(t,dt);};
  Object.defineProperty(view.renderer.xr,'isPresenting',{configurable:true,value:true});xr.tick();Object.defineProperty(view.renderer.xr,'isPresenting',{configurable:true,value:false});check(animated===1,'XR tick animates production models');
  window.proof={view,xr,panel,store,controller,selectModel,press};
  return {count,plays:audio.plays,pauses:audio.pauses,gl: view.renderer.getContext().getParameter(view.renderer.getContext().VERSION)};
 });
 await page.evaluate(() => { const {view,xr,panel}=window.proof; panel.hide();const cam=xr.camera;xr.player.position.set(5,0,6.7);cam.position.set(0,1.65,0);cam.lookAt(8.8,1.2,3.5);view.scene.updateMatrixWorld(true);view.renderer.render(view.scene,cam); });
 await page.screenshot({path:evidence+'/models.png'});
 for(const kind of ['portal','jukebox']) {
  await page.evaluate(kind=>{const {view,xr,panel}=window.proof;xr.player.position.set(4.2,0,3.4);xr.player.rotation.set(0,0,0);xr.camera.position.set(0,1.65,0);xr.camera.rotation.set(0,0,0);panel.group.position.set(0,.2,0);panel.group.rotation.set(0,0,0);panel.setStatus('');panel.show(kind);view.scene.updateMatrixWorld(true);view.renderer.render(view.scene,xr.camera);},kind);
  await page.screenshot({path:evidence+'/'+kind+'-menu.png'});
 }
 await page.evaluate(async()=>{const {xr}=window.proof;xr.overlayGranted=true;xr.overlay.hidden=false;await xr.openImports();});
 await page.locator('.xr-import-sheet input[accept=".html,text/html"]').setInputFiles({name:'bookmarks.html',mimeType:'text/html',buffer:Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="https://example.com/xr-bookmark">XR bookmark proof</A></DL>')});
 await page.waitForFunction(()=>window.proof.store.state.contentItems.some(c=>c.title==='XR bookmark proof'));
 await page.evaluate(async()=>window.proof.xr.openImports());
 await page.locator('.xr-import-sheet input[type=file][multiple]:not([webkitdirectory])').setInputFiles({name:'xr-file-proof.pdf',mimeType:'application/pdf',buffer:Buffer.from('name-only import')});
 await page.waitForFunction(()=>window.proof.store.state.contentItems.some(c=>c.sourceRef==='xr-file-proof.pdf' && c.sourceKind==='file'));
 await page.evaluate(async()=>{const {xr}=window.proof;xr.overlayGranted=false;xr.exit=async()=>xr.onEnd();await xr.openImports();if(!document.querySelector('body > .xr-import-sheet'))throw Error('desktop fallback did not open');});
 await page.screenshot({path:evidence+'/import-fallback.png'});
 await page.evaluate(()=>{window.proof.xr.imports.close();window.proof.xr.onStart();});
 const lifecycle=await page.evaluate(()=>{const {xr,store}=window.proof;const before=store.exportJson();xr.onEnd();const cleaned=!xr.amenities.active;xr.onStart();const kept=store.exportJson()===before;xr.onEnd();return {cleaned,kept};});
 assert.deepEqual(lifecycle,{cleaned:true,kept:true});assert.deepEqual(errors,[]);
 writeFileSync(evidence+'/result.json',JSON.stringify({result,lifecycle,errors},null,2));
 console.log('PASS portal/jukebox controller actions, persistence, playback, lifecycle',result,lifecycle);
} finally {await browser.close();}
