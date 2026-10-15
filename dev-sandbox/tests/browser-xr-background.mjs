// Install Playwright locally or point PLAYWRIGHT_MODULE at an existing module.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 const page = await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
 await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.store);
 const result = await page.evaluate(async()=>{
  const THREE = await import('/node_modules/three/build/three.module.js');
  const {RoomView}=await import('/src/views/room.ts');
  const {Store,newRoom}=await import('/src/core/store.ts');
  const {SURFACE_PRESETS}=await import('/src/core/surfaces.ts');
  const host=document.createElement('div');host.style.cssText='width:320px;height:160px';document.body.append(host);
  const store=new Store(newRoom());
  const room=new RoomView(host,store);
  room.renderer.setAnimationLoop(null);
  const target=new THREE.WebGLRenderTarget(128,64);
  room.renderer.setRenderTarget(target);
  // Real Three.js stereo ArrayCamera rendering with synthetic head poses; no physical XR runtime.
  const eyes=[-.032,.032].map(x=>{
   const eye=new THREE.PerspectiveCamera(70,1,.05,40);
   eye.position.x=x;eye.viewport=new THREE.Vector4(x<0?0:64,0,64,64);return eye;
  });
  const stereo=new THREE.ArrayCamera(eyes), rig=new THREE.Group();rig.add(...eyes);
  let immersive=false;room.xr.tick=()=>immersive?stereo:null;
  const render=(pitch=0,yaw=0,roll=0,position=[0,0,0])=>{
   rig.rotation.set(pitch,yaw,roll);rig.position.set(...position);rig.updateMatrixWorld(true);
   // Isolate sky pixels from moving furniture, guides, shadows, and UI.
   for(const child of room.scene.children)child.visible=false;
   // ArrayCamera leaves the last eye viewport active; reset for the next pass.
   room.renderer.setRenderTarget(target);
   room.tick(0);
   const pixels=new Uint8Array(128*64*4);room.renderer.readRenderTargetPixels(target,0,0,128,64,pixels);
   return pixels;
  };
  const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
  const chart=document.createElement('canvas');chart.width=512;chart.height=256;
  const c=chart.getContext('2d');
  for(let y=0;y<8;y++)for(let x=0;x<16;x++){
   c.fillStyle=`rgb(${(x*37)%256},${y*31},${(x*19+y*29)%256})`;c.fillRect(x*32,y*32,32,32);
  }
  const selections=[...Object.keys(SURFACE_PRESETS.background).filter(p=>p!=='custom').map(preset=>({preset})),{preset:'custom',imageData:chart.toDataURL()}];
  const checks=[];
  for(const selection of selections){
   store.setSurface('background',selection);
   const texture=room.scene.background;
   if(selection.preset==='custom')await texture.image.decode();
   immersive=false;const desktop=render();
   immersive=true;const forward=render();const turned=render(.35,.7,.15);
   const translated=render(0,0,0,[12,3,-7]);
   const mapping=texture.mapping;
   const back=render();
   const axes=selection.preset==='custom' ? [difference(forward,render(0,.7,0)),difference(forward,render(.35,0,0)),difference(forward,render(0,0,.3))] : null;
   immersive=false;const restored=render();
   const desktopMapping=texture.mapping;
   immersive=true;
   // Switching a finish while still immersed must also choose the world-fixed path.
   store.setSurface('background',selection.preset==='sky'?{preset:'gradient'}:{preset:'sky'});
   render();
   store.setSurface('background',selection);
   if(selection.preset==='custom')await room.scene.background.image.decode();
   const replaced=render();
   checks.push({preset:selection.preset,mapping,rotation:difference(forward,turned),translation:difference(forward,translated),returnPose:difference(forward,back),replacement:difference(forward,replaced),axes,desktop:difference(desktop,restored),desktopMapping});
  }
  target.dispose();room.renderer.dispose();host.remove();return checks;
 });
 assert.ok(result.length>10);
 for(const r of result){
  assert.ok(r.rotation>1,`${r.preset}: rotating head must change sky pixels (${r.rotation})`);
  assert.equal(r.mapping,303,`${r.preset}: XR must use world-direction mapping`);
  assert.ok(r.translation<.1,`${r.preset}: distant sky must ignore translation (${r.translation})`);
  assert.equal(r.returnPose,0,`${r.preset}: returning head pose restores world-fixed sky`);
  assert.equal(r.replacement,0,`${r.preset}: replacing textures in VR preserves orientation`);
  if(r.axes)for(const change of r.axes)assert.ok(change>1,'custom image responds to yaw, pitch, and roll separately');
  assert.equal(r.desktop,0,`${r.preset}: desktop appearance survives VR`);
  assert.equal(r.desktopMapping,300);
 }
 assert.deepEqual(errors,[]);
 console.log(`PASS: ${result.length} backgrounds (including custom upload), stereo yaw/pitch/roll, translation invariance, return pose, desktop restoration; no browser errors. Synthetic poses, not a headset session.`);
 console.log(JSON.stringify(result));
} finally {await browser.close();}
