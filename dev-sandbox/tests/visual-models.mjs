// Run against the existing Vite server; uses an isolated browser, never personal saves.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can override the local browser installation.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/dvgpro/Projects/DataMemoryPalace/node_modules/playwright/index.mjs');
const base = process.env.PREVIEW_URL ?? 'http://localhost:5173';
const out = resolve(process.env.ARTIFACT_DIR ?? `${homedir()}/.hermes/artifacts/misc-palace-model-review`);
await mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless:true,
  args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist']});
const errors = [], screenshots = [], checks = [];
const renderKinds = process.env.MODEL_KINDS?.split(',') ?? ['telescope','motorcycle','recordSleeve','robot'];
const kinds = renderKinds.filter(k => k !== 'landing').slice(0,4);
try {
  const page = await browser.newPage({viewport:{width:720,height:720}, deviceScaleFactor:1});
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/__model_review', route => route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="label" style="position:fixed;top:24px;left:24px;font:20px sans-serif;color:#333"></div></body></html>'}));
  await page.goto(`${base}/__model_review`);
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { buildObject } = await import('/src/views/objects.ts');
    const { getLayout, DEFAULT_LAYOUT_ID } = await import('/src/core/layout.ts');
    const { disposeGroup } = await import('/src/views/resources.ts');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e8e5df');
    scene.add(new THREE.HemisphereLight(0xffffff,0xb6b2aa,2));
    const key = new THREE.DirectionalLight(0xffffff,2.4); key.position.set(3,5,4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff,1); fill.position.set(-3,2,-3); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0xd1cec7,roughness:1}));
    floor.rotation.x = -Math.PI/2; floor.position.y = -.002; scene.add(floor);
    const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(720,720); document.body.append(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-.65,.65,.65,-.65,.01,100);
    let model;
    window.renderModel = (kind,view) => {
      if(model) {scene.remove(model);disposeGroup(model);}
      if(kind === 'landing') {
        model = new THREE.Group();
        const layout=getLayout(DEFAULT_LAYOUT_ID);
        for(const b of layout.boxes.filter(b=>b.id==='loft'||b.id.startsWith('step-'))) {
          const mesh=new THREE.Mesh(new THREE.BoxGeometry(...b.size),new THREE.MeshStandardMaterial({color:layout.palette[b.material]}));
          mesh.position.set(...b.min).add(new THREE.Vector3(...b.size).multiplyScalar(.5));model.add(mesh);
        }
      } else model=buildObject(kind);
      scene.add(model);
      const bounds = new THREE.Box3().setFromObject(model), target=bounds.getCenter(new THREE.Vector3());
      const size=bounds.getSize(new THREE.Vector3());
      const half=Math.max(size.x,size.y,size.z)*.72;
      camera.left=camera.bottom=-half;camera.right=camera.top=half;camera.updateProjectionMatrix();
      const offset = view==='front' ? [0,0,4] : view==='side' ? [4,0,0] : [3,2.1,3];
      camera.position.copy(target).add(new THREE.Vector3(...offset));camera.lookAt(target);
      renderer.render(scene,camera);
      document.querySelector('#label').textContent=`${kind} / ${view} / neutral light`;
      return {kind,view,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
    };
  });
  for (const kind of renderKinds) for (const view of ['front','side','isometric']) {
    const info=await page.evaluate(({kind,view}) => window.renderModel(kind,view),{kind,view});
    assert.ok(info.triangles>0);checks.push(info);
    const path=`${out}/${kind}-${view}.png`;await page.screenshot({path});screenshots.push(path);
  }
  await page.close();
  for (const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'});
    const room=await context.newPage();room.on('pageerror',e=>errors.push(String(e)));
    await room.goto(base);await room.waitForFunction(()=>!!window.store);
    const reps=await room.evaluate(kinds=>{
      const s=window.store;
      // Keep the sample room as context; move the four models to visible loft/floor slots.
      const slots=['loft-2','loft-3','floor-3','floor-4'];
      return kinds.map((kind,i)=>{
        const id=s.addItem({title:`Model review: ${kind}`,sourceRef:'Assembly regression fixture',type:'note',kind:'book'});
        s.setKind(id,kind);
        s.place(id,slots[i]);
        s.unplace(id);
        if(s.slotOf(id)!==undefined) throw new Error('pickup failed');
        s.place(id,slots[i]);
        if(s.slotOf(id)!==slots[i]) throw new Error('placement failed');
        return {id,kind,slot:slots[i]};
      });
    },kinds);
    await room.reload();await room.waitForFunction(()=>!!window.store);
    const saved=await room.evaluate(reps=>reps.every(r=>window.store.state.representations.some(x=>x.id===r.id&&x.objectKind===r.kind)&&window.store.slotOf(r.id)===r.slot),reps);
    assert.ok(saved,'all four assigned kinds and placements survive reload');
    // Collapse navigation through the real UI if open.
    const toggle=room.locator('button').filter({hasText:'Hide menu'});
    if(await toggle.count()) await toggle.first().click();
    await room.waitForTimeout(1200);
    const path=`${out}/room-${device}.png`;await room.screenshot({path});screenshots.push(path);
    checks.push({device,saved,representations:reps});
    for(const rep of reps){
      await room.evaluate(id=>window.store.select(id),rep.id);
      await room.waitForTimeout(1100);
      const path=`${out}/room-${device}-${rep.kind}.png`;await room.screenshot({path});screenshots.push(path);
      await room.getByRole('button',{name:'Pick up',exact:true}).click();
      assert.equal(await room.evaluate(id=>window.store.slotOf(id)??null,rep.id),null,'real UI pickup removes placement');
      await room.evaluate(({id,slot})=>window.store.place(id,slot),rep);
      assert.equal(await room.evaluate(id=>window.store.slotOf(id),rep.id),rep.slot,'picked-up object can be placed again');
      checks.push({device,kind:rep.kind,uiPickup:true,replaced:true});
    }
    await context.close();
  }
  assert.deepEqual(errors,[],'no browser runtime errors');
  await writeFile(`${out}/results.json`,JSON.stringify({base,errors,checks,screenshots},null,2));
  console.log(JSON.stringify({errors,screenshotCount:screenshots.length,out,checks},null,2));
} finally {await browser.close();}
