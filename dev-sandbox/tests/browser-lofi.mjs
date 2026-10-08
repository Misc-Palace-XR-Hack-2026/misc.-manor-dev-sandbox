import { chromium } from '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
  const context = await browser.newContext({ viewport: {width:1440,height:1000} });
  const page = await context.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.store, {timeout:5000});
  await page.getByRole('button', { name: 'Edit room', exact: true }).click();
  const kinds=await page.evaluate(async()=> (await import('/src/core/types.ts')).OBJECT_KINDS);
  for (const kind of ['cat','teapot','lantern','headphones','cassette','cushion']) {
    assert.ok(kinds.includes(kind), `${kind} missing from catalog`);
    assert.equal(await page.locator(`#new-object-kind option[value="${kind}"]`).count(), 1);
  }
  const empty=await page.evaluate(()=>({...window.store.state,contentItems:[],representations:[],placements:[]}));
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'room.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty))});
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
  const clickSlot=async slot=>{const p=await project(slot);await page.mouse.click(p.x,p.y);await page.waitForTimeout(250);};
  const slots=['floor-4','loft-3','floor-2','floor-3','floor-5','loft-1'];
  const imported=['cat','teapot','lantern','headphones','cassette','cushion'];
  for (const kind of imported) {
    await page.getByPlaceholder('Title (optional)').fill(`Test ${kind}`);
    await page.getByPlaceholder('Paste a link, or a file name').fill(`https://example.com/${kind}`);
    await page.getByLabel('Object representation').selectOption(kind);
    await page.getByRole('button',{name:'Add to room',exact:true}).click();
    const row=page.locator('.list .row').filter({has:page.locator('.title',{hasText:`Test ${kind}`})});
    const rep=await page.evaluate(title=>window.store.repFor(window.store.state.contentItems.find(c=>c.title===title).id),`Test ${kind}`);
    await row.getByRole('button',{name:'Pick up',exact:true}).click();
    await clickSlot(slots[imported.indexOf(kind)]);
    assert.equal(await page.evaluate(id=>window.store.slotOf(id),rep.id), slots[imported.indexOf(kind)]);
  }
  await page.waitForTimeout(400);
  await page.screenshot({path:'/home/dvgpro/.hermes/cache/scratch/lofi-objects-review.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: lofi kinds in catalog, added and placed');
} finally { await browser.close(); }
