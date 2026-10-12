import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const artifacts = process.env.MP_ARTIFACTS ?? '/home/dvgpro/.hermes/cache/scratch/lighting-surfaces';
await mkdir(artifacts,{recursive:true});
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MP_URL ?? 'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.store);
 // Furnish the isolated browser room so preservation checks are not vacuous.
 await page.evaluate(()=>{
  for(const [kind,slot] of [['armchair','floor-1'],['sideTable','floor-2'],['plant','floor-3'],['turntable','floor-4'],['rug','floor-5'],['guitar','floor-6'],['book','loft-1'],['lamp','loft-2']]) {
   const id=window.store.addItem({title:`Texture review ${kind}`,sourceRef:`A ${kind} to keep`,type:'note',kind});
   window.store.place(id,slot);
  }
  window.store.setSoundtrack({mode:'track',track:'original'});
 });
 const textures = await page.evaluate(async()=>{
  const {SURFACE_LOOKS}=await import('/src/core/surface-looks.ts');
  const {surfaceTexture}=await import('/src/views/surface-textures.ts');
  const results=[];
  for(const [lighting,look] of Object.entries(SURFACE_LOOKS)) for(const target of ['floor','wall','background']) {
   const finish=look[target];
   const a=surfaceTexture(target,{preset:finish.id},()=>{throw Error('decode error')});
   const b=surfaceTexture(target,{preset:finish.id},()=>{});
   const canvas=a.image, ctx=canvas.getContext('2d');
   const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const colors=new Set(); let horizontal=0;
   for(let y=0;y<canvas.height;y+=4) for(let x=0;x<canvas.width;x+=4) {
    const i=(y*canvas.width+x)*4; colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
    if(x>0 && Math.abs(data[i]-data[i-4])+Math.abs(data[i+1]-data[i-3])+Math.abs(data[i+2]-data[i-2])>3) horizontal++;
   }
   results.push({lighting,target,id:finish.id,colors:colors.size,horizontal,deterministic:canvas.toDataURL()===b.image.toDataURL(),image:canvas.toDataURL(),space:a.colorSpace,wrap:a.wrapS});
   a.dispose();b.dispose();
  }
  return results;
 });
 assert.equal(textures.length,30);
 for(const t of textures) {
  assert.ok(t.colors>40,`${t.id}: needs procedural detail, found ${t.colors} colors`);
  assert.ok(t.horizontal>30,`${t.id}: must have detail beyond a vertical gradient`);
  assert.ok(t.deterministic,`${t.id}: stable across reloads`);
  assert.equal(t.space,'srgb');
  assert.equal(t.wrap,t.target==='background'?1001:1000);
 }
 assert.equal(new Set(textures.map(t=>t.image)).size,30,'all finishes must be visually distinct');
 await page.getByRole('button',{name:'Edit room',exact:true}).click();
 await page.getByText('Floor, walls & background',{exact:true}).click();
 const original=await page.evaluate(()=>structuredClone(window.store.state));
 for(const t of textures) {
  const before=await page.evaluate(()=>structuredClone(window.store.state));
  const pixels=await page.locator('#room canvas').screenshot();
  await page.getByLabel(`${t.target} preset`,{exact:true}).selectOption(t.id);
  await page.waitForTimeout(100);
  assert.notDeepEqual(await page.locator('#room canvas').screenshot(),pixels,`${t.id}: renderer changes visibly`);
  const after=await page.evaluate(()=>structuredClone(window.store.state));
  assert.equal(after.surfaces[t.target].preset,t.id);
  assert.equal(after.lighting,before.lighting);
  for(const other of ['floor','wall','background'].filter(x=>x!==t.target)) assert.deepEqual(after.surfaces[other],before.surfaces?.[other]);
 }
 for(const lighting of [...new Set(textures.map(t=>t.lighting))]) {
  const surfaces=await page.evaluate(()=>structuredClone(window.store.state.surfaces));
  await page.getByLabel('Lighting preset',{exact:true}).selectOption(lighting);
  assert.deepEqual(await page.evaluate(()=>window.store.state.surfaces),surfaces);
  await page.locator('#room-theme').selectOption(`look-${lighting}`);
  await page.getByRole('button',{name:'Close editor',exact:true}).click();
  await page.waitForTimeout(250);
  await page.locator('#room canvas').screenshot({path:`${artifacts}/${lighting}.png`});
  await page.getByRole('button',{name:'Edit room',exact:true}).click();
 }
 const after=await page.evaluate(()=>structuredClone(window.store.state));
 for(const key of ['contentItems','representations','placements','soundtrack']) assert.deepEqual(after[key],original[key]);
 await page.reload();await page.waitForFunction(()=>window.store);
 assert.deepEqual(await page.evaluate(()=>window.store.state),after);
 assert.deepEqual(errors,[]);
 console.log(`PASS: 30 distinct deterministic detailed textures; 30 independent web selections; 10 rendered looks; reload/content preserved; no page errors. Screenshots: ${artifacts}`);
} finally {await browser.close();}
